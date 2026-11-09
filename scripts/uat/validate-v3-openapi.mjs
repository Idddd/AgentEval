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
  const pathname = path.split("?")[0];
  const template = Object.keys(spec.paths).find(template => new RegExp(`^${template.replace(/\{[^}]+\}/g, "[^/]+")}$`).test(pathname));
  const operation = spec.paths[template ?? pathname]?.[method.toLowerCase()];
  const media = response.headers.get("content-type")?.split(";")[0];
  const schema = (operation?.responses[status] ?? operation?.responses.default)?.content?.[media]?.schema;
  if (!schema) throw new Error(`Undocumented ${method} ${path} response ${status} ${media}`);
  const body = media === "application/json" ? await response.json() : await response.text();
  if (pathname.startsWith("/api/nmgr/")) {
    if (!response.headers.get("X-Request-ID") || response.headers.get("X-Operation-ID") !== operation.operationId) throw new Error(`${method} ${path}: missing/mismatched request logging headers`);
    if (body.error && body.error.requestId !== response.headers.get("X-Request-ID")) throw new Error(`${path}: error correlation mismatch`);
  }
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
const prefix = "/api/nmgr/v1";
for (const [collection, kind] of [["guardrails", "Guardrail"], ["profiles", "Profile"]]) {
  const list = await check(`${prefix}/${collection}?pageSize=100`);
  const expectedIds = workspace.state.entities.filter(entity => entity.kind === kind).map(entity => entity.id).sort();
  if (list.pagination.total !== expectedIds.length || JSON.stringify(list.items.map(entity => entity.id).sort()) !== JSON.stringify(expectedIds)) throw new Error(`${collection}: legacy/resource list mismatch (audit assumes <=100 records per kind)`);
  for (const item of list.items.slice(0, 1)) {
    const detail = await check(`${prefix}/${collection}/${encodeURIComponent(item.id)}`);
    if (detail.item.id !== item.id) throw new Error("Detail identity mismatch");
    await check(`${prefix}/${collection}/${encodeURIComponent(item.id)}/backend-status`);
  }
}
for (const path of ["/evaluation-candidates", "/evaluations", "/approval-requests?kind=Profile", "/approval-requests?kind=Guardrail", "/deployments", "/jobs", "/audit-events", "/dashboard/summary", "/capabilities"]) await check(prefix + path);
const jobId = Object.keys(workspace.jobs)[0];
if (jobId) await check(`${prefix}/jobs/${encodeURIComponent(jobId)}`);
const run = workspace.state.entities.flatMap(entity => entity.runs)[0];
if (run) await check(`${prefix}/evaluations/${encodeURIComponent(run.id)}`);
await check(`${prefix}/profiles?pageSize=101`, {}, 422);
await check(`${prefix}/profiles`, { method: "POST", body: JSON.stringify({ invalid: true }) }, 422);
console.log(JSON.stringify({ checkedResponses: checked, schemas: Object.keys(spec.components.schemas).length, operations: inventory.items.length, pageMappings: inventory.pages.length, realResources: workspace.state.entities.length, status: "passed" }, null, 2));
