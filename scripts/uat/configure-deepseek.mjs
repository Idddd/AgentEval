import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const dir = resolve(root, ".artifacts/uat-nemo");
const config = parseEnv(readFileSync(resolve(dir, "deepseek.env"), "utf8"));
const local = parseEnv(readFileSync(resolve(dir, ".env"), "utf8"));
const base = "http://127.0.0.1:18083";
const redact = value => String(value).replaceAll(config.DEEPSEEK_API_KEY || "__unused__", "[redacted]").replace(/sk-[\w-]+/g, "[redacted]");
let cookie = "";
async function call(path, method = "GET", body) {
  const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Origin: base, ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(150000) });
  if (!response.ok) throw new Error(`NeMo ${path} returned HTTP ${response.status}`);
  if (path.includes("sign-in")) cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  return response.json();
}
try {
  if (!config.DEEPSEEK_API_KEY?.trim()) throw new Error("Fill DEEPSEEK_API_KEY in .artifacts/uat-nemo/deepseek.env first.");
  const url = new URL(config.DEEPSEEK_BASE_URL);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid DEEPSEEK_BASE_URL");
  if (!config.DEEPSEEK_MODEL?.trim()) throw new Error("DEEPSEEK_MODEL is required");
  await call("/api/auth/sign-in/email", "POST", { email: "admin@marketplace.local", password: local.NEMO_ADMIN_PASSWORD });
  let view = await call("/api/v1/model-configuration");
  const name = "Marketplace DeepSeek";
  let provider = view.providers.find(item => item.name === name);
  const connection = { name, kind: "deepseek", baseUrl: url.toString().replace(/\/$/, ""), apiKey: config.DEEPSEEK_API_KEY, skipTlsVerify: false };
  provider = await call(`/api/v1/model-providers${provider ? `/${provider.id}` : ""}`, provider ? "PATCH" : "POST", connection);
  console.log("Provider check:", provider.status);
  let model = view.models.find(item => item.providerId === provider.id && item.model === config.DEEPSEEK_MODEL);
  if (!model) model = await call("/api/v1/models", "POST", { providerId: provider.id, name: "DeepSeek control plane", model: config.DEEPSEEK_MODEL, profile: "generic-chat", timeoutSeconds: 60, maxTokens: 512 });
  else model = await call(`/api/v1/models/${model.id}/connection-tests`, "POST", {});
  console.log("Model call:", model.connectionStatus);
  if (model.connectionStatus !== "validated") throw new Error(redact(model.connectionMessage ?? "Model connection failed"));
  const validation = await call("/api/v1/model-configuration/draft/assignments/control_plane/candidate-validations", "POST", { modelId: model.id });
  const checks = validation.validationReport?.checks ?? [];
  if (!checks.some(check => check.id === `probe:control_plane:${model.id}` && check.status === "passed")) throw new Error("DeepSeek control-plane validation failed");
  await call("/api/v1/model-configuration/draft/assignments/control_plane", "PUT", { modelId: model.id, validationId: validation.validationId });
  view = await call("/api/v1/model-configuration");
  if (view.draft?.assignments.controlPlane !== model.id) throw new Error("Saved control-plane assignment could not be confirmed");
  const evidence = { testedAt: new Date().toISOString(), providerId: provider.id, modelId: model.id, model: config.DEEPSEEK_MODEL, connectionStatus: model.connectionStatus, controlPlane: "validated and saved", dataPlane: "DeepSeek is not supported for detection rails" };
  writeFileSync(resolve(dir, "deepseek-result.json"), JSON.stringify(evidence, null, 2));
  console.log("PASS: real DeepSeek model call and NeMo control-plane validation; saved assignment. Detection rails still require a compatible detector.");
} catch (error) { console.error(redact(error.message)); process.exitCode = 1; }
