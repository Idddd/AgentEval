import { z } from "zod";
import { StoreError } from "./marketplace-db";
import { diagnosticResponse } from "./diagnostics";
import { matchRestRoute, noQuery } from "./nmgr-rest-contract";
import type { NmgrService } from "./nmgr";
import type { Entity } from "../src/features/nmgr/model";
import { addRequestMetadata } from "./nmgr-request-context";

type Snapshot = Awaited<ReturnType<NmgrService["snapshot"]>> & { accessMode?: string };
type Legacy = (request: Request) => Promise<Response>;
class UpstreamResponse { constructor(readonly response: Response) {} }
const fail = (status: number, message: string): never => { throw new StoreError(status, message); };
const json = (value: unknown, status = 200, headers = {}) => Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
const context = (s: Snapshot) => ({ revision: s.revision, actor: s.actor, sources: s.sources, ...(s.accessMode ? { accessMode: s.accessMode } : {}), ...(s.sourceErrors ? { sourceErrors: s.sourceErrors } : {}) });
const resource = (s: Snapshot, id: string | undefined, kind?: string) => s.state.entities.find(e => e.id === id && (!kind || e.kind === kind)) ?? fail(404, "Resource not found.");
const details = (s: Snapshot, e: Entity) => ({ ...context(s), item: e, job: s.jobs[e.id] ?? null, binding: s.bindings[`${e.id}@${e.version}`] ?? null, relatedGuardrails: e.kind === "Profile" ? s.state.entities.filter(ref => ref.kind === "Guardrail" && e.refs.includes(ref.id)) : [] });
function paginate<T>(items: T[], query: any) {
  const { page, pageSize } = query;
  return { items: items.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total: items.length, totalPages: Math.ceil(items.length / pageSize) } };
}
function compare(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
function filterEntities(items: Entity[], query: any) {
  return items.filter(e => (!query.kind || e.kind === query.kind) && (!query.status || e.status === query.status) && (!query.provider || !e.sourcePending && e.provider === query.provider) && (!query.unit || e.unit === query.unit) && (!query.q || `${e.name} ${e.id} ${e.description} ${e.imported?.remoteId ?? ""}`.toLowerCase().includes(query.q.toLowerCase())))
    .sort((a, b) => (compare(String(a[query.sort as "id" | "name" | "updated"]), String(b[query.sort as "id" | "name" | "updated"])) || compare(a.id, b.id)) * (query.order === "asc" ? 1 : -1));
}
async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) fail(415, "JSON is required.");
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 1_000_000) fail(413, "Request is too large.");
  try { return JSON.parse(raw); } catch { return fail(422, "Invalid JSON."); }
}

export async function nmgrRestApi(request: Request, invoke: Legacy): Promise<Response> {
  let operation = "resourceApi";
  try {
    const url = new URL(request.url), matched = matchRestRoute(url.pathname, request.method);
    if (!matched) fail(404, "Resource API route or method not found.");
    const { route, id } = matched!; operation = route.operationId;
    if (id && !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/.test(id)) fail(422, "Invalid resource identifier.");
    const params: Record<string, string> = Object.create(null);
    const querySchema = route.query ?? noQuery;
    for (const [key, value] of url.searchParams) {
      if (!(querySchema instanceof z.ZodObject) || !Object.hasOwn(querySchema.shape, key)) fail(422, "Unknown query parameter.");
      if (Object.hasOwn(params, key)) fail(422, "Duplicate query parameters are not allowed.");
      params[key] = value;
    }
    const query = querySchema.parse(params) as any;
    if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to)) fail(422, "from must be earlier than or equal to to.");
    const body = route.body ? route.body.parse(await readBody(request)) as any : undefined;
    const call = async (path: string, command?: unknown, discover = false) => {
      const headers = new Headers(request.headers);
      headers.delete("content-length"); headers.delete("x-marketplace-import");
      if (discover) headers.set("X-Marketplace-Import", "true");
      if (command !== undefined) headers.set("Content-Type", "application/json");
      const response = await invoke(new Request(new URL(`/api/nmgr/${path}`, url), { method: command !== undefined ? "POST" : "GET", headers, signal: request.signal, ...(command !== undefined ? { body: JSON.stringify(command) } : {}) }));
      if (!response.ok) throw new UpstreamResponse(response);
      return response.json();
    };
    // The existing API owns authentication, control-unit visibility and backend isolation.
    const snapshot: Snapshot = await call("workspace", undefined, route.mode === "import");
    const meta = context(snapshot);
    if (route.mode === "import") return json({ ...meta, imported: { guardrails: snapshot.state.entities.filter(e => e.kind === "Guardrail" && e.imported?.available).length, profiles: snapshot.state.entities.filter(e => e.kind === "Profile" && e.imported?.available).length } });
    if (route.mode === "command") {
      const target = route.action === "create" ? undefined : resource(snapshot, id, route.kind);
      const envelope = { requestId: body.requestId, expectedRevision: body.expectedRevision };
      addRequestMetadata({ commandId: body.requestId, resourceId: target?.id ?? body.draft?.id });
      let command: Record<string, unknown>;
      if (["create", "edit", "revise"].includes(route.action!)) command = { ...envelope, type: route.action, draft: { ...body.draft, id: target?.id ?? body.draft.id, kind: route.kind } };
      else if (["advance", "reconcile"].includes(route.action!)) command = { ...body, type: route.action, id: target!.id };
      else if (route.action === "evaluate") command = { ...body, type: "evaluate", id: target!.id };
      else command = { ...body, type: "action", action: route.action, id: target!.id };
      const saved: Snapshot = await call("commands", command);
      const item = resource(saved, target?.id ?? body.draft.id, route.kind), job = saved.jobs[item.id];
      if (job) addRequestMetadata({ jobStatus: job.status, ...(job.traceId ? { operationReference: job.traceId } : {}) });
      const pending = !!job && (job.status === "pending" || !!job.inflight);
      const status = pending ? 202 : route.action === "create" ? 201 : 200;
      const jobUrl = job ? `/api/nmgr/v1/jobs/${item.id}` : null;
      return json({ ...details(saved, item), jobId: job ? item.id : null, jobUrl }, status, jobUrl && pending ? { Location: jobUrl } : {});
    }
    if (route.mode === "observe") { const e = resource(snapshot, id, route.kind); return json(await call(`workspace?resource=${encodeURIComponent(e.id)}`)); }
    if (route.mode === "detail") return json(details(snapshot, resource(snapshot, id, route.kind)));
    if (["entities", "candidates", "approvals", "deployments"].includes(route.mode)) {
      let entities = snapshot.state.entities.filter(e => !route.kind || e.kind === route.kind);
      if (route.mode === "candidates") entities = entities.filter(e => ["TEST READY", "TEST PASSED", "TEST FAILED"].includes(e.status));
      if (route.mode === "approvals") entities = entities.filter(e => e.status === "SIGNOFF REQUESTED");
      if (route.mode === "deployments") entities = entities.filter(e => e.status === "SIGNED OFF" || e.deployed !== null);
      const result = paginate(filterEntities(entities, query), query), ids = new Set(result.items.map(e => e.id));
      return json({ ...meta, ...result, jobs: Object.fromEntries(Object.entries(snapshot.jobs).filter(([key]) => ids.has(key))), bindings: Object.fromEntries(Object.entries(snapshot.bindings).filter(([key]) => ids.has(key.split("@")[0]!))) });
    }
    if (route.mode === "jobs" || route.mode === "job") {
      const jobs = Object.entries(snapshot.jobs).map(([resourceId, job]) => ({ id: resourceId, resourceId, ...job }));
      if (route.mode === "job") return json({ ...meta, item: jobs.find(job => job.id === id) ?? fail(404, "Job not found.") });
      const filtered = jobs.filter(job => (!query.status || job.status === query.status) && (!query.resourceId || job.resourceId === query.resourceId) && (!query.q || `${job.id} ${job.phase}`.toLowerCase().includes(query.q.toLowerCase())))
        .sort((a, b) => (compare(a.started, b.started) || compare(a.id, b.id)) * (query.order === "asc" ? 1 : -1));
      return json({ ...meta, ...paginate(filtered, query) });
    }
    if (route.mode === "evaluations" || route.mode === "evaluation") {
      const runs = snapshot.state.entities.flatMap(e => e.runs.map(run => ({ ...run, resourceId: e.id, resourceName: e.name })));
      if (route.mode === "evaluation") return json({ ...meta, item: runs.find(run => run.id === id) ?? fail(404, "Evaluation not found.") });
      const filtered = runs.filter(run => (!query.resourceId || run.resourceId === query.resourceId) && (!query.q || `${run.resourceName} ${run.dataset}`.toLowerCase().includes(query.q.toLowerCase())))
        .sort((a, b) => (compare(a.start, b.start) || compare(a.id, b.id)) * (query.order === "asc" ? 1 : -1));
      return json({ ...meta, ...paginate(filtered, query) });
    }
    if (route.mode === "audit") {
      const rows = snapshot.state.audit.filter(a => (!query.resourceId || a.entity === query.resourceId) && (!query.actor || a.actor === query.actor) && (!query.q || `${a.action} ${a.entity} ${a.actor}`.toLowerCase().includes(query.q.toLowerCase())) && (!query.from || Date.parse(a.time) >= Date.parse(query.from)) && (!query.to || Date.parse(a.time) <= Date.parse(query.to)))
        .sort((a, b) => (compare(a.time, b.time) || compare(a.id, b.id)) * (query.order === "asc" ? 1 : -1));
      return json({ ...meta, ...paginate(rows, query) });
    }
    if (route.mode === "dashboard") {
      const published = snapshot.state.entities.filter(e => e.deployed !== null);
      return json({ ...meta, counts: { guardrails: published.filter(e => e.kind === "Guardrail").length, profiles: published.filter(e => e.kind === "Profile").length, pendingApprovals: snapshot.state.entities.filter(e => e.status === "SIGNOFF REQUESTED").length, failedJobs: Object.values(snapshot.jobs).filter(j => ["failed", "uncertain"].includes(j.status)).length }, metrics: { runtimeConnected: false, traffic: null, passed: null, blocked: null, modified: null } });
    }
    return json({ ...meta, capabilities: { configuration: { available: true }, evaluations: { available: true }, approvals: { available: true }, deployments: { available: true }, audit: { available: true, reason: "Configuration workflow only" }, measure: { available: false, reason: "Live scan metrics and scan details are not connected" }, feedback: { available: false, reason: "Live feedback and closure storage are not connected" }, runtimeControl: { available: false, reason: "Bypass, Monitoring and Preventing are not connected" }, runners: { available: false, reason: "Runner monitoring is not connected" } } });
  } catch (error) {
    if (error instanceof UpstreamResponse) return error.response;
    return diagnosticResponse(error instanceof z.ZodError ? new StoreError(422, `Invalid fields: ${error.issues.map(i => i.path.join(".") || "request").join(", ")}. Check the endpoint schema.`) : error, "workspace", operation, "Resource API request failed.");
  }
}
