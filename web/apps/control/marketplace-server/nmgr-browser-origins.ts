import { z } from "zod";
import { DeploymentError, diagnosticResponse } from "./diagnostics";
import { parseHttpOrigin } from "./marketplace-origin";
import { matchRestRoute } from "./nmgr-rest-contract";

export const browserOriginsPath = "/api/nmgr/connection/allowed-origins";
const deploymentSetting = "MARKETPLACE_ALLOWED_BROWSER_ORIGINS";
const allowedOrigin = z.string().trim().max(512).refine(value => {
  const url = parseHttpOrigin(value);
  return !!url && (url.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
}, "Enter an exact HTTPS origin, without a path or trailing slash. Local loopback HTTP is allowed.");
export const browserOriginsSchema = z.object({
  origins: z.array(allowedOrigin).max(32).refine(origins => new Set(origins).size === origins.length, "Remove duplicate origins."),
}).strict();
export const browserOriginsStatusSchema = browserOriginsSchema.extend({
  deploymentOrigins: browserOriginsSchema.shape.origins,
  source: z.enum(["deployment", "saved"]),
});

export const browserOriginsDocument = (workspace: string) => `nmgr-browser-origins:${workspace}`;
const isBearer = (request: Request) => /^Bearer [^\s]+$/.test(request.headers.get("authorization") ?? "");

export function deploymentBrowserOrigins(env: NodeJS.ProcessEnv): string[] {
  try {
    return browserOriginsSchema.parse({ origins: JSON.parse(env[deploymentSetting]?.trim() || "[]") }).origins;
  } catch {
    throw new DeploymentError("origin", "browser_origins_config_invalid",
      "Set MARKETPLACE_ALLOWED_BROWSER_ORIGINS to a JSON array of exact browser origins.", [deploymentSetting]);
  }
}

export function browserOriginsStatus(deploymentOrigins: string[], saved: unknown) {
  if (saved == null) return { origins: deploymentOrigins, deploymentOrigins, source: "deployment" as const };
  const result = browserOriginsSchema.safeParse(saved);
  if (!result.success) throw new DeploymentError("origin", "browser_origins_saved_invalid",
    "The saved browser origin list is invalid. Restore the deployment defaults.", [deploymentSetting]);
  return { origins: result.data.origins, deploymentOrigins, source: "saved" as const };
}

const corsHeaders = ["authorization", "content-type", "x-marketplace-connection"];
const denied = () => new DeploymentError("origin", "origin_mismatch",
  "This origin is not permitted to access the Marketplace resource API.", [deploymentSetting], 403);

export async function crossOriginResource(
  request: Request,
  readOrigins: () => Promise<string[]>,
  invoke: (request: Request) => Promise<Response>,
) {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigin.safeParse(origin).success) throw denied();
  const method = request.method === "OPTIONS" ? request.headers.get("access-control-request-method") : request.method;
  if (!method || !matchRestRoute(new URL(request.url).pathname, method)) throw denied();
  if (!(await readOrigins()).includes(origin)) throw denied();
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
  };
  if (request.method === "OPTIONS") {
    const requested = (request.headers.get("access-control-request-headers") ?? "").toLowerCase().split(",").map(value => value.trim()).filter(Boolean);
    if (requested.some(value => !corsHeaders.includes(value))) throw denied();
    return new Response(null, { status: 204, headers: {
      ...headers, "Access-Control-Allow-Methods": method, "Access-Control-Allow-Headers": corsHeaders.join(", "),
    } });
  }
  // The external origin has been validated above. Internal REST dispatch
  // still checks the Bearer token, account mapping, role and resource scope.
  const verifiedHeaders = new Headers(request.headers);
  verifiedHeaders.delete("origin");
  verifiedHeaders.delete("sec-fetch-site");
  verifiedHeaders.delete("cookie");
  const response = isBearer(request)
    ? await invoke(new Request(request, { headers: verifiedHeaders }))
    : diagnosticResponse(
      new DeploymentError("identity", "authentication_required", "A user Bearer token is required for cross-origin access.", [], 401),
      "identity", "resource.cors", "Authentication required.",
    );
  const resultHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(headers)) resultHeaders.set(key, value);
  resultHeaders.set("Access-Control-Expose-Headers", "X-Request-ID, X-Operation-ID");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: resultHeaders });
}
