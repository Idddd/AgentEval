import { z } from "zod";
import { restBase, restRoutes } from "./nmgr-rest-contract";
import { responseSchemas } from "./openapi-responses";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const text = { type: "string" }, integer = { type: "integer", minimum: 0 }, bool = { type: "boolean" };
const list = (items: unknown) => ({ type: "array", items });
const nullable = (schema: unknown) => ({ anyOf: [schema, { type: "null" }] });
const map = (schema: unknown) => ({ type: "object", additionalProperties: schema });
const context = { revision: integer, actor: ref("Actor"), sources: list({ type: "string", enum: ["NeMo", "F5"] }), accessMode: { type: "string", enum: ["local", "demo", "authenticated"] }, sourceErrors: responseSchemas.Workspace.properties.sourceErrors };
const requiredContext = ["revision", "actor", "sources"];
const wrap = (properties: Record<string, unknown>) => obj({ ...context, ...properties }, [...requiredContext, ...Object.keys(properties)]);
const detail = { item: ref("Entity"), job: nullable(ref("Job")), binding: nullable(ref("Binding")), relatedGuardrails: list(ref("Entity")) };
const paginated = (item: string, extra = {}) => wrap({ items: list(ref(item)), pagination: ref("Pagination"), ...extra });
export const restResponseSchemas = {
  Pagination: obj({ page: { type: "integer", minimum: 1 }, pageSize: { type: "integer", minimum: 1, maximum: 100 }, total: integer, totalPages: integer }),
  ResourceList: paginated("Entity", { jobs: map(ref("Job")), bindings: map(ref("Binding")) }),
  ResourceDetail: wrap(detail),
  ResourceMutation: wrap({ ...detail, jobId: nullable(text), jobUrl: nullable(text) }),
  ResourceJob: obj({ ...responseSchemas.Job.properties, id: text, resourceId: text }, [...responseSchemas.Job.required, "id", "resourceId"]),
  ResourceEvaluation: obj({ ...responseSchemas.EvaluationRun.properties, resourceId: text, resourceName: text }, [...responseSchemas.EvaluationRun.required, "resourceId", "resourceName"]),
  JobList: paginated("ResourceJob"), JobDetail: wrap({ item: ref("ResourceJob") }),
  EvaluationList: paginated("ResourceEvaluation"), EvaluationDetail: wrap({ item: ref("ResourceEvaluation") }),
  AuditList: paginated("AuditEntry"),
  DashboardSummary: wrap({ counts: obj({ guardrails: integer, profiles: integer, pendingApprovals: integer, failedJobs: integer }), metrics: obj({ runtimeConnected: { type: "boolean", const: false }, traffic: { type: "null" }, passed: { type: "null" }, blocked: { type: "null" }, modified: { type: "null" } }) }),
  Capability: obj({ available: bool, reason: text }, ["available"]),
  Capabilities: wrap({ capabilities: obj(Object.fromEntries(["configuration", "evaluations", "approvals", "deployments", "audit", "measure", "feedback", "runtimeControl", "runners"].map(name => [name, ref("Capability")])) ) }),
  ImportResult: wrap({ imported: obj({ guardrails: integer, profiles: integer }) }),
};
const schema = (input: z.ZodType): any => { const { $schema, ...value } = z.toJSONSchema(input, { io: "input" }); return value; };
const common = "Uses the same identity, control-unit scope and NeMo/F5 business service as the compatible workspace/commands APIs. X-Marketplace-Role is demo selection only, not authentication. Ordinary GET requests never import resources. Query parameters are strict: unknown or repeated parameters return 422. X-Request-ID correlates server logs; X-Operation-ID identifies this endpoint.";
const command = " Require requestId (UUID) and expectedRevision from the latest read. Retrying the same logical command must reuse the UUID and identical fields. Resource ID and kind come from the URL. Imported NeMo and F5 resources are read-only. 202 means pending/inflight work; follow Location to GET the current job. GET does not advance work: POST /jobs/{resourceId}/advance performs one step; failed/uncertain jobs require reconcile. No autonomous background worker is introduced. 200/201 may contain a failed/uncertain job after a local save; always inspect job.status/message. Approval, deployment and job IDs currently identify resources and their current workflow, not immutable historical requests. expectedRevision rejects stale actions.";
const draft = { name: "Customer protection", description: "Protect customer information", location: "ALL", mandatory: false, refs: [], attributes: { bu: "ISS", agent: "Customer assistant", data: "Text" }, threshold: 5 };
function exampleFor(action?: string, kind?: string) {
  const envelope = { requestId: "d594d357-2aeb-446b-a116-2e1d8dca4a7b", expectedRevision: 0 };
  if (["create", "edit", "revise"].includes(action ?? "")) return { ...envelope, draft: { ...(action === "create" ? { id: kind === "Profile" ? "customer-profile" : "customer-control" } : {}), ...draft, ...(kind === "Profile" ? { refs: ["customer-control"] } : {}) } };
  if (action === "implement") return { ...envelope, provider: "NeMo", config: { scannerType: "keyword", direction: "request", content: "private-key", versionName: "v1", versionDescription: "Initial definition" } };
  if (action === "evaluate") return { ...envelope, dataset: "Acceptance", cases: [{ input: "private-key", expected: "block", phase: "input" }, { input: "hello", expected: "allow", phase: "input" }] };
  return { ...envelope, ...(action === "reject" ? { reason: "Please revise the requirements" } : {}) };
}
export function restOpenApi(commonParameters: unknown[], errors: Record<string, unknown>) {
  const paths: Record<string, Record<string, any>> = {};
  for (const route of restRoutes) {
    const parameters = [...commonParameters];
    if (route.path.includes("{id}")) parameters.push({ name: "id", in: "path", required: true, description: route.mode === "evaluation" ? "Recorded evaluation run ID" : "Marketplace resource ID (not the NeMo/F5 remote ID)", schema: { type: "string", pattern: "^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$" } });
    if (route.query) {
      const query = schema(route.query);
      for (const [name, value] of Object.entries(query.properties ?? {})) parameters.push({ name, in: "query", required: false, schema: name === "page" || name === "pageSize" ? { type: "integer", minimum: 1, maximum: name === "pageSize" ? 100 : 1_000_000, default: name === "pageSize" ? 20 : 1 } : value });
    }
    const headers = { "X-Request-ID": { description: "Server-generated request correlation ID", schema: text }, "X-Operation-ID": { description: "Stable Swagger operationId", schema: text } };
    const success = (description: string) => ({ description, headers, content: { "application/json": { schema: ref(route.response) } } });
    const operation: Record<string, unknown> = { tags: [route.tag], operationId: route.operationId, summary: route.summary, description: common + (route.mode === "command" ? command : route.mode === "import" ? " Explicit synchronous import; returns after atomic merge. Counts describe available imported resources for this provider in the visible scope, not just newly created rows. F5 reads all Scanner/Project catalog pages and Scanner versions, preserving exact Project references and optional flags; missing values remain absent. Project deploymentStatus is native, not evidence of a published Profile version or runtime protection. Full discovery must succeed before merge. Failure retains the last snapshot. F5 and NeMo discovery use separate endpoints and provider-scoped concurrency; F5 network I/O does not hold the workspace database lock. Provider credentials and raw configuration payloads are not included. No remote resources are created. Routine list reads do not import." : ["job", "jobs"].includes(route.mode) ? " A job ID is the resource ID, representing its current task. Private provider payloads and leases are excluded. Subsequent workflows can replace the current task." : ""), security: [{}, { bearerAuth: [] }], parameters,
      responses: { "200": success("Completed request; inspect business/job status"), ...(route.action === "create" ? { "201": success("Resource created; inspect draft synchronization status") } : {}), ...(route.mode === "command" ? { "202": { ...success("Pending operation; explicitly advance or reconcile the job"), headers: { ...headers, Location: { description: "Current job URL", schema: text } } } } : {}), ...errors, default: { description: "Structured dependency failure", headers, content: { "application/json": { schema: ref("ErrorResponse") } } } } };
    if (route.body) operation.requestBody = { required: true, content: { "application/json": { schema: schema(route.body), example: route.mode === "import" ? {} : exampleFor(route.action, route.kind) } } };
    (paths[restBase + route.path] ??= {})[route.method.toLowerCase()] = operation;
  }
  return paths;
}
