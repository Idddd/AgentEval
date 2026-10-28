type Failure = { code?: string | undefined; component?: string | undefined; message?: string | undefined; settings?: string[] | undefined; requestId?: string | undefined };
export function runtimeFailure(details: Failure, path: string, status?: number) {
  const requestId = details.requestId ?? crypto.randomUUID();
  console.error(JSON.stringify({ event: "workspace_request_failed", path: path.split("?")[0], status, code: details.code, component: details.component, requestId }));
  return new Error(`[${details.code ?? "api_error"}] ${details.component ? `${details.component}: ` : ""}${details.message ?? "The operation failed."}${details.settings?.length ? ` Check: ${details.settings.join(", ")}.` : ""} Reference: ${requestId}`);
}

// A SPA host can answer /api with HTML and HTTP 200. Do not treat it as data,
// display its content, silently simulate results, or retry an uncertain POST.
export async function runtimeRequest<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(30_000);
    response = await fetch(path, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw runtimeFailure({ code: timedOut ? "api_timeout" : "api_unreachable", component: "network", message: `Cannot reach the Marketplace API${timedOut ? " within 30 seconds" : ""}. Check the server, /api reverse proxy, network and TLS.${init.method && init.method !== "GET" ? " Reconcile the saved result before retrying a write." : ""}` }, path);
  }
  let value: any;
  try {
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error();
    value = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
  } catch {
    throw runtimeFailure({ code: "api_response_invalid", component: "routing", message: `Marketplace API did not return valid JSON (HTTP ${response.status}). Check /api reverse proxy routing and deploy the API server rather than only static files.${init.method && init.method !== "GET" ? " Reconcile before retrying a write." : ""}`, ...(response.headers.get("x-request-id") ? { requestId: response.headers.get("x-request-id")! } : {}) }, path, response.status);
  }
  if (!response.ok) {
    const source = value.error && typeof value.error === "object" ? value.error : {};
    const text = (v: unknown) => typeof v === "string" ? v.slice(0, 1200) : undefined;
    throw runtimeFailure({ code: text(source.code), component: text(source.component), message: text(source.message) ?? `API request failed (HTTP ${response.status}). Check authentication, permissions and server logs.`, settings: Array.isArray(source.settings) ? source.settings.filter((s: unknown) => typeof s === "string" && /^[A-Z][A-Z0-9_]{1,80}$/.test(s)).slice(0, 20) : [], requestId: text(source.requestId) ?? response.headers.get("x-request-id") ?? undefined }, path, response.status);
  }
  return value as T;
}
