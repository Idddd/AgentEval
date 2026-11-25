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

function evaluationPolicy(env: NodeJS.ProcessEnv) {
  const raw = env[setting]?.trim();
  let base: string | undefined;
  try { if (raw) base = evaluationApiBase(raw); } catch { /* Report an invalid deployment value separately. */ }
  const alternates = new Set<string>();
  let invalidAlternates = 0;
  for (const value of (env[allowlist] ?? "").split(/[,\r\n]/)) {
    if (!value.trim()) continue;
    try { alternates.add(evaluationApiBase(value)); } catch { invalidAlternates++; }
  }
  return { raw, base, alternates, invalidAlternates, tokenPinned: !!env.MARKETPLACE_EVALUATION_TOKEN?.trim() };
}

export function evaluationPolicyStatus(env: NodeJS.ProcessEnv) {
  const { raw, base, alternates, invalidAlternates, tokenPinned } = evaluationPolicy(env);
  return {
    deploymentUrl: base ? "configured" : raw ? "invalid" : "missing",
    approvedAlternates: alternates.size,
    invalidAlternates,
    tokenPinned,
  };
}

export function selectEvaluationUrl(value: string, env: NodeJS.ProcessEnv, publicOrigin: string) {
  let target: string;
  try { target = evaluationApiBase(value); }
  catch {
    throw new DeploymentError("evaluation", "evaluation_url_invalid", "Enter an HTTP(S) evaluation service URL without credentials, query or fragment.", [setting], 422);
  }
  const { base, raw, alternates, tokenPinned } = evaluationPolicy(env);
  if (target === base) return target;
  if (tokenPinned)
    throw new DeploymentError("evaluation", "evaluation_token_destination", base
      ? "The deployment Token can only be used with the deployment Evaluate URL. No request was sent."
      : "A deployment Token is configured, but the deployment Evaluate URL is missing or invalid. Set both in deployment settings. No request was sent.",
    [setting, "MARKETPLACE_EVALUATION_TOKEN"], 422);
  const local = loopback(env.NITRO_HOST ?? env.HOST ?? "") && loopback(new URL(publicOrigin).hostname) && loopback(new URL(target).hostname);
  if (alternates.has(target) || local) return target;
  const reason = !base && !alternates.size
    ? raw ? "The deployment Evaluate URL is invalid and no valid fallback addresses were received." : "Marketplace did not receive a deployment Evaluate URL or any approved fallback addresses."
    : "The address does not match the deployment Evaluate URL or an approved fallback.";
  throw new DeploymentError("evaluation", "evaluation_url_not_allowed", `${reason} No request was sent. Configure marketplace.evaluationUrl or marketplace.evaluationAllowedUrls in the deployment.`, [setting, allowlist], 422);
}
