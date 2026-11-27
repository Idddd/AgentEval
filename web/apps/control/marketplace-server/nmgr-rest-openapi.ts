import { z } from "zod";
import { restBase, restRoutes } from "./nmgr-rest-contract";
import { responseSchemas } from "./openapi-responses";
import { field, operationIdHeader, requestIdHeader, withFieldDocs } from "./openapi-field-annotations";
import { commandFields } from "./openapi-workflow-fields";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const text = { type: "string" }, integer = { type: "integer", minimum: 0 }, bool = { type: "boolean" };
const list = (items: unknown) => ({ type: "array", items });
const nullable = (schema: unknown) => ({ anyOf: [schema, { type: "null" }] });
const map = (schema: unknown) => ({ type: "object", additionalProperties: schema });
const context = { revision: integer, actor: ref("Actor"), sources: list({ type: "string", enum: ["NeMo", "F5"] }), accessMode: { type: "string", enum: ["local", "demo", "authenticated"] }, sourceErrors: responseSchemas.Workspace.properties.sourceErrors };
const requiredContext = ["revision", "actor", "sources"];
const wrap = (properties: Record<string, unknown>) => obj({ ...context, ...properties }, [...requiredContext, ...Object.keys(properties)]);
const detail = { item: ref("Entity"), job: nullable(ref("Job")), binding: nullable(ref("Binding")), relatedGuardrails: list(ref("Entity")), usedByProfiles: list(ref("ProfileUsage")) };
const paginated = (item: string, extra = {}) => wrap({ items: list(ref(item)), pagination: ref("Pagination"), ...extra });
export const restResponseSchemas = {
  CurrentMarketplaceActor: obj({ actor: ref("Actor"), accessMode: context.accessMode }),
  Pagination: obj({ page: { type: "integer", minimum: 1 }, pageSize: { type: "integer", minimum: 1, maximum: 100 }, total: integer, totalPages: integer }),
  ResourceList: paginated("Entity", { jobs: map(ref("Job")), bindings: map(ref("Binding")) }),
  ResourceDetail: wrap(detail),
  ProfileUsage: obj({ id: text, name: text, draftReference: bool, deployedReference: bool }),
  BusinessVersion: obj({ version: { type: "integer", minimum: 1 }, isCurrent: bool, isDeployed: bool }),
  BusinessVersionList: wrap({ items: list(ref("BusinessVersion")) }),
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
const queryFields = {
  page: field("One-based result page. Defaults to 1.", "List footer. Reset to 1 when the filter or sorting changes."),
  pageSize: field("Maximum rows per page, from 1 to 100. Defaults to 20.", "List footer or integrating UI page size."),
  q: field("Case-insensitive keyword search over fields relevant to this list.", "Search field above Guardrail, Profile, evaluation, job or Trace rows."),
  order: field("Sort direction for the selected or default sort field.", "Table sort direction. The default is descending."),
  sort: field("Resource column used to sort before pagination: updated, id, or name.", "Last Modified, ID or name sort in an API-driven list."),
  status: field("Exact stored workflow status. Send the enum value rather than the display label.", "Status filter. For example Evaluation ready uses TEST READY."),
  kind: field("Restrict the list to Guardrail or Profile.", "Use the active Guardrail or Profile Sign-Off or Deployment page."),
  provider: field("Restrict results to the implemented NeMo or F5 source.", "Provider filter in an API-driven list."),
  unit: field("Exact control-unit filter within the caller's authorized scope.", "Control Unit filter on resource lists."),
  resourceId: field("Restrict records to one Marketplace Guardrail or Profile ID.", "Resource detail history, evaluation or job panel."),
  version: field("Marketplace business version of the recorded run. Omit for all versions.", "Evaluation Records → Version selector."),
  actor: field("Exact display name recorded for an audit actor.", "Actor filter on the integrating Trace UI."),
  from: field("Inclusive earliest audit timestamp, with time zone offset.", "Start of the date range in an API-driven Trace list."),
  to: field("Inclusive latest audit timestamp, with time zone offset.", "End of the date range in an API-driven Trace list."),
};
const jobStatusFilter = field("Exact job lifecycle state: pending, failed, uncertain or done.", "Job list and backend status filters.");
const common = "Uses the same identity, control-unit scope and NeMo/F5 business service as the compatible workspace/commands APIs. X-Marketplace-Role is demo selection only, not authentication. Ordinary GET requests never import resources. Query parameters are strict: unknown or repeated parameters return 422. X-Request-ID correlates server logs; X-Operation-ID identifies this endpoint.";
const command = " Supply a UUID requestId. Create accepts an omitted or legacy expectedRevision. For existing records, send the revision of the snapshot reviewed by the caller. Retrying the same logical command must reuse the UUID and identical fields. Resource ID and kind come from the URL. Imported NeMo and F5 resources are read-only. 202 means pending/inflight work; follow Location to GET the current job. GET does not advance work: POST /jobs/{resourceId}/advance performs one step; failed/uncertain jobs require reconcile. No autonomous background worker is introduced. 200/201 may contain a failed/uncertain job after a local save; always inspect job.status/message. Approval, deployment and job IDs currently identify resources and their current workflow, not immutable historical requests. Changes to other records do not invalidate the reviewed snapshot.";
const draft = { name: "Customer protection", description: "Protect customer information", location: "ALL", mandatory: false, refs: [], attributes: { bu: "ISS", agent: "Customer assistant", data: "Text" }, threshold: 5 };
function exampleFor(action?: string, kind?: string) {
  const envelope = { requestId: "d594d357-2aeb-446b-a116-2e1d8dca4a7b", ...(action === "create" ? {} : { expectedRevision: 0 }) };
  if (["create", "edit", "revise"].includes(action ?? "")) return { ...envelope, draft: { ...draft, ...(kind === "Profile" ? { refs: ["customer-control"] } : {}) } };
  if (action === "implement") return { ...envelope, provider: "NeMo", config: { scannerType: "keyword", direction: "request", content: "private-key", versionName: "v1", versionDescription: "Initial definition" } };
  if (action === "evaluate") return { ...envelope, dataset: "Acceptance", cases: [{ input: "private-key", expected: "block", phase: "input" }, { input: "hello", expected: "allow", phase: "input" }] };
  return { ...envelope, ...(action === "reject" ? { reason: "Please revise the requirements" } : {}) };
}
export function restOpenApi(commonParameters: unknown[], errors: Record<string, unknown>) {
  const paths: Record<string, Record<string, any>> = {};
  for (const route of restRoutes) {
    const parameters = [...commonParameters];
    if (route.path.includes("{id}")) parameters.push({ name: "id", in: "path", required: true, ...field(
      route.mode === "evaluation" ? "Recorded Marketplace evaluation run ID." : "Marketplace resource ID. For jobs, use the ID of the resource that owns the job.",
      route.mode === "evaluation" ? "Results → selected run." : "Selected record in Guardrail, Profile, Sign-Off, Deployment or job detail.",
    ), schema: { type: "string", pattern: "^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$" } });
    if (route.query) {
      const query = schema(route.query);
      for (const [name, value] of Object.entries(query.properties ?? {})) parameters.push({ name, in: "query", required: false,
        ...(route.mode === "jobs" && name === "status" ? jobStatusFilter : queryFields[name as keyof typeof queryFields]),
        schema: name === "page" || name === "pageSize" ? { type: "integer", minimum: 1, maximum: name === "pageSize" ? 100 : 1_000_000, default: name === "pageSize" ? 20 : 1 } : value,
      });
    }
    const headers = { "X-Request-ID": { ...requestIdHeader, schema: text }, "X-Operation-ID": { ...operationIdHeader, schema: text } };
    const success = (description: string) => ({ description, headers, content: { "application/json": { schema: ref(route.response) } } });
    const operation: Record<string, unknown> = { tags: [route.tag], operationId: route.operationId, summary: route.summary, description: common + (route.mode === "command" ? command : route.mode === "import" ? " Explicit synchronous import; returns after atomic merge. Counts describe available imported resources for this provider in the visible scope, not just newly created rows. F5 reads all Scanner/Project catalog pages and Scanner versions, preserving exact Project references and optional flags; missing values remain absent. Project deploymentStatus is native, not evidence of a published Profile version or runtime protection. Full discovery must succeed before merge. Failure retains the last snapshot. F5 and NeMo discovery use separate endpoints and provider-scoped concurrency; F5 network I/O does not hold the workspace database lock. Provider credentials and raw configuration payloads are not included. No remote resources are created. Routine list reads do not import." : ["job", "jobs"].includes(route.mode) ? " A job ID is the resource ID, representing its current task. Private provider payloads and leases are excluded. Subsequent workflows can replace the current task." : ""), security: [{}, { bearerAuth: [] }], parameters,
      responses: { "200": success("Completed request; inspect business/job status"), ...(route.action === "create" ? { "201": success("Resource created; inspect draft synchronization status") } : {}), ...(route.mode === "command" ? { "202": { ...success("Pending operation; explicitly advance or reconcile the job"), headers: { ...headers, Location: { ...field("Relative URL of the current resource job.", "Backend status panel. Poll this URL after an accepted write."), schema: text } } } } : {}), ...errors, default: { description: "Structured dependency failure", headers, content: { "application/json": { schema: ref("ErrorResponse") } } } } };
    if (route.body) operation.requestBody = {
      required: true,
      ...(route.mode === "command" ? { description: route.action === "create" ? "Send a fresh UUID requestId and the draft. Omit draft.id for automatic assignment and read item.id from the response. Reuse the same requestId and body on retry. Creating a different resource with an existing ID returns 409." : "Replace the example expectedRevision with the live top-level revision from the relevant GET response, and generate a UUID for the action." } : {}),
      content: { "application/json": { schema: withFieldDocs(schema(route.body), commandFields), example: route.mode === "import" ? {} : exampleFor(route.action, route.kind) } },
    };
    if (route.operationId === "listGuardrails") operation.description += " Tech (IT Admin) sees resources across control units. User and Approver (User Admin) see their assigned unit. Read /api/nmgr/v1/me for the effective role. Use unit to filter within scope.";
    if (route.mode === "identity") operation.description = "Returns the caller's identity, mapped role and control unit. User Admin is the Control Unit Approver. Strict V3 uses the NeMo business user Bearer token and the server-side account mapping. X-Marketplace-Role selects a workbench only in Demo mode. This read does not load workflow records or grant approval rights.";
    (paths[restBase + route.path] ??= {})[route.method.toLowerCase()] = operation;
  }
  return paths;
}
