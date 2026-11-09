import { randomUUID } from "node:crypto";
import { matchRestRoute, restBase } from "./nmgr-rest-contract";
import { nmgrRequestContext, type RequestContext } from "./nmgr-request-context";
const legacy: Record<string, string> = { "/api/nmgr/workspace": "getWorkspace", "/api/nmgr/commands": "executeCommand", "/api/nmgr/ready": "databaseReadiness", "/api/nmgr/connection": "connectionSettings", "/api/nmgr/connection/test": "testConnection" };
export async function withNmgrRequestLog(request: Request, run: () => Promise<Response>) {
  const path = new URL(request.url).pathname;
  let matched: ReturnType<typeof matchRestRoute>;
  try { matched = path.startsWith(`${restBase}/`) ? matchRestRoute(path, request.method) : undefined; } catch { /* Invalid URL identifiers are handled by the API. */ }
  const connectionOperations: Record<string, string> = { GET: "getConnection", POST: "saveConnection", DELETE: "clearConnection" };
  const context: RequestContext = { requestId: randomUUID(), operationId: matched?.route.operationId ?? (path === "/api/nmgr/connection" ? connectionOperations[request.method] : legacy[path]) ?? "unknownNmgrOperation", route: matched ? restBase + matched.route.path : legacy[path] ? path : "/api/nmgr/<unknown>" };
  if (matched?.id && /^[a-zA-Z0-9-]{1,128}$/.test(matched.id)) context.resourceId = matched.id;
  const started = performance.now();
  return nmgrRequestContext.run(context, async () => {
    const response = await run();
    const requestId = response.headers.get("X-Request-ID") ?? context.requestId;
    const headers = new Headers(response.headers);
    headers.set("X-Request-ID", requestId); headers.set("X-Operation-ID", context.operationId);
    console.info(JSON.stringify({ time: new Date().toISOString(), level: "info", service: "marketplace", event: "api_request_completed", ...context, requestId, method: request.method, status: response.status, durationMs: Math.round(performance.now() - started) }));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  });
}
