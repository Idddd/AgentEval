import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  readDocument: vi.fn(async () => undefined),
  close: vi.fn(),
  exclusive: async (fn: () => Promise<any>) => fn(),
}));
vi.mock("./storage/database", () => ({ openDatabase: async () => db }));
import { ConnectionStore } from "./nmgr-connection-store";
import {
  connectionApi as handleConnectionApi,
  nmgrRequest as handleNmgrRequest,
  v3RuntimeResponse as handleV3RuntimeResponse,
} from "./nmgr-connection-api";
import { assertOpenApiResponse, assertOpenApiSchema } from "./test-utils/openapi";
async function connectionApi(...args: Parameters<typeof handleConnectionApi>) { const response = await handleConnectionApi(...args); await assertOpenApiResponse(args[0], response); return response; }
async function nmgrRequest(...args: Parameters<typeof handleNmgrRequest>) { const response = await handleNmgrRequest(...args); await assertOpenApiResponse(args[0], response); return response; }
async function v3RuntimeResponse(...args: Parameters<typeof handleV3RuntimeResponse>) { const response = await handleV3RuntimeResponse(...args); assertOpenApiSchema(response.ok ? "RuntimeStatus" : "ErrorResponse", await response.clone().json()); return response; }
const env = {
  GUARD_API_URL: "https://nemo.private/api/v1",
  GUARD_API_TOKEN: "secret-business-token",
  MARKETPLACE_DATABASE_URL:
    "postgres://app:private-password@db.private/marketplace",
};
const identity = vi.fn<typeof fetch>(async () =>
  Response.json({ userId: "real-nemo-user", role: "user" }),
);
const dirs: string[] = [];
async function store() {
  const dir = await mkdtemp(join(tmpdir(), "nmgr-settings-"));
  dirs.push(dir);
  return new ConnectionStore(dir);
}
const request = (path: string, role?: string) =>
  new Request(`https://ui.internal/api/nmgr/${path}`, {
    headers: role ? { "X-Marketplace-Role": role } : {},
  });
const save = (body: unknown, origin = "https://ui.internal") =>
  new Request("https://ui.internal/api/nmgr/connection", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const testConnection = (target: string, settings = {}) => new Request("https://ui.internal/api/nmgr/connection/test", {
  method: "POST", headers: { Origin: "https://ui.internal", "Content-Type": "application/json" },
  body: JSON.stringify({ target, settings }),
});

it("tests NeMo URL without a token or database and never saves the candidate", async () => {
  const saved = await store();
  const response = await nmgrRequest(testConnection("nemoUrl", { nemoUrl: env.GUARD_API_URL }), {},
    async (_url, init) => {
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return Response.json({ error: { code: "unauthenticated" } }, { status: 401 });
    }, saved);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, target: "nemoUrl", httpStatus: 401 });
  expect(await saved.read()).toBeNull();
});
it("accepts connection probes and workspace requests through an ingress that rewrites Host", async () => {
  const saved = await store();
  const runtime = { ...env, MARKETPLACE_V3_DEMO: "true", MARKETPLACE_PUBLIC_ORIGIN: "https://ui.internal" };
  const proxy = "http://marketplace-service:8080";
  const headers = { Origin: runtime.MARKETPLACE_PUBLIC_ORIGIN, "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" };
  const probe = (origin: string) => new Request(`${proxy}/api/nmgr/connection/test`, {
    method: "POST", headers: { ...headers, Origin: origin },
    body: JSON.stringify({ target: "nemoUrl", settings: { nemoUrl: env.GUARD_API_URL } }),
  });
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({}, { status: 401 }));
  const success = await nmgrRequest(probe(runtime.MARKETPLACE_PUBLIC_ORIGIN), runtime, fetcher, saved);
  expect(success.status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const reject = await nmgrRequest(probe("https://untrusted.internal"), runtime, fetcher, saved);
  expect(reject.status).toBe(403);
  expect((await reject.json()).error.code).toBe("origin_mismatch");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await saved.read()).toBeNull();
  const workspace = await nmgrRequest(new Request(`${proxy}/api/nmgr/workspace`, { headers }), runtime, identity, saved);
  expect(workspace.status).toBe(200);
});
it("tests an approved Evaluate address without NeMo, writes no settings, and returns a sanitized activity log", async () => {
  const saved = await store();
  const settings = { MARKETPLACE_EVALUATION_ALLOWED_URLS: "https://eval.internal" };
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(String(url)).toBe("https://eval.internal/api/v1/evaluations/targets?limit=1");
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
    return Response.json({ total: 1, items: [{ id: "guard-one", private: "omitted contents" }] });
  });
  expect((await nmgrRequest(testConnection("evaluationUrl", { evaluationUrl: "https://eval.internal" }), settings, fetcher, saved)).status).toBe(200);
  const rejected = await nmgrRequest(testConnection("evaluationUrl", { evaluationUrl: "https://other.internal" }), settings, fetcher, saved);
  expect(rejected.status).toBe(422);
  expect((await rejected.json()).error.code).toBe("evaluation_url_not_allowed");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await saved.read()).toBeNull();
  const status = await (await nmgrRequest(request("connection"), settings, fetcher, saved)).json();
  expect(status.evaluationLogs).toMatchObject([{ action: "test", status: 422, code: "evaluation_url_not_allowed", requestId: expect.any(String) }, { action: "test", status: 200 }]);
  expect(JSON.stringify(status.evaluationLogs)).not.toMatch(/other\.internal|omitted contents/);
});
it("pins an Evaluate deployment Token to its URL and saves only a validated Evaluate connection", async () => {
  const saved = await store();
  const settings = { ...env, MARKETPLACE_EVALUATION_URL: "https://eval.internal", MARKETPLACE_EVALUATION_ALLOWED_URLS: "https://other.internal", MARKETPLACE_EVALUATION_TOKEN: "server-eval-only" };
  let bad = true;
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith("/account/identity")) return identity(url, init);
    expect(String(url)).toBe("https://eval.internal/api/v1/evaluations/targets?limit=1");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer server-eval-only");
    return bad ? Response.json({ detail: "upstream body must not be logged" }, { status: 403 }) : Response.json({ items: [], total: 0 });
  });
  const other = await nmgrRequest(testConnection("evaluationUrl", { evaluationUrl: "https://other.internal" }), settings, fetcher, saved);
  expect((await other.json()).error.code).toBe("evaluation_token_destination");
  expect(fetcher).not.toHaveBeenCalled();
  const blocked = await nmgrRequest(save({ evaluationUrl: "https://eval.internal" }), settings, fetcher, saved);
  expect(blocked.status).toBe(502);
  expect((await blocked.json()).error.code).toBe("evaluation_credentials");
  expect(await saved.read()).toBeNull();
  bad = false;
  expect((await nmgrRequest(save({ evaluationUrl: "https://eval.internal" }), settings, fetcher, saved)).status).toBe(200);
  expect(await saved.read()).toEqual({ evaluationUrl: "https://eval.internal" });
  const status = await (await nmgrRequest(request("connection"), settings, fetcher, saved)).json();
  expect(status.configured.evaluationUrl).toBe(true);
  expect(status.evaluationLogs).toMatchObject([{ action: "save", status: 200 }, { action: "save", status: 502, code: "evaluation_credentials" }, { action: "test", status: 422, code: "evaluation_token_destination" }]);
  expect(JSON.stringify(status)).not.toMatch(/server-eval-only|upstream body/);
});
it("switches between a deployment URL and an explicit Evaluate fallback without checking or replacing NeMo and database settings", async () => {
  const saved = await store();
  const otherSettings = { databaseUrl: "postgres://test:test@db.private/marketplace", nemoUrl: "https://nemo.private/api/v1", nemoToken: "existing-private-token" };
  await saved.save(otherSettings);
  const settings = { MARKETPLACE_EVALUATION_URL: "https://primary.internal", MARKETPLACE_EVALUATION_ALLOWED_URLS: "https://backup.internal" };
  const fetcher = vi.fn<typeof fetch>(async url => {
    expect(String(url)).toBe("https://backup.internal/api/v1/evaluations/targets?limit=1");
    return Response.json({ items: [], total: 0 });
  });
  const modify = (method: string, revision?: string, body?: object) =>
    new Request("https://ui.internal/api/nmgr/connection/evaluation", { method, headers: {
      Origin: "https://ui.internal", "Content-Type": "application/json",
      ...(revision ? { "X-Marketplace-Connection": revision } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const current = () => nmgrRequest(request("connection"), settings, fetcher, saved).then(response => response.json());
  const before = await current();
  expect(before.values.evaluationUrl).toMatchObject({ overridden: false, effective: { preview: "https://primary.internal/api/v1/evaluations" } });
  const fallback = await nmgrRequest(modify("POST", before.connectionRevision, { evaluationUrl: "https://backup.internal" }), settings, fetcher, saved);
  expect(fallback.status).toBe(200);
  expect(await saved.read()).toEqual({ ...otherSettings, evaluationUrl: "https://backup.internal" });
  const active = await current();
  expect(active.values.evaluationUrl).toMatchObject({ overridden: true, effective: { preview: "https://backup.internal/api/v1/evaluations" } });
  expect((await nmgrRequest(modify("DELETE", before.connectionRevision), settings, fetcher, saved)).status).toBe(409);
  expect((await nmgrRequest(modify("DELETE", active.connectionRevision), settings, fetcher, saved)).status).toBe(200);
  expect(await saved.read()).toEqual(otherSettings);
  expect((await current()).values.evaluationUrl).toEqual(before.values.evaluationUrl);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("keeps V3 online when a saved fallback is no longer approved, without silently using the deployment backend", async () => {
  const saved = await store();
  await saved.save({ evaluationUrl: "https://retired.internal", workspaceId: "kept" });
  const settings = { ...env, MARKETPLACE_EVALUATION_URL: "https://primary.internal" };
  const status = await (await nmgrRequest(request("connection"), settings, identity, saved)).json();
  expect(status.values.evaluationUrl).toMatchObject({ overridden: true, effective: { status: "invalid", code: "evaluation_fallback_unavailable" } });
  expect((await (await v3RuntimeResponse(request("workspace"), settings, saved)).json()).independentEvaluation).toBe(false);
  expect((await nmgrRequest(request("workspace", "IT Admin"), settings, identity, saved)).status).toBe(200);
  const restore = new Request("https://ui.internal/api/nmgr/connection/evaluation", { method: "DELETE", headers: { Origin: "https://ui.internal" } });
  expect((await nmgrRequest(restore, settings, identity, saved)).status).toBe(200);
  expect(await saved.read()).toEqual({ workspaceId: "kept" });
  expect((await (await v3RuntimeResponse(request("workspace"), settings, saved)).json()).independentEvaluation).toBe(true);
});
it("tests Token independently, rejects HTML and does not accept identity without policies/guardrails write access", async () => {
  const saved = await store();
  for (const upstream of [new Response("<html>login</html>", { headers: { "Content-Type": "text/html" } }), Response.json({ userId: "u", effectivePermissions: { policies: "read" } })]) {
    const response = await nmgrRequest(testConnection("nemoToken"), { GUARD_API_URL: env.GUARD_API_URL, GUARD_API_TOKEN: env.GUARD_API_TOKEN }, async () => upstream, saved);
    expect(response.ok).toBe(false);
    expect((await response.json()).error.component).toBe("nemo");
  }
  const success = await nmgrRequest(testConnection("nemoToken"), { GUARD_API_URL: env.GUARD_API_URL, GUARD_API_TOKEN: env.GUARD_API_TOKEN },
    async () => Response.json({ userId: "u", effectivePermissions: { policies: "write", guardrails: "write" } }), saved);
  expect(success.status).toBe(200);
  expect(await saved.read()).toBeNull();
});
it("retains nested connection errors in both response and log, with credentials redacted", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store();
  const response = await nmgrRequest(testConnection("nemoToken"), env, async () => {
    throw new TypeError("fetch failed", { cause: Object.assign(new Error(`connect ECONNREFUSED token=${env.GUARD_API_TOKEN}`), { code: "ECONNREFUSED", syscall: "connect" }) });
  }, saved);
  const body = await response.json();
  expect(body.error).toMatchObject({ component: "nemo", details: { causes: expect.arrayContaining([expect.objectContaining({ code: "ECONNREFUSED" })]) } });
  expect(JSON.stringify(log.mock.calls)).toContain("ECONNREFUSED");
  expect(JSON.stringify([body, log.mock.calls])).not.toContain(env.GUARD_API_TOKEN);
});
it("does not forward existing tokens to changed probe destinations", async () => {
  const response = await nmgrRequest(testConnection("nemoToken", { nemoUrl: "https://other.test/api/v1" }), env, identity, await store());
  expect(response.status).toBe(422);
  expect(identity).not.toHaveBeenCalled();
});
it("ignores unrelated changed URLs when an external UI submits its complete form for a single probe", async () => {
  const response = await nmgrRequest(testConnection("databaseUrl", { databaseUrl: "invalid-db-url", nemoUrl: "https://changed.test/api/v1", f5Url: "https://changed-f5.test/backend/v1" }), env, identity, await store());
  expect((await response.json()).error).toMatchObject({ component: "database", code: "database_config_invalid" });
  expect(identity).not.toHaveBeenCalled();
});
afterEach(async () => {
  vi.restoreAllMocks();
  identity.mockClear();
  db.close.mockClear();
  db.readDocument.mockReset().mockResolvedValue(undefined);
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

it("enters a server-verified demo with three inputs, no SSO/mapping and switchable roles", async () => {
  const saved = await store();
  const config = await (
    await v3RuntimeResponse(request("workspace"), env, saved)
  ).json();
  expect(config).toMatchObject({
    mode: "live",
    demoRoleSwitching: true,
    connectionRevision: expect.any(String),
  });
  const snapshots = [];
  for (const role of ["User", "User Admin", "IT Admin"]) {
    const response = await nmgrRequest(
      request("workspace", role),
      env,
      identity,
      saved,
    );
    expect(response.status).toBe(200);
    const snapshot = await response.json();
    expect(snapshot).toMatchObject({ accessMode: "demo", actor: { role } });
    snapshots.push(snapshot);
  }
  expect(new Set(snapshots.map((s) => s.actor.id)).size).toBe(3);
  expect(
    new Headers(identity.mock.calls[0]![1]?.headers).get("authorization"),
  ).toBe("Bearer secret-business-token");
});
it("returns only masked-state metadata and persists explicit overrides for other clients", async () => {
  const saved = await store();
  const override = {
    nemoUrl: "https://replacement.private/api/v1",
    nemoToken: "replacement-private-token",
    databaseUrl:
      "mariadb://app:replacement-password@replacement.private/marketplace",
  };
  const response = await connectionApi(save(override), {}, identity, saved);
  expect(response.status).toBe(200);
  const text = await response.text();
  for (const value of Object.values(override))
    expect(text).not.toContain(value);
  expect(await saved.read()).toEqual(override);
  const state = await (
    await connectionApi(request("connection"), {}, identity, saved)
  ).json();
  expect(state).toMatchObject({
    saved: true,
    configured: { nemoUrl: true, nemoToken: true, databaseUrl: true },
  });
  const workspace = await nmgrRequest(
    request("workspace", "IT Admin"),
    {},
    identity,
    saved,
  );
  expect(workspace.status).toBe(200);
});
it("reports unreadable Secret files as unconfigured and validates diagnostic response against Swagger", async () => {
  const response = await connectionApi(request("connection"), { GUARD_API_TOKEN_FILE: "/missing-nemo-secret", F5_API_TOKEN_FILE: "/missing-f5-secret" }, identity, await store());
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(body.configured).toMatchObject({ nemoToken: false, f5Token: false });
  expect(body.values.nemoToken.effective).toMatchObject({ status: "unreadable", code: "ENOENT" });
  expect(identity).not.toHaveBeenCalled();
});
it("preserves working settings on a failed dependency check and does not expose driver details", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store(),
    working = {
      nemoUrl: env.GUARD_API_URL,
      nemoToken: env.GUARD_API_TOKEN,
      databaseUrl: env.MARKETPLACE_DATABASE_URL,
    };
  await saved.save(working);
  db.readDocument.mockRejectedValueOnce(
    new Error("private-password driver detail"),
  );
  const response = await connectionApi(
    save({ nemoToken: "new-token" }),
    {},
    identity,
    saved,
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private-password");
  expect(await saved.read()).toEqual(working);
});
it("rejects cross-origin configuration changes before contacting dependencies", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store();
  expect(
    (
      await connectionApi(
        save({ nemoUrl: env.GUARD_API_URL }, "https://other.internal"),
        env,
        identity,
        saved,
      )
    ).status,
  ).toBe(403);
  expect(identity).not.toHaveBeenCalled();
  expect(await saved.read()).toBeNull();
});
it("never sends an existing deployment or saved token to a changed NeMo destination", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store();
  for (const previous of [
    null,
    { nemoUrl: env.GUARD_API_URL, nemoToken: "saved-private-token" },
  ]) {
    if (previous) await saved.save(previous);
    const response = await connectionApi(
      save({ nemoUrl: "https://other.private/api/v1" }),
      env,
      identity,
      saved,
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe(
      "connection_token_required",
    );
  }
  expect(identity).not.toHaveBeenCalled();
});
it("ignores saved demo overrides and broken demo storage in strict identity mode", async () => {
  const saved = await store();
  vi.spyOn(saved, "read").mockRejectedValue(new Error("Corrupt demo settings"));
  const strict = {
    ...env,
    MARKETPLACE_V3_DEMO: "false",
    MARKETPLACE_DATA_MODE: "live",
    MARKETPLACE_PUBLIC_ORIGIN: "https://ui.internal",
    MARKETPLACE_V2_ACCOUNTS_JSON: JSON.stringify({
      "real-nemo-user": { name: "Explicit User", role: "User", unit: "ISS" },
    }),
  };
  const config = await v3RuntimeResponse(request("workspace"), strict, saved);
  expect(config.status).toBe(200);
  expect((await config.json()).manualConfiguration).toBe(false);
  const response = await nmgrRequest(
    new Request("https://ui.internal/api/nmgr/workspace", {
      headers: { Authorization: "Bearer explicit-user-token" },
    }),
    strict,
    async () =>
      Response.json({
        userId: "real-nemo-user",
        role: "user",
        effectivePermissions: { policies: "read", guardrails: "read" },
      }),
    saved,
  );
  expect(response.status).toBe(200);
  expect(saved.read).not.toHaveBeenCalled();
});
it("rejects stale browser commands after shared connection configuration changes", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store();
  const config = await (
    await v3RuntimeResponse(request("workspace"), env, saved)
  ).json();
  await saved.save({ nemoToken: "new-configured-token" });
  const response = await nmgrRequest(
    new Request("https://ui.internal/api/nmgr/commands", {
      method: "POST",
      headers: {
        Origin: "https://ui.internal",
        "Content-Type": "application/json",
        "X-Marketplace-Connection": config.connectionRevision,
      },
      body: "{}",
    }),
    env,
    identity,
    saved,
  );
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("connection_changed");
  expect(identity).not.toHaveBeenCalled();
});
it("repairs optional deployment blockers on the same connection endpoint without returning advanced values", async () => {
  const saved = await store();
  const response = await connectionApi(
    save({
      workspaceId: "uat-fixed",
      databaseTls: "url",
      caMode: "system",
      f5Mode: "disabled",
    }),
    {
      ...env,
      MARKETPLACE_WORKSPACE_ID: "bad namespace",
      MARKETPLACE_DB_TLS: "true",
      MARKETPLACE_DB_CA_FILE: "/missing/ca.crt",
      MARKETPLACE_F5_ENABLED: "true",
      F5_API_URL: "invalid",
    },
    identity,
    saved,
  );
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).not.toContain("uat-fixed");
  expect(JSON.parse(text)).toMatchObject({
    advanced: { caMode: "system", f5Mode: "disabled", databaseTls: "url" },
  });
});
it("requires fresh F5 credentials at a changed destination and does not overwrite working settings", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store();
  await saved.save({
    f5Mode: "enabled",
    f5Url: "https://old.private/backend/v1",
    f5Token: "old-token",
  });
  const response = await connectionApi(
    save({ f5Url: "https://new.private/backend/v1" }),
    env,
    identity,
    saved,
  );
  expect(response.status).toBe(422);
  expect(identity).not.toHaveBeenCalled();
  expect((await saved.read())?.f5Token).toBe("old-token");
});
it("validates optional F5 before saving and preserves the old connection when F5 rejects the token", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store();
  await saved.save({ nemoToken: env.GUARD_API_TOKEN });
  const previous = await saved.read();
  const fetcher = vi.fn<typeof fetch>(async (input) =>
    String(input).includes("/backend/v1/")
      ? Response.json({}, { status: 403 })
      : Response.json({ userId: "real-user" }),
  );
  const response = await connectionApi(
    save({
      f5Mode: "enabled",
      f5Url: "https://f5.private/backend/v1",
      f5Token: "rejected-private-token",
    }),
    env,
    fetcher,
    saved,
  );
  expect(response.status).toBe(403);
  expect(await saved.read()).toEqual(previous);
  expect(await response.text()).not.toContain("rejected-private-token");
});
it("does not save malformed CA material or return its plaintext", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const saved = await store();
  const response = await connectionApi(
    save({ caMode: "custom", caPem: "private-invalid-certificate" }),
    env,
    identity,
    saved,
  );
  expect(response.status).toBe(422);
  expect(await response.text()).not.toContain("private-invalid-certificate");
  expect(await saved.read()).toBeNull();
  expect(identity).not.toHaveBeenCalled();
});
