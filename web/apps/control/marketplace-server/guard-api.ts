import { createHash } from "node:crypto";
import { DeploymentError, diagnosticResponse } from "./diagnostics";

export type GuardMode = "mock" | "live" | "auto";
export function guardConfig(env = process.env) {
  const mode = env.MARKETPLACE_DATA_MODE ?? "mock";
  if (!["mock", "live", "auto"].includes(mode))
    throw new DeploymentError("runtime", "runtime_mode_invalid", "Set MARKETPLACE_DATA_MODE to mock, live or auto.");
  const base = env.GUARD_API_URL?.replace(/\/+$/, "");
  if (mode !== "mock" && !base) throw new DeploymentError("nemo", "nemo_url_missing", "Configure GUARD_API_URL for the NeMo /api/v1 endpoint.", ["GUARD_API_URL"]);
  for (const [setting, url] of [["GUARD_API_URL", base], ["GUARD_POLICY_AUTHORING_URL", env.GUARD_POLICY_AUTHORING_URL]] as const) {
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash)
        throw new Error("Invalid upstream URL");
    } catch { throw new DeploymentError("nemo", "nemo_url_invalid", `Configure a valid HTTP(S) ${setting} without credentials, query or fragment.`, [setting]); }
  }
  const publicOrigin = env.MARKETPLACE_PUBLIC_ORIGIN || undefined;
  try {
    if (publicOrigin && (!/^https?:\/\//.test(publicOrigin) || new URL(publicOrigin).origin !== publicOrigin)) throw new Error();
  } catch { throw new DeploymentError("origin", "public_origin_invalid", "MARKETPLACE_PUBLIC_ORIGIN must be the browser HTTP(S) origin without a path or trailing slash."); }
  const demoToken = env.MARKETPLACE_DEMO_TOKEN?.trim();
  const loopback = (host: string) => ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
  if (demoToken && (
    mode !== "live" || !/^\S+$/.test(demoToken) ||
    !loopback(env.NITRO_HOST ?? env.HOST ?? "") ||
    !base || !loopback(new URL(base).hostname) ||
    !publicOrigin || !loopback(new URL(publicOrigin).hostname) ||
    (env.GUARD_POLICY_AUTHORING_URL && !loopback(new URL(env.GUARD_POLICY_AUTHORING_URL).hostname))
  )) throw new DeploymentError("runtime", "demo_access_unsafe", "Automatic demo connection requires loopback-only live services. Remove MARKETPLACE_DEMO_TOKEN for deployed services.", ["MARKETPLACE_DEMO_TOKEN", "HOST", "GUARD_API_URL", "MARKETPLACE_PUBLIC_ORIGIN"]);
  return {
    mode: mode as GuardMode,
    base,
    authoring: env.GUARD_POLICY_AUTHORING_URL,
    publicOrigin,
    demoToken,
    sourceId: createHash("sha256")
      .update(base ?? "mock")
      .digest("hex")
      .slice(0, 16),
  };
}
export function runtimeResponse(env = process.env, liveRequired = false) {
  try {
    const config = guardConfig(env);
    if (liveRequired && config.mode !== "live") throw new DeploymentError("runtime", "live_mode_required", "Real V3 requires MARKETPLACE_DATA_MODE=live on the API server. Use /v2/guardrails for Mock.");
    return Response.json(
      {
        mode: config.mode,
        sharedDemo: config.mode !== 'live' && env.MARKETPLACE_DEMO_STORAGE !== 'browser',
        browserDemo: config.mode !== 'live' && env.MARKETPLACE_DEMO_STORAGE === 'browser',
        sourceId: config.sourceId,
        policyAuthoring: !!config.authoring || env.MARKETPLACE_CRUD_ONLY === "true",
        crudOnly: env.MARKETPLACE_CRUD_ONLY === "true",
        f5Mock: env.MARKETPLACE_F5_MOCK === "true",
        marketplaceDb: !!(env.MARKETPLACE_DATABASE_URL || env.MARKETPLACE_DB_FILE),
        autoConnect: !!config.demoToken,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return diagnosticResponse(error, "runtime", "runtime.config", "Marketplace runtime configuration is invalid.");
  }
}
function failure(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
// Intentionally not a general-purpose HTTP proxy. No deletes, account changes,
// arbitrary destinations, cookies or redirect following. An explicitly configured
// loopback demo can use its server-held token when no user credential is supplied.
export function allowedGuardRoute(path: string, method: string) {
  const id = "[A-Za-z0-9_.~-]+";
  if (method === "GET")
    return new RegExp(
      `^/(policies|guardrails)(/${id})?$|^/policies/${id}/(draft/checks|validation-runs/(latest|${id}))$|^/validation-runs/${id}$|^/authoring/capabilities$|^/account/identity$`,
    ).test(path);
  if (method === "POST")
    return new RegExp(
      `^/(policies|guardrails)(/${id}/(publish|validation-runs))?$|^/authoring/(intent-analyses|plan-previews)$`,
    ).test(path);
  return (
    method === "PATCH" &&
    new RegExp(`^/(policies|guardrails)/${id}$`).test(path)
  );
}
export async function guardProxy(
  request: Request,
  env = process.env,
  fetcher: typeof fetch = fetch,
) {
  let config: ReturnType<typeof guardConfig>;
  try {
    config = guardConfig(env);
  } catch (error) {
    return diagnosticResponse(error, "nemo", "nemo.proxy.config", "Marketplace connection is not configured correctly.");
  }
  if (config.mode === "mock")
    return failure(409, "mock_mode", "Live connection is disabled.");
  const url = new URL(request.url);
  const authoring = url.pathname === "/api/guard-policy-draft";
  const path = url.pathname.slice("/api/guard".length);
  if (
    authoring
      ? request.method !== "POST"
      : !allowedGuardRoute(path, request.method) && !(env.MARKETPLACE_CRUD_ONLY === "true" && request.method === "DELETE" && /^\/(policies|guardrails)\/[A-Za-z0-9_.~-]+$/.test(path))
  )
    return failure(404, "not_found", "API operation is not available.");
  if (url.search)
    return failure(400, "invalid_query", "Unexpected query parameters.");
  const origin = request.headers.get("origin");
  if (config.demoToken && (
    url.origin !== config.publicOrigin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )) return failure(403, "origin_mismatch", "Local demo requests must use the configured origin.");
  if (origin && origin !== (config.publicOrigin ?? url.origin))
    return failure(
      403,
      "origin_mismatch",
      "Cross-origin requests are not allowed.",
    );
  if (env.MARKETPLACE_CRUD_ONLY === "true" && request.method === "POST" && /\/(publish|validation-runs)$/.test(path))
    return failure(409, "crud_only", "Evaluation and publishing are disabled in CRUD mode.");
  const authorization = request.headers.get("authorization") ??
    (config.demoToken ? `Bearer ${config.demoToken}` : null);
  if (!authorization?.match(/^Bearer [^\s]+$/))
    return failure(401, "unauthorized", "Connect with a Guard access token.");
  if (authoring && !config.authoring)
    return failure(
      501,
      "authoring_unavailable",
      "Rule authoring is not configured.",
    );
  const target = authoring ? config.authoring! : `${config.base}${path}`;
  let body: string | undefined;
  if (request.method !== "GET") {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return failure(415, "invalid_content_type", "JSON is required.");
    body = await request.text();
    if (Buffer.byteLength(body) > 1_000_000)
      return failure(413, "request_too_large", "Request is too large.");
    try {
      JSON.parse(body);
    } catch {
      return failure(400, "invalid_json", "Invalid JSON.");
    }
  }
  try {
    const response = await fetcher(target, {
      method: request.method,
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status >= 300 && response.status < 400)
      return diagnosticResponse(new DeploymentError("nemo", "upstream_redirect", "NeMo returned an unexpected redirect. Check GUARD_API_URL and gateway routing.", undefined, 502), "nemo", "nemo.proxy", "NeMo redirect.");
    if (response.status === 204) return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
    if (!response.headers.get("content-type")?.includes("application/json"))
      return diagnosticResponse(new DeploymentError("nemo", "invalid_response", "Backend did not return JSON. Check GUARD_API_URL and gateway routing.", undefined, 502), "nemo", "nemo.proxy", "Invalid NeMo response.");
    if (!response.ok) {
      await response.body?.cancel();
      return diagnosticResponse(new DeploymentError("nemo", `nemo_http_${response.status}`, `NeMo rejected the request (HTTP ${response.status}). Check authentication, permissions and NeMo logs.`, undefined, response.status), "nemo", "nemo.proxy", "NeMo rejected the request.");
    }
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    // On writes this is an UNCERTAIN outcome, never a reason to create mock data.
    return diagnosticResponse(new DeploymentError("nemo", "upstream_unavailable", request.method === "GET" ? "Cannot connect to Guard. Check GUARD_API_URL, DNS, network and NODE_EXTRA_CA_CERTS." : "Connection lost. Check the saved record before retrying. Check NeMo network and TLS configuration."), "nemo", "nemo.proxy", "NeMo unavailable.");
  }
}
