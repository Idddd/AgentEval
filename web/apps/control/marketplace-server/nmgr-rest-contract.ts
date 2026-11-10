import { z } from "zod";
import { caseSchema, draftSchema } from "./nmgr-contract";
import { unifiedConfigSchema } from "../src/features/business-demo/evaluation";

export const restBase = "/api/nmgr/v1";
const page = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(1_000_000)).default(1);
const pageSize = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(100)).default(20);
const paging = { page, pageSize, q: z.string().trim().max(200).optional(), order: z.enum(["asc", "desc"]).default("desc") };
export const entityQuery = z.object({ ...paging, sort: z.enum(["id", "name", "updated"]).default("updated"), status: z.enum(["DRAFT", "TEST READY", "TEST FAILED", "TEST PASSED", "SIGNOFF REQUESTED", "SIGNED OFF", "DEPLOYED"]).optional(), kind: z.enum(["Guardrail", "Profile"]).optional(), provider: z.enum(["NeMo", "F5"]).optional(), unit: z.string().max(100).optional() }).strict();
export const auditQuery = z.object({ ...paging, resourceId: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/).optional(), actor: z.string().max(160).optional(), from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional() }).strict();
export const jobQuery = z.object({ ...paging, status: z.enum(["pending", "failed", "uncertain", "done"]).optional(), resourceId: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/).optional() }).strict();
export const evaluationQuery = z.object({ ...paging, resourceId: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/).optional() }).strict();
export const noQuery = z.object({}).strict();
export const mutationEnvelope = { requestId: z.uuid(), expectedRevision: z.number().int().nonnegative() };
const createDraft = draftSchema.omit({ kind: true });
const updateDraft = createDraft.omit({ id: true });
export const createBody = z.object({ ...mutationEnvelope, draft: createDraft }).strict();
export const updateBody = z.object({ ...mutationEnvelope, draft: updateDraft }).strict();
export const actionBody = z.object(mutationEnvelope).strict();
export const rejectBody = z.object({ ...mutationEnvelope, reason: z.string().trim().min(1).max(2000) }).strict();
export const implementBody = z.object({ ...mutationEnvelope, provider: z.enum(["NeMo", "F5"]), config: unifiedConfigSchema.strict() }).strict();
export const evaluateBody = z.object({ ...mutationEnvelope, dataset: z.string().min(1).max(160), cases: z.array(caseSchema).max(500) }).strict();
export const reconcileBody = z.object({ ...mutationEnvelope, remoteId: z.uuid().optional() }).strict();
export type RestRoute = { method: "GET" | "POST" | "PUT"; path: string; operationId: string; tag: string; mode: string; summary: string; kind?: "Guardrail" | "Profile"; action?: string; query?: z.ZodType; body?: z.ZodType; response: string };
export const restRoutes: RestRoute[] = [];
for (const [collection, kind] of [["guardrails", "Guardrail"], ["profiles", "Profile"]] as const) {
  const path = `/${collection}`, tag = kind === "Profile" ? "Profiles" : "Guardrails";
  const add = (route: Omit<RestRoute, "tag" | "kind">) => restRoutes.push({ ...route, tag, kind });
  add({ method: "GET", path, operationId: `list${tag}`, mode: "entities", query: entityQuery, response: "ResourceList", summary: `List ${collection} with server-side filtering and pagination` });
  add({ method: "GET", path: `${path}/{id}`, operationId: `get${kind}`, mode: "detail", response: "ResourceDetail", summary: `Read ${kind} configuration, references and synchronization state` });
  add({ method: "GET", path: `${path}/{id}/backend-status`, operationId: `observe${kind}`, mode: "observe", response: "ResourceObservation", summary: `Query the linked NeMo/F5 ${kind} without changing it` });
  add({ method: "POST", path, operationId: `create${kind}`, mode: "command", action: "create", body: createBody, response: "ResourceMutation", summary: `Create a ${kind} through the existing workflow` });
  add({ method: "PUT", path: `${path}/{id}`, operationId: `edit${kind}`, mode: "command", action: "edit", body: updateBody, response: "ResourceMutation", summary: `Replace editable ${kind} draft fields` });
  add({ method: "POST", path: `${path}/{id}/revisions`, operationId: `revise${kind}`, mode: "command", action: "revise", body: updateBody, response: "ResourceMutation", summary: `Create the next ${kind} business revision` });
  add({ method: "POST", path: `${path}/{id}/approval-requests`, operationId: `request${kind}Approval`, mode: "command", action: "request", body: actionBody, response: "ResourceMutation", summary: `Submit ${kind} for sign-off` });
  add({ method: "POST", path: `${path}/{id}/deployments`, operationId: `deploy${kind}`, mode: "command", action: "deploy", body: actionBody, response: "ResourceMutation", summary: `Queue publication of the approved ${kind}` });
}
restRoutes.push(
  { method: "POST", path: "/guardrails/{id}/implementation", operationId: "implementGuardrail", tag: "Guardrails", mode: "command", kind: "Guardrail", action: "implement", body: implementBody, response: "ResourceMutation", summary: "Tech selects the provider and saves implementation" },
  { method: "POST", path: "/guardrails/{id}/evaluations", operationId: "evaluateGuardrail", tag: "Evaluations", mode: "command", kind: "Guardrail", action: "evaluate", body: evaluateBody, response: "ResourceMutation", summary: "Queue a real provider evaluation" },
  { method: "GET", path: "/evaluation-candidates", operationId: "listEvaluationCandidates", tag: "Evaluations", mode: "candidates", kind: "Guardrail", query: entityQuery, response: "ResourceList", summary: "List implemented Guardrails ready for evaluation" },
  { method: "GET", path: "/evaluations", operationId: "listEvaluations", tag: "Evaluations", mode: "evaluations", query: evaluationQuery, response: "EvaluationList", summary: "List recorded evaluation runs and evidence" },
  { method: "GET", path: "/evaluations/{id}", operationId: "getEvaluation", tag: "Evaluations", mode: "evaluation", response: "EvaluationDetail", summary: "Read a recorded evaluation by run ID" },
  { method: "GET", path: "/approval-requests", operationId: "listApprovalRequests", tag: "Approvals", mode: "approvals", query: entityQuery, response: "ResourceList", summary: "List resources currently awaiting sign-off" },
  { method: "GET", path: "/approval-requests/{id}", operationId: "getApprovalRequest", tag: "Approvals", mode: "detail", response: "ResourceDetail", summary: "Read current approval context using a resource ID" },
  { method: "GET", path: "/deployments", operationId: "listDeployments", tag: "Deployments", mode: "deployments", query: entityQuery, response: "ResourceList", summary: "List release candidates and previously deployed resources" },
  { method: "GET", path: "/deployments/{id}", operationId: "getDeployment", tag: "Deployments", mode: "detail", response: "ResourceDetail", summary: "Read current release context using a resource ID" },
  { method: "GET", path: "/jobs", operationId: "listJobs", tag: "Jobs", mode: "jobs", query: jobQuery, response: "JobList", summary: "List current resource jobs; no automatic advancement" },
  { method: "GET", path: "/jobs/{id}", operationId: "getJob", tag: "Jobs", mode: "job", response: "JobDetail", summary: "Read the current job using its resource ID" },
  { method: "GET", path: "/audit-events", operationId: "listAuditEvents", tag: "Audit", mode: "audit", query: auditQuery, response: "AuditList", summary: "Query configuration workflow history, not runtime scan traces" },
  { method: "GET", path: "/dashboard/summary", operationId: "getDashboardSummary", tag: "Dashboard", mode: "dashboard", response: "DashboardSummary", summary: "Read published configuration counts; unavailable traffic metrics are null" },
  { method: "GET", path: "/capabilities", operationId: "getCapabilities", tag: "Capabilities", mode: "capabilities", response: "Capabilities", summary: "Read implemented and unavailable backend capabilities" },
  { method: "POST", path: "/integrations/nemo/imports", operationId: "importNemoResources", tag: "Integrations", mode: "import", body: noQuery, response: "ImportResult", summary: "Discover NeMo resources and atomically import bindings (synchronous)" },
  { method: "POST", path: "/integrations/f5/imports", operationId: "importF5Resources", tag: "Integrations", mode: "import", body: noQuery, response: "ImportResult", summary: "Import F5 Scanners, versions, Projects and exact bindings (synchronous)" },
);
for (const action of ["approve", "reject", "withdraw"])
  restRoutes.push({ method: "POST", path: `/approval-requests/{id}/${action}`, operationId: `${action}ApprovalRequest`, tag: "Approvals", mode: "command", action, body: action === "reject" ? rejectBody : actionBody, response: "ResourceMutation", summary: `${action} the resource's current approval request` });
for (const action of ["advance", "reconcile"])
  restRoutes.push({ method: "POST", path: `/jobs/{id}/${action}`, operationId: `${action}ResourceJob`, tag: "Jobs", mode: "command", action, body: action === "reconcile" ? reconcileBody : actionBody, response: "ResourceMutation", summary: `${action} the current job; preserve request ID on identical retries` });

export function matchRestRoute(pathname: string, method: string) {
  const path = pathname.slice(restBase.length);
  for (const route of restRoutes) {
    const match = new RegExp(`^${route.path.replace("{id}", "([^/]+)")}$`).exec(path);
    if (match && route.method === method) return { route, id: match[1] ? decodeURIComponent(match[1]) : undefined };
  }
  return undefined;
}
