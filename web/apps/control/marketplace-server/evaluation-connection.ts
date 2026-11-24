import { DeploymentError } from "./diagnostics";

const setting = "MARKETPLACE_EVALUATION_URL";
const allowlist = "MARKETPLACE_EVALUATION_ALLOWED_URLS";
const loopback = (host: string) => ["127.0.0.1", "localhost", "[::1]", "::1"].includes(host);

export function evaluationApiBase(value: string) {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || !url.hostname)
    throw new Error("Invalid evaluation API URL");
  const root = url.href.replace(/\/+$/, "");
  return root.endsWith("/api/v1/evaluations") ? root : root + "/api/v1/evaluations";
}

export function selectEvaluationUrl(value: string, env: NodeJS.ProcessEnv, publicOrigin: string) {
  let target: string;
  try { target = evaluationApiBase(value); }
  catch {
    throw new DeploymentError("evaluation", "evaluation_url_invalid", "Enter an HTTP(S) evaluation service URL without credentials, query or fragment.", [setting], 422);
  }
  const deployment = env[setting]?.trim();
  let base: string | undefined;
  try { if (deployment) base = evaluationApiBase(deployment); } catch { /* The deployment status shows an invalid URL. */ }
  if (target === base) return target;
  if (env.MARKETPLACE_EVALUATION_TOKEN?.trim())
    throw new DeploymentError("evaluation", "evaluation_token_destination", "The deployment Token is pinned to its configured URL. Change both in the deployment, not in the shared form.", [setting, "MARKETPLACE_EVALUATION_TOKEN"], 422);
  const listed = (env[allowlist] ?? "").split(/[,\r\n]/).some(value => {
    try { return target === evaluationApiBase(value); } catch { return false; }
  });
  const local = loopback(env.NITRO_HOST ?? env.HOST ?? "") && loopback(new URL(publicOrigin).hostname) && loopback(new URL(target).hostname);
  if (listed || local) return target;
  throw new DeploymentError("evaluation", "evaluation_url_not_allowed", "This URL is not approved for shared Demo. Ask the deployment administrator to add the Evaluate service URL.", [setting, allowlist], 422);
}
