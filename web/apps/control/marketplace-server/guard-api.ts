import { createHash } from "node:crypto";

export type GuardMode = "mock" | "live" | "auto";
export function guardConfig(env = process.env) {
  const mode = env.MARKETPLACE_DATA_MODE ?? "mock";
  if (!["mock", "live", "auto"].includes(mode))
    throw new Error("Invalid MARKETPLACE_DATA_MODE");
  const base = env.GUARD_API_URL?.replace(/\/+$/, "");
  if (mode !== "mock" && !base) throw new Error("GUARD_API_URL is required");
  for (const url of [base, env.GUARD_POLICY_AUTHORING_URL]) {
    if (!url) continue;
    const parsed = new URL(url);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw new Error("Invalid upstream URL");
  }
  const publicOrigin = env.MARKETPLACE_PUBLIC_ORIGIN || undefined;
  if (
    publicOrigin &&
    (!/^https?:\/\//.test(publicOrigin) ||
      new URL(publicOrigin).origin !== publicOrigin)
  )
    throw new Error("Invalid MARKETPLACE_PUBLIC_ORIGIN");
  return {
    mode: mode as GuardMode,
    base,
    authoring: env.GUARD_POLICY_AUTHORING_URL,
    publicOrigin,
    sourceId: createHash("sha256")
      .update(base ?? "mock")
      .digest("hex")
      .slice(0, 16),
  };
}
export function runtimeResponse(env = process.env) {
  try {
    const config = guardConfig(env);
    return Response.json(
      {
        mode: config.mode,
        sourceId: config.sourceId,
        policyAuthoring: !!config.authoring,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure(
      503,
      "configuration_error",
      "Marketplace connection is not configured correctly.",
    );
  }
}
function failure(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
// Intentionally not a general-purpose HTTP proxy. No deletes, account changes,
// arbitrary destinations, cookies, redirect following, or service-admin tokens.
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
  } catch {
    return failure(
      503,
      "configuration_error",
      "Marketplace connection is not configured correctly.",
    );
  }
  if (config.mode === "mock")
    return failure(409, "mock_mode", "Live connection is disabled.");
  const url = new URL(request.url);
  const authoring = url.pathname === "/api/guard-policy-draft";
  const path = url.pathname.slice("/api/guard".length);
  if (
    authoring
      ? request.method !== "POST"
      : !allowedGuardRoute(path, request.method)
  )
    return failure(404, "not_found", "API operation is not available.");
  if (url.search)
    return failure(400, "invalid_query", "Unexpected query parameters.");
  const origin = request.headers.get("origin");
  if (origin && origin !== (config.publicOrigin ?? url.origin))
    return failure(
      403,
      "origin_mismatch",
      "Cross-origin requests are not allowed.",
    );
  const authorization = request.headers.get("authorization");
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
      return failure(
        502,
        "upstream_redirect",
        "Backend returned an unexpected redirect.",
      );
    if (!response.headers.get("content-type")?.includes("application/json"))
      return failure(502, "invalid_response", "Backend did not return JSON.");
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    // On writes this is an UNCERTAIN outcome, never a reason to create mock data.
    return failure(
      503,
      "upstream_unavailable",
      request.method === "GET"
        ? "Cannot connect to Guard."
        : "Connection lost. Check the saved record before retrying.",
    );
  }
}
