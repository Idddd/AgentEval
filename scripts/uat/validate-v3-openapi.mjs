// Read-only production HTTP contract audit. Does not create/release business resources.
// Usage: node scripts/uat/validate-v3-openapi.mjs http://127.0.0.1:18087
import { createRequire } from "node:module";
const require = createRequire(new URL("../../web/apps/control/package.json", import.meta.url));
const Ajv2020 = require("ajv/dist/2020").default;
const base = new URL(process.argv[2] ?? "http://127.0.0.1:18087").origin;
const headers = { Origin: base, "Content-Type": "application/json", ...(process.env.V3_USER_TOKEN ? { Authorization: `Bearer ${process.env.V3_USER_TOKEN}` } : {}) };
const specResponse = await fetch(`${base}/api/openapi.json`);
if (!specResponse.ok) throw new Error(`OpenAPI unavailable: ${specResponse.status}`);
const spec = await specResponse.json();
const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
for (const schema of Object.values(spec.components.schemas)) ajv.compile({ ...schema, components: spec.components });
let checked = 0;
async function check(path, init = {}, status = 200) {
  const method = init.method ?? "GET";
  const response = await fetch(base + path, { ...init, headers: { ...headers, ...init.headers } });
  if (response.status !== status) throw new Error(`${method} ${path}: expected ${status}, received ${response.status}`);
  const operation = spec.paths[path.split("?")[0]]?.[method.toLowerCase()];
  const media = response.headers.get("content-type")?.split(";")[0];
  const schema = (operation?.responses[status] ?? operation?.responses.default)?.content?.[media]?.schema;
  if (!schema) throw new Error(`Undocumented ${method} ${path} response ${status} ${media}`);
  const body = media === "application/json" ? await response.json() : await response.text();
  const validate = ajv.compile({ ...schema, components: spec.components });
  if (!validate(body)) throw new Error(`${method} ${path}: ${JSON.stringify(validate.errors)}`);
  checked++;
  return body;
}
await check("/api/health");
const config = await check("/api/marketplace-config?workspace=v3");
headers["X-Marketplace-Connection"] = config.connectionRevision;
await check("/api/nmgr/connection");
await check("/api/nmgr/ready");
const inventory = await check("/api/endpoints");
await check("/api/docs");
const workspace = await check("/api/nmgr/workspace");
if (config.demoRoleSwitching) for (const role of ["User Admin", "IT Admin"]) await check("/api/nmgr/workspace", { headers: { "X-Marketplace-Role": role } });
for (const kind of ["Guardrail", "Profile"]) {
  const resource = workspace.state.entities.find(entity => entity.kind === kind);
  if (resource) await check(`/api/nmgr/workspace?resource=${encodeURIComponent(resource.id)}`);
}
for (const target of ["nemoUrl", "nemoToken", "databaseUrl"]) await check("/api/nmgr/connection/test", { method: "POST", body: JSON.stringify({ target, settings: {} }) });
// Deliberately invalid discriminator fails validation before any workflow mutation.
await check("/api/nmgr/commands", { method: "POST", body: JSON.stringify({ type: "schema-audit-invalid" }) }, 422);
console.log(JSON.stringify({ checkedResponses: checked, schemas: Object.keys(spec.components.schemas).length, operations: inventory.items.length, pageMappings: inventory.pages.length, realResources: workspace.state.entities.length, status: "passed" }, null, 2));
