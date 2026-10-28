// Render deployment edge cases without a cluster. Requires Docker + the local
// alpine/helm:3.18.4 image and the repository's installed YAML dependency.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(new URL("../../web/package.json", import.meta.url));
const { parseAllDocuments } = require("yaml");
const root = resolve(import.meta.dirname, "../..");
const chart = resolve(root, "deploy/helm/tali-ui-demo");
const cases = [
  ["default", []],
  ["live-unconfigured", ["marketplace.dataMode=live", "marketplace.v2Live=true"]],
  ["missing-secret-refs", ["marketplace.dataMode=live", "marketplace.v2Live=true", "marketplace.databaseSecret=missing-db", "marketplace.databasePasswordKey=password", "marketplace.nemoTokenSecret=missing-nemo", "marketplace.accountsConfigMap=missing-accounts", "marketplace.caConfigMap=missing-ca"]],
  ["f5-url-only", ["marketplace.dataMode=live", "marketplace.f5ApiUrl=https://f5.invalid/backend/v1"]],
  ["f5-secret-only", ["marketplace.dataMode=live", "marketplace.f5Secret=missing-f5"]],
  ["nemo-password", ["marketplace.dataMode=live", "marketplace.nemoSecret=missing-password"]],
  ["nemo-conflict", ["marketplace.dataMode=live", "marketplace.nemoSecret=missing-password", "marketplace.nemoTokenSecret=missing-token"]],
];
for (const [name, settings] of cases) {
  const args = ["run", "--rm", "--pull=never", "--mount", `type=bind,source=${chart},target=/chart,readonly`, "alpine/helm:3.18.4", "template", "availability", "/chart", ...settings.flatMap(value => ["--set", value])];
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, `${name}: chart must render even when live configuration is incomplete: ${result.stderr}`);
  const documents = parseAllDocuments(result.stdout).map(document => document.toJSON());
  const deployment = documents.find(document => document?.kind === "Deployment");
  const pod = deployment.spec.template.spec, container = pod.containers[0];
  for (const probe of ["startupProbe", "readinessProbe", "livenessProbe"]) assert.equal(container[probe].httpGet.path, "/api/health", `${name}: ${probe} must not remove Mock for a real dependency failure`);
  for (const variable of container.env.filter(item => item.valueFrom?.secretKeyRef)) assert.equal(variable.valueFrom.secretKeyRef.optional, true, `${name}: optional integration Secret ${variable.name}`);
  for (const volume of pod.volumes.filter(item => ["accounts", "ca"].includes(item.name))) assert.equal(volume.configMap.optional, true, `${name}: optional integration ConfigMap ${volume.name}`);
  if (name === "f5-secret-only") assert(container.env.some(item => item.name === "F5_API_TOKEN"), "Do not silently discard a partial F5 configuration");
  if (name === "missing-secret-refs") {
    assert.equal(container.env.find(item => item.name === "MARKETPLACE_NEMO_AUTH_MODE").value, "token");
    assert.equal(container.env.find(item => item.name === "MARKETPLACE_DATABASE_PASSWORD_REQUIRED").value, "true");
  }
  if (name.startsWith("f5-")) assert.equal(container.env.find(item => item.name === "MARKETPLACE_F5_ENABLED").value, "true");
  if (name === "nemo-conflict") assert.equal(container.env.find(item => item.name === "MARKETPLACE_NEMO_AUTH_MODE").value, "invalid");
  console.log(`PASS ${name}`);
}
console.log("UI probes remain independent of real integrations; missing inputs reach runtime diagnostics.");
