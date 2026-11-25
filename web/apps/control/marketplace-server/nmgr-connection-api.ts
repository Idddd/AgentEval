import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConnectionStore, connectionBackupPath } from "./nmgr-connection-store";
import {
  connectionEnvironment,
  connectionOrigin,
  connectionSettingsSchema,
  type ConnectionSettings,
} from "./nmgr-connection-config";
import { closeNmgrDatabase, nmgrApi } from "./nmgr-api";
import { databaseCacheKey } from "./storage/config";
import { runtimeResponse } from "./guard-api";
import { DeploymentError, diagnosticResponse } from "./diagnostics";
import { connectionTransport } from "./nmgr-connection-tls";
import { createF5Client, probeF5, f5Configuration } from "./f5-client";
import { withConnectionDiagnostics } from "./connection-diagnostics";
import { probeConnection, type ProbeTarget } from "./connection-probe";
import { connectionTestSchema } from "./nmgr-contract";
import { withNmgrRequestLog } from "./nmgr-request-log";
import { connectionValues } from "./connection-values";
import { nmgrRequestContext } from "./nmgr-request-context";
import { evaluationPolicyStatus } from "./evaluation-connection";

const stores = new Map<string, ConnectionStore>();
const locks = new WeakMap<ConnectionStore, Promise<unknown>>();
const revisionKey = randomBytes(32);
type EvaluationAction = "test" | "save" | "restore" | "start";
type EvaluationStage = "configuration" | "destination" | "network" | "upstream" | "response" | "completed";
type EvaluationLog = {
  time: string; action: EvaluationAction; status: number; durationMs: number; requestId: string;
  stage: EvaluationStage; code?: string; message?: string; upstreamStatus?: number; contentType?: string; networkCode?: string;
};
const evaluationLogs = new WeakMap<ConnectionStore, EvaluationLog[]>();
async function logEvaluation(store: ConnectionStore, action: EvaluationAction, response: Response, started: number) {
  const error = response.ok ? undefined : await response.clone().json().then(body => body?.error).catch(() => undefined);
  const code = typeof error?.code === "string" && /^[a-z0-9_]{1,96}$/.test(error.code) ? error.code as string : undefined;
  const upstream = error?.details?.httpStatus;
  const media = error?.details?.contentType;
  const upstreamStatus = Number.isInteger(upstream) && upstream >= 100 && upstream <= 599 ? upstream as number : undefined;
  const contentType = typeof media === "string" && /^[a-z0-9.+-]{1,40}\/[a-z0-9.+-]{1,48}$/.test(media) ? media : undefined;
  const stage: EvaluationStage = response.ok ? "completed"
    : code === "evaluation_url_not_allowed" || code === "evaluation_token_destination" ? "destination"
    : code === "evaluation_unreachable" ? "network"
    : code === "evaluation_response_invalid" ? "response"
    : upstreamStatus !== undefined ? "upstream" : "configuration";
  const networkCode = stage === "network" && Array.isArray(error?.details?.causes)
    ? error.details.causes.map((cause: { code?: unknown }) => cause?.code)
      .find((value: unknown) => typeof value === "string" && /^[A-Z][A-Z0-9_]{1,79}$/.test(value)) as string | undefined
    : undefined;
  const entry: EvaluationLog = {
    time: new Date().toISOString(), action, status: response.status,
    durationMs: Math.round(performance.now() - started),
    requestId: response.headers.get("X-Request-ID") ?? nmgrRequestContext.getStore()?.requestId ?? randomUUID(),
    stage,
    ...(code ? { code } : {}),
    ...(code?.startsWith("evaluation_") && typeof error.message === "string" ? { message: error.message.slice(0, 600) } : {}),
    ...(upstreamStatus !== undefined ? { upstreamStatus } : {}),
    ...(contentType ? { contentType } : {}),
    ...(networkCode ? { networkCode } : {}),
  };
  evaluationLogs.set(store, [entry, ...(evaluationLogs.get(store) ?? [])].slice(0, 20));
  console.info(JSON.stringify({ event: "evaluation_activity", service: "marketplace", component: "evaluation", ...entry }));
  return response;
}
const probeFields: Record<ProbeTarget, string[]> = {
  nemoUrl: ["nemoUrl", "nemoTls", "caMode", "caPem"],
  nemoToken: ["nemoUrl", "nemoToken", "nemoTls", "caMode", "caPem"],
  databaseUrl: ["databaseUrl", "databaseTls", "caMode", "caPem"],
  f5Url: ["f5Url", "f5Mode", "caMode", "caPem"],
  f5Token: ["f5Url", "f5Token", "f5Mode", "caMode", "caPem"],
  evaluationUrl: ["evaluationUrl", "caMode", "caPem"],
};
function defaultStore(env: NodeJS.ProcessEnv) {
  const dir =
    env.MARKETPLACE_CONNECTION_DIR || join(tmpdir(), "marketplace-connection");
  if (!stores.has(dir)) stores.set(dir, new ConnectionStore(dir));
  return stores.get(dir)!;
}
const savedFor = (env: NodeJS.ProcessEnv, store: ConnectionStore) =>
  env.MARKETPLACE_V3_DEMO === "false" ? Promise.resolve(null) : store.read();
function revision(env: NodeJS.ProcessEnv) {
  return createHmac("sha256", revisionKey)
    .update(
      JSON.stringify([
        env.GUARD_API_URL,
        env.GUARD_API_TOKEN,
        env.GUARD_API_TOKEN_FILE,
        env.GUARD_USERNAME,
        env.GUARD_PASSWORD,
        env.GUARD_PASSWORD_FILE,
        env.MARKETPLACE_NEMO_AUTH_MODE,
        env.MARKETPLACE_DATABASE_URL,
        env.MARKETPLACE_DATABASE_PASSWORD,
        env.MARKETPLACE_DB_TLS,
        env.MARKETPLACE_DB_CA_FILE,
        env.MARKETPLACE_DB_CA_PEM,
        env.MARKETPLACE_CONNECTION_CA_MODE,
        env.MARKETPLACE_CONNECTION_CA_PEM,
        env.MARKETPLACE_NEMO_TLS,
        env.MARKETPLACE_WORKSPACE_ID,
        env.MARKETPLACE_F5_ENABLED,
        env.F5_API_URL,
        env.F5_API_TOKEN,
        env.F5_API_TOKEN_FILE,
        env.F5_PROJECT_ADMIN_IDS,
        env.MARKETPLACE_EVALUATION_URL,
        env.MARKETPLACE_EVALUATION_TOKEN,
        env.MARKETPLACE_EVALUATION_PROJECT_ID,
        env.MARKETPLACE_EVALUATION_BINDINGS,
      ]),
    )
    .digest("hex");
}
function state(effective: NodeJS.ProcessEnv, saved: ConnectionSettings | null) {
  return {
    saved: !!saved,
    configured: {
      nemoUrl: !!effective.GUARD_API_URL,
      nemoToken: !!(
        effective.GUARD_API_TOKEN ||
        effective.GUARD_API_TOKEN_FILE ||
        effective.GUARD_PASSWORD ||
        effective.GUARD_PASSWORD_FILE
      ),
      databaseUrl: !!effective.MARKETPLACE_DATABASE_URL,
      workspaceId: !!effective.MARKETPLACE_WORKSPACE_ID,
      caPem: !!(
        effective.MARKETPLACE_CONNECTION_CA_PEM ||
        effective.MARKETPLACE_DB_CA_FILE ||
        effective.NODE_EXTRA_CA_CERTS
      ),
      f5Url: !!effective.F5_API_URL,
      f5Token: !!(effective.F5_API_TOKEN || effective.F5_API_TOKEN_FILE),
      f5AdminIds: !!effective.F5_PROJECT_ADMIN_IDS,
      evaluationUrl: !!effective.MARKETPLACE_EVALUATION_URL?.trim(),
    },
    advanced: {
      nemoTls: effective.MARKETPLACE_NEMO_TLS || "verify",
      databaseTls: effective.MARKETPLACE_DB_TLS === "true" ? "true" : "url",
      caMode: effective.MARKETPLACE_CONNECTION_CA_MODE || "deployment",
      f5Mode:
        effective.MARKETPLACE_F5_ENABLED === "true" || effective.F5_API_URL
          ? "enabled"
          : "disabled",
    },
    connectionRevision: revision(effective),
    demoRoleSwitching: effective.MARKETPLACE_V3_DEMO === "true",
    manualConfiguration: effective.MARKETPLACE_V3_DEMO === "true",
    persistence:
      effective.MARKETPLACE_CONNECTION_PERSISTENT === "true"
        ? "persistent"
        : "pod",
  };
}
const json = (body: unknown) =>
  Response.json(body, { headers: { "Cache-Control": "no-store" } });
function assertRevision(request: Request, effective: NodeJS.ProcessEnv) {
  const supplied = request.headers.get("x-marketplace-connection");
  if (supplied && supplied !== revision(effective))
    throw new DeploymentError(
      "runtime",
      "connection_changed",
      "The shared demo connection changed. Reconnect before continuing; no command was sent to the new connection.",
      [],
      409,
    );
}
async function closeChanged(
  previous: NodeJS.ProcessEnv,
  next: NodeJS.ProcessEnv,
) {
  if (databaseCacheKey(previous) !== databaseCacheKey(next))
    await closeNmgrDatabase(previous).catch(() => {});
}

export async function v3RuntimeResponse(
  request: Request,
  env = process.env,
  store = defaultStore(env),
) {
  try {
    const saved = await savedFor(env, store),
      effective = connectionEnvironment(request, env, saved ?? {}, true);
    const response = runtimeResponse(effective, true);
    if (!response.ok) return response;
    return json({ ...(await response.json()), ...state(effective, saved) });
  } catch (error) {
    return diagnosticResponse(
      error,
      "runtime",
      "connection.runtime",
      "Connection settings are unavailable.",
    );
  }
}

export async function nmgrRequest(
  request: Request,
  env = process.env,
  fetcher: typeof fetch = fetch,
  store = defaultStore(env),
) {
  return withNmgrRequestLog(request, () => handleNmgrRequest(request, env, fetcher, store));
}

async function handleNmgrRequest(
  request: Request,
  env = process.env,
  fetcher: typeof fetch = fetch,
  store = defaultStore(env),
) {
  if (["/api/nmgr/connection", "/api/nmgr/connection/test", "/api/nmgr/connection/evaluation", connectionBackupPath].includes(new URL(request.url).pathname))
    return connectionApi(request, env, fetcher, store);
  try {
    const saved = await savedFor(env, store),
      // Strict resource requests validate their browser origin and any CORS
      // preflight in nmgrApi. Other routes keep the same-origin boundary here.
      effective = env.MARKETPLACE_V3_DEMO === "false" && new URL(request.url).pathname.startsWith("/api/nmgr/v1/")
        ? env : connectionEnvironment(request, env, saved ?? {}, true);
    assertRevision(request, effective);
    const transport = connectionTransport(effective, fetcher);
    try {
      const started = performance.now();
      const response = await withConnectionDiagnostics(effective, `nmgr.${new URL(request.url).pathname.split("/").pop()}`, () => nmgrApi(request, effective, transport.fetcher));
      return new URL(request.url).pathname === "/api/nmgr/guardrail-evaluation" && request.method === "POST"
        ? await logEvaluation(store, "start", response, started) : response;
    } finally {
      await transport.close();
    }
  } catch (error) {
    return diagnosticResponse(
      error,
      "runtime",
      "connection.request",
      "Connection settings are unavailable.",
    );
  }
}

export async function connectionApi(
  request: Request,
  env = process.env,
  fetcher: typeof fetch = fetch,
  store = defaultStore(env),
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const testing = path === "/api/nmgr/connection/test";
  const evaluationOnly = path === "/api/nmgr/connection/evaluation";
  const backup = path === connectionBackupPath;
  let target: ProbeTarget | undefined;
  let evaluationAction: EvaluationAction | undefined;
  const started = performance.now();
  const finish = (response: Response) => evaluationAction ? logEvaluation(store, evaluationAction, response, started) : response;
  try {
    const origin = connectionOrigin(request, env);
    if (testing && request.method !== "POST") throw new DeploymentError("runtime", "connection_method_invalid", "Use POST to test a connection.", [], 405);
    if (backup) {
      if (env.MARKETPLACE_V3_DEMO === "false")
        throw new DeploymentError("runtime", "manual_configuration_disabled", "Connection backups are available for saved Demo settings.", [], 403);
      if (!["GET", "POST"].includes(request.method))
        throw new DeploymentError("runtime", "connection_method_invalid", "Use GET to export and POST to import a connection backup.", [], 405);
      if (request.method === "POST" && request.headers.get("origin") !== origin)
        throw new DeploymentError("origin", "origin_mismatch", "Import a connection backup from the Marketplace origin.", undefined, 403);
      if (request.method === "GET") {
        const settings = await store.read();
        if (!settings || !Object.keys(settings).length)
          throw new DeploymentError("runtime", "connection_backup_empty", "Save manual connection settings before exporting a backup.", [], 404);
        const effective = connectionEnvironment(request, env, settings, true);
        assertRevision(request, effective);
        return json(await store.exportBackup({ settings, nemoUrl: effective.GUARD_API_URL, f5Url: effective.F5_API_URL }));
      }
    }
    if (request.method === "GET" && !evaluationOnly) {
      const saved = await savedFor(env, store);
      const effective = connectionEnvironment(request, env, saved ?? {}, true);
      const result = state(effective, saved);
      const values = connectionValues(effective, connectionEnvironment(request, env), saved);
      for (const key of ["nemoToken", "f5Token"] as const)
        if (key !== "nemoToken" || effective.MARKETPLACE_NEMO_AUTH_MODE !== "password")
          result.configured[key] = values[key]!.effective.status === "loaded";
      result.configured.evaluationUrl = values.evaluationUrl!.effective.status === "loaded";
      return json({
        ...result, values,
        ...(result.manualConfiguration ? { evaluationPolicy: evaluationPolicyStatus(env), evaluationLogs: evaluationLogs.get(store) ?? [] } : {}),
      });
    }
    if (!["POST", "DELETE"].includes(request.method))
      throw new DeploymentError(
        "runtime",
        "connection_method_invalid",
        "Use GET, POST or DELETE for demo connection settings.",
        [],
        405,
      );
    if (env.MARKETPLACE_V3_DEMO === "false")
      throw new DeploymentError(
        "runtime",
        "manual_configuration_disabled",
        "Manual configuration is available only in the demo integration mode.",
        [],
        403,
      );
    let input: ConnectionSettings = {};
    let snapshot: Awaited<ReturnType<ConnectionStore["importBackup"]>> | undefined;
    if (request.method === "POST") {
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        throw new DeploymentError(
          "runtime",
          "connection_fields_invalid",
          "Provide JSON connection settings.",
          [],
          415,
        );
      const raw = await request.text();
      if (Buffer.byteLength(raw) > (backup ? 165_000 : 100_000))
        throw new DeploymentError(
          "runtime",
          "connection_fields_invalid",
          "Connection settings exceed the size limit.",
          [],
          413,
        );
      try {
        const payload = JSON.parse(raw);
        if (backup) {
          snapshot = await store.importBackup(payload);
          input = snapshot.settings;
        } else if (testing) {
          const parsed = connectionTestSchema.parse(payload);
          target = parsed.target;
          input = Object.fromEntries(Object.entries(parsed.settings ?? {}).filter(([key]) => probeFields[target!].includes(key)));
        } else {
          input = connectionSettingsSchema.parse(payload);
          if (evaluationOnly && (!input.evaluationUrl || Object.keys(input).length !== 1)) throw new Error("Expected only the Evaluate URL");
        }
      } catch (error) {
        if (backup) {
          if (error instanceof DeploymentError) throw error;
          throw new DeploymentError("runtime", "connection_backup_invalid", "Choose a valid Marketplace connection backup JSON file.", [], 422);
        }
        throw new DeploymentError(
          "runtime",
          "connection_fields_invalid",
          evaluationOnly ? "Provide only a non-empty Evaluate URL." : "Provide valid connection fields from this page. Workspace ID allows 1–24 lowercase letters, numbers or hyphens.",
          evaluationOnly ? ["MARKETPLACE_EVALUATION_URL"] : ["GUARD_API_URL", "GUARD_API_TOKEN", "MARKETPLACE_DATABASE_URL"],
          422,
        );
      }
    }
    if (evaluationOnly || target === "evaluationUrl" || input.evaluationUrl) {
      evaluationAction = target === "evaluationUrl" ? "test" : evaluationOnly && request.method === "DELETE" ? "restore" : "save";
      if (request.headers.get("origin") !== origin)
        throw new DeploymentError("origin", "origin_mismatch", "Configure and test Evaluate from the Marketplace origin.", undefined, 403);
    }
    const operation = async () => {
      let saved: ConnectionSettings | null;
      try {
        saved = await store.read();
      } catch (error) {
        if (
          (request.method !== "DELETE" || evaluationOnly) &&
          !(input.nemoUrl && input.nemoToken && input.databaseUrl)
        )
          throw error;
        saved = null;
      }
      const previous = connectionEnvironment(request, env, saved ?? {}, true);
      assertRevision(request, previous);
      const credentialSource = backup ? env : previous;
      if (evaluationOnly) {
        const candidate = { ...saved };
        if (request.method === "DELETE") delete candidate.evaluationUrl;
        else candidate.evaluationUrl = input.evaluationUrl!.trim();
        const effective = connectionEnvironment(request, env, candidate);
        if (request.method === "POST") {
          const transport = connectionTransport(effective, fetcher);
          try {
            const failure = await withConnectionDiagnostics(effective, "connection.save.evaluation", async () => {
              try { await probeConnection("evaluationUrl", effective, transport.fetcher); }
              catch (error) { return diagnosticResponse(error, "evaluation", "connection.save.evaluation", "Evaluate connection failed."); }
              return null;
            });
            if (failure) return failure;
          } finally { await transport.close(); }
        }
        if (Object.keys(candidate).length) await store.save(candidate);
        else if (saved) await store.clear();
        return json(state(effective, Object.keys(candidate).length ? candidate : null));
      }
      if (request.method === "DELETE") {
        await store.clear();
        const effective = connectionEnvironment(request, env);
        await closeChanged(previous, effective);
        return json(state(effective, null));
      }
      if (
        input.nemoUrl &&
        target !== "nemoUrl" &&
        input.nemoUrl.replace(/\/+$/, "") !==
          credentialSource.GUARD_API_URL?.replace(/\/+$/, "") &&
        !input.nemoToken
      )
        throw new DeploymentError(
          "nemo",
          "connection_token_required",
          "Enter a Token when changing the NeMo URL. Existing saved or Secret credentials are never sent to a new destination.",
          ["GUARD_API_URL", "GUARD_API_TOKEN"],
          422,
        );
      const candidate = backup ? input : {
        ...saved,
        ...Object.fromEntries(
          Object.entries(input).filter(([, value]) => !!value),
        ),
      };
      if (
        candidate.f5Mode !== "disabled" &&
        input.f5Url &&
        target !== "f5Url" &&
        input.f5Url.replace(/\/+$/, "") !==
          credentialSource.F5_API_URL?.replace(/\/+$/, "") &&
        !input.f5Token
      )
        throw new DeploymentError(
          "f5",
          "connection_token_required",
          "Enter an F5 Token when changing the F5 URL. Existing credentials are never sent to a new destination.",
          ["f5Url", "f5Token"],
          422,
        );
      const effective = connectionEnvironment(request, env, candidate, target !== "evaluationUrl" && !input.evaluationUrl);
      if (snapshot && (
        input.nemoToken && effective.GUARD_API_URL !== snapshot.nemoUrl ||
        input.f5Token && effective.F5_API_URL && effective.F5_API_URL !== snapshot.f5Url
      )) throw new DeploymentError("runtime", "connection_backup_destination_changed",
        "A deployment URL changed since this backup was exported. Re-enter the affected connection credentials before using the new URL.", [], 422);
      const transport = connectionTransport(effective, fetcher);
      if (target) {
        try {
          return await withConnectionDiagnostics(effective, `connection.test.${target}`, async () => {
            try { return json(await probeConnection(target!, effective, transport.fetcher)); }
            catch (error) { return diagnosticResponse(error, target === "evaluationUrl" ? "evaluation" : target === "databaseUrl" ? "database" : target!.startsWith("f5") ? "f5" : "nemo", `connection.test.${target}`, "Connection test failed. Inspect the diagnostic details."); }
          });
        } finally { await transport.close(); }
      }
      let probe: Response;
      try {
        probe = await withConnectionDiagnostics(effective, "connection.save", () => nmgrApi(
          new Request(new URL("/api/nmgr/workspace", request.url)),
          effective,
          transport.fetcher,
        ));
        if (
          probe.ok &&
          candidate.f5Mode !== "disabled" &&
          (input.f5Mode || input.f5Url || input.f5Token || input.f5AdminIds)
        ) {
          const f5 = f5Configuration(effective);
          if (f5)
            await withConnectionDiagnostics(effective, "connection.save.f5", async () => {
              try { await probeF5(createF5Client(f5, transport.fetcher)); }
              catch (error) { probe = diagnosticResponse(error, "f5", "connection.save.f5", "F5 connection failed."); }
            });
        }
        if (probe.ok && input.evaluationUrl) {
          await withConnectionDiagnostics(effective, "connection.save.evaluation", async () => {
            try { await probeConnection("evaluationUrl", effective, transport.fetcher); }
            catch (error) { probe = diagnosticResponse(error, "evaluation", "connection.save.evaluation", "Evaluate connection failed."); }
          });
        }
      } catch (error) {
        await closeChanged(effective, previous);
        throw error;
      } finally {
        await transport.close();
      }
      if (!probe.ok) {
        await closeChanged(effective, previous);
        return probe;
      }
      try {
        await store.save(candidate);
      } catch (error) {
        await closeChanged(effective, previous);
        throw error;
      }
      await closeChanged(previous, effective);
      console.info(
        JSON.stringify({
          event: "demo_connection_saved",
          component: "runtime",
        }),
      );
      return json(state(effective, candidate));
    };
    const prior = locks.get(store) ?? Promise.resolve();
    const next = prior.catch(() => {}).then(operation);
    locks.set(
      store,
      next.catch(() => {}),
    );
    return await finish(await next);
  } catch (error) {
    return await finish(diagnosticResponse(
      error,
      "runtime",
      "connection.settings",
      "Connection settings could not be applied. Check the configured dependencies and storage.",
    ));
  }
}
