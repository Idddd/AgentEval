import { z } from "zod";
import { responseSchemas } from "./openapi-responses";
import { pageCoverage, pageCoverageMarkdown } from "./api-page-coverage";
import { commandSchema, connectionTestSchema } from "./nmgr-contract";
import { connectionSettingsSchema } from "./nmgr-connection-config";
import { restOpenApi, restResponseSchemas } from "./nmgr-rest-openapi";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const string = { type: "string" };
const object = { type: "object", additionalProperties: true };
const json = (schema: unknown) => ({ "application/json": { schema } });
const inputSchema = (schema: z.ZodType) => {
  const { $schema, ...value } = z.toJSONSchema(schema, { io: "input" });
  return value;
};
const role = { name: "X-Marketplace-Role", in: "header", required: false, description: "Default V3 demo role selection (not authentication). Strict mode derives role from the authenticated user instead.", schema: { type: "string", enum: ["User", "User Admin", "IT Admin"], default: "User" } };
const revision = { name: "X-Marketplace-Connection", in: "header", required: false, description: "Use connectionRevision returned by GET /api/nmgr/connection. A stale value returns 409 before sending work to a changed backend.", schema: string };
const errorResponses = Object.fromEntries([400, 401, 403, 404, 405, 409, 413, 415, 422, 429, 500, 502, 503, 504].map(status => [status, { description: status === 409 ? "Revision/idempotency conflict or uncertain operation; reload and reconcile, do not blindly retry writes." : "Structured failure; correlate error.requestId with server logs.", headers: { "X-Request-ID": { description: "Diagnostic correlation ID", schema: string } }, content: json(ref("ErrorResponse")) }]));
const responses = (schema: unknown, description = "Success") => ({ "200": { description, content: json(schema) }, ...errorResponses, default: { description: "Other dependency failure; error details remain structured.", content: json(ref("ErrorResponse")) } });

const draft = { id: "customer-data", kind: "Guardrail", name: "Customer data protection", description: "Block configured sensitive terms", location: "Gateway", mandatory: false, refs: [], attributes: { bu: "ISS", agent: "Customer assistant", data: "Text" }, threshold: 20 };
const config = { scannerType: "keyword", direction: "both", content: "private-key", versionName: "v1", versionDescription: "Initial version" };
const envelope = { requestId: "c119f72b-9acb-43bf-93d2-88a4a177286c", expectedRevision: 0 };
const example = (summary: string, value: object) => ({ summary, value: { ...envelope, ...value } });
export const commandExamples = {
  create: example("User: create a requirement; Tech selects provider later", { type: "create", draft }),
  edit: example("User: update own draft", { type: "edit", draft }),
  revise: example("User: create the next business revision", { type: "revise", draft }),
  implementNeMo: example("IT Admin: implement using a NeMo Policy", { type: "action", id: draft.id, action: "implement", provider: "NeMo", config }),
  implementF5: example("IT Admin: implement using an F5 Scanner", { type: "action", id: draft.id, action: "implement", provider: "F5", config }),
  evaluate: example("IT Admin: queue real evaluation (advance until complete)", { type: "evaluate", id: draft.id, dataset: "Acceptance", cases: [{ input: "private-key", expected: "block", phase: "input" }, { input: "private-key", expected: "block", phase: "output" }, { input: "hello", expected: "allow", phase: "input" }] }),
  request: example("User: request signoff", { type: "action", id: draft.id, action: "request" }),
  approve: example("User Admin: approve independently of author", { type: "action", id: draft.id, action: "approve" }),
  reject: example("User Admin: reject with reason", { type: "action", id: draft.id, action: "reject", reason: "Revise the policy" }),
  withdraw: example("User: withdraw own request", { type: "action", id: draft.id, action: "withdraw" }),
  deploy: example("IT Admin: queue release of signed-off, tested revision", { type: "action", id: draft.id, action: "deploy" }),
  advance: example("Initiating Tech/authorized author: advance one pending job step", { type: "advance", id: draft.id }),
  reconcile: example("Recover a failed/uncertain operation before retrying", { type: "reconcile", id: draft.id }),
  createProfile: example("User: compose existing same-provider Guardrails", { type: "create", draft: { ...draft, id: "customer-profile", kind: "Profile", name: "Customer profile", refs: [draft.id] } }),
};

export function createOpenApi() {
  const connection = inputSchema(connectionSettingsSchema) as any;
  for (const key of ["nemoUrl", "nemoToken", "databaseUrl", "workspaceId", "caPem", "f5Url", "f5Token", "f5AdminIds"])
    connection.properties[key] = { ...connection.properties[key], writeOnly: true };
  return {
    openapi: "3.1.0",
    info: { title: "Marketplace NeMo / F5 Integration API", version: "1.1.0", description: "Backend contract for the formal UI and the bundled V3 connection/workflow UI. Forward /api through the same-origin gateway. Default demo uses server-side NeMo/F5 credentials and role switching; it is not a user-authorization boundary. Secrets are never returned. /v2/guardrails remains browser Mock; /v3/guardrails uses these live APIs. Legacy /api/f5/* simulation and /api/marketplace/* CRUD APIs are not this contract." + pageCoverageMarkdown },
    "x-page-coverage": pageCoverage,
    servers: [{ url: "/", description: "Same-origin gateway; forward /api to this service" }],
    tags: [{ name: "Connections", description: "Shared encrypted connection settings and read-only independent probes" }, { name: "Workflow", description: "Real NeMo/F5 business workflow; HTTP 200 is not proof a background job succeeded" }, { name: "Operations" }, { name: "Documentation" }],
    paths: {
      ...restOpenApi([role, revision], errorResponses),
      "/api/health": { get: { tags: ["Operations"], operationId: "health", summary: "UI/API process health", description: "Independent of database, NeMo and F5. Suitable for Kubernetes probes; does not prove integration readiness.", responses: responses(ref("Health")) } },
      "/api/marketplace-config": { get: { tags: ["Connections"], operationId: "v3Runtime", summary: "Read V3 runtime flags and connection revision", parameters: [{ name: "workspace", in: "query", required: true, schema: { type: "string", enum: ["v3"] } }], responses: responses(ref("RuntimeStatus")) } },
      "/api/nmgr/connection": {
        get: { tags: ["Connections"], operationId: "getConnection", summary: "Read connection values and Secret diagnostics", description: "Returns deployment and effective value sources, file read status, safe previews and override indicators. URLs exclude credentials; database query values are masked. Tokens show only the last four characters when at least 12 characters long. Passwords are fully masked. loaded means read successfully, not authenticated; use connection/test to verify. Does not query Kubernetes or expose complete credentials. No-store response.", responses: responses(ref("ConnectionStatus")) },
        post: { tags: ["Connections"], operationId: "saveConnection", summary: "Validate and save shared fallback settings", description: "Blank/omitted fields preserve values. Changing NeMo/F5 URL requires fresh corresponding Token. Checks NeMo identity, database schema access, and F5 when changed before encrypting/saving; failures preserve old settings. Default V3 demo only; strict mode rejects manual configuration. Database initialization can create application tables.", parameters: [revision], requestBody: { required: true, content: json(ref("ConnectionSettings")) }, responses: responses(ref("ConnectionStatus")) },
        delete: { tags: ["Connections"], operationId: "clearConnection", summary: "Remove saved overrides and use deployment configuration", description: "Does not modify Kubernetes Secrets/YAML or delete backend business resources. Default V3 demo only.", parameters: [revision], responses: responses(ref("ConnectionStatus")) },
      },
      "/api/nmgr/connection/test": { post: { tags: ["Connections"], operationId: "testConnection", summary: "Test a single connection using entered or saved values", description: "Does not save settings. nemoUrl/f5Url test an unauthenticated API address; JSON 401 means reachable only. nemoToken verifies identity plus policies/guardrails write grants. databaseUrl runs SELECT 1 without migrations. f5Token checks scanner read access. Other dependencies need not be configured. Credentials must be re-entered when testing a Token at a changed URL. NeMo demo TLS defaults to skip; choose verify to enforce certificates.", parameters: [revision], requestBody: { required: true, content: json(ref("ConnectionTest")) }, responses: responses(ref("ProbeResult")) } },
      "/api/nmgr/ready": { get: { tags: ["Operations"], operationId: "databaseReadiness", summary: "Check V3 configuration and application database", description: "Validates selected configuration and accesses application storage (may initialize schema). Does not contact NeMo/F5; use independent connection tests for those.", parameters: [revision], responses: responses(ref("Readiness")) } },
      "/api/nmgr/workspace": { get: { tags: ["Workflow"], operationId: "getWorkspace", security: [{}, { bearerAuth: [] }], summary: "Read workflow snapshot or a resource's live backend status", description: "Validates NeMo identity and reads durable Marketplace workflow state. Set X-Marketplace-Import: true to discover existing NeMo Policies and Guardrails and atomically import read-only external resources into the current control unit. Set X-Marketplace-Import: f5 for independently importing F5 Scanners, versions and Project bindings. Existing managed bindings are preserved. Omit the header for routine polling. Import failure retains the previous snapshot. resource queries inspect the corresponding linked NeMo/F5 resource and can return status=unavailable in HTTP 200. Reading a snapshot does not advance a job.", parameters: [role, revision, { name: "X-Marketplace-Import", in: "header", required: false, schema: { type: "string", enum: ["true", "f5"] }, description: "Use true for NeMo or f5 for F5 Scanner/Project discovery; ignored for individual resource observations." }, { name: "resource", in: "query", required: false, schema: { type: "string", pattern: "^[a-z][a-z0-9-]{2,63}$" }, description: "Marketplace resource ID. Omit for the full snapshot." }], responses: responses({ oneOf: [ref("Workspace"), ref("ResourceObservation")] }) } },
      "/api/nmgr/commands": { post: { tags: ["Workflow"], operationId: "executeCommand", security: [{}, { bearerAuth: [] }], summary: "Create, edit, implement, evaluate, approve, publish or recover", description: "Use a fresh UUID requestId for each new command and the latest expectedRevision from the snapshot. Retrying the same logical request reuses its UUID and identical body. Provider assignment belongs to IT Admin implement, not User create. Guardrail maps to NeMo Policy/F5 Scanner; Profile maps to NeMo Guardrail/F5 Project. Inspect jobs[id].status and message even on HTTP 200. Pending work requires explicit advance commands; there is no autonomous job worker. Uncertain/failed work requires reconcile before continuing. Demo roles select workbenches; strict mode requires the user Bearer token and authenticated account mapping. Imported external resources reject mutation with 403. Error responses include X-Request-ID. Definitions and private job payloads are never returned.", parameters: [role, revision], requestBody: { required: true, content: { "application/json": { schema: ref("Command"), examples: commandExamples } } }, responses: responses(ref("Workspace"), "Updated snapshot; check jobs and business status, not HTTP status alone") } },
      "/api/openapi.json": { get: { tags: ["Documentation"], operationId: "openApi", summary: "Download OpenAPI 3.1 contract", responses: { "200": { description: "OpenAPI 3.1 document", content: json(object) }, "405": { description: "Method not allowed", content: { "text/plain": { schema: string } } } } } },
      "/api/endpoints": { get: { tags: ["Documentation"], operationId: "apiInventory", summary: "Read API inventory, page coverage and command examples", responses: { "200": { description: "Inventory", content: json(ref("ApiInventory")) }, "405": { description: "Method not allowed", content: { "text/plain": { schema: string } } } } } },
      "/api/docs": { get: { tags: ["Documentation"], operationId: "swagger", summary: "Open offline interactive Swagger UI", responses: { "200": { description: "Swagger UI HTML; all assets served under /api/docs/", content: { "text/html": { schema: string } } } } } },
    },
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "Strict mode: authenticated NeMo business-user token mapped to a Marketplace role. Workspace reads require policies and guardrails read/write grants; commands require both write grants. The demo/local alternatives use server credentials and do not require this header. Role switching is not authentication." } }, schemas: {
      Command: inputSchema(commandSchema), ConnectionSettings: connection,
      ConnectionTest: { ...inputSchema(connectionTestSchema), properties: { target: { type: "string", enum: ["nemoUrl", "nemoToken", "databaseUrl", "f5Url", "f5Token"] }, settings: ref("ConnectionSettings") } },
      ...responseSchemas,
      ...restResponseSchemas,
    } },
  };
}

export function apiInventory() {
  const spec = createOpenApi();
  return { openapi: "/api/openapi.json", swagger: "/api/docs", items: Object.entries(spec.paths).flatMap(([path, operations]) => Object.entries(operations).map(([method, operation]) => ({ method: method.toUpperCase(), path, operationId: operation.operationId, summary: operation.summary }))), pages: pageCoverage, commandExamples };
}
