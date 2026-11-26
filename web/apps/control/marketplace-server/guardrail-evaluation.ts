import { createHash } from "node:crypto";
import { z } from "zod";
import type { NmgrPersistence } from "./nmgr";
import { evaluationApiBase } from "./evaluation-connection";
import { DeploymentError } from "./diagnostics";
import { nmgrRequestContext } from "./nmgr-request-context";

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/);
const providerId = z.union([id, z.literal("nemo guardrail")]);
const normalizedProvider = (value: string) => value.toLowerCase() === "nemo guardrail" ? "nemo" : value.toLowerCase();
const version = z.coerce.number().int().min(1).max(1_000_000);
const revision = z.string().regex(/^[\w:./-]{1,256}$/);
const count = z.number().int().nonnegative();
const configSchema = z.object({
  id, version, revision, execution_mode: z.string(), data_source: z.string(),
  default_endpoint: z.object({ provider: providerId, guardrail_id: id }).nullish(),
  datasets: z.array(z.object({ dataset_id: id, dataset_version: count })).default([]),
  benchmarks: z.array(z.object({ dataset_id: id, dataset_version: count, name: z.string().nullish() })).default([]),
});
const runSchema = z.object({
  id, experiment_id: id, status: z.enum(["RUNNING", "COMPLETED", "FAILED", "CANCELLED"]),
  phase: z.string().nullish(), completed: count, sample_count: count, created_at: z.string(),
  execution_mode: z.literal("guardrail"), target_id: id, guardrail_provider: providerId, guardrail_instance_id: id,
  snapshot: z.object({ target: z.object({ version }) }),
});
const reportSchema = z.object({
  evaluation_id: id, status: z.enum(["RUNNING", "COMPLETED", "FAILED", "CANCELLED"]), total: count,
  nextOffset: count.nullish(),
  overall: z.object({ TP: count, FP: count, TN: count, FN: count, errors: count }),
  results: z.array(z.object({
    caseid: z.string(), status: z.enum(["PASS", "FAIL", "ERROR"]),
    guardrail_result: z.object({
      http_status: count.nullish(),
      classifications: z.array(z.object({ expected: z.string().nullish(), predicted: z.string().nullish() })).default([]),
    }).nullish(),
  })),
});
const historySchema = z.object({ items: z.array(z.object({
  report_id: id, config_id: id, config_version: version, created_at: z.string(),
  guardrail_id: id, provider: providerId, status: z.enum(["RUNNING", "COMPLETED", "FAILED", "CANCELLED"]),
})) });
const bindingsSchema = z.record(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}@[1-9]\d{0,5}$/), id);

type Env = NodeJS.ProcessEnv;
type Input = { guardrail: string; version: number; run?: string | undefined; report?: string | undefined; offset: number; revision?: string | undefined };
const query = z.object({ guardrail: id, version, run: id.optional(), report: z.literal("true").optional(), offset: z.coerce.number().int().min(0).max(1_000_000).default(0), revision: revision.optional() }).strict();
export type EvaluationInput = Input;
export type EvaluationScope = { provider?: string | undefined; demo?: boolean | undefined; workspace: string; database?: NmgrPersistence };

export class EvaluationError extends Error {
  upstream?: DeploymentError["upstream"];
  constructor(readonly status: number, readonly code: string, message: string, options?: ErrorOptions) { super(message, options); }
}
const fail = (status: number, code: string, message: string): never => { throw new EvaluationError(status, code, message); };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
function failResponse(error: unknown) {
  if (error instanceof EvaluationError) return json({ error: { code: error.code, message: error.message } }, error.status);
  return json({ error: { code: "evaluation_response_invalid", message: "The evaluation service returned an incompatible response. Check the API version and service logs." } }, 502);
}
function readBindings(env: Env) {
  try {
    const bindings = bindingsSchema.parse(JSON.parse(env.MARKETPLACE_EVALUATION_BINDINGS?.trim() || "{}"));
    const targets = Object.entries(bindings).map(([ref, target]) => `${target}@${ref.split("@")[1]}`);
    if (new Set(targets).size !== targets.length) throw new Error("Duplicate evaluation scope");
    return bindings;
  }
  catch { return fail(503, "evaluation_bindings_invalid", "Check MARKETPLACE_EVALUATION_BINDINGS: map each guardrail ID and revision to an evaluation target ID."); }
}
const loopback = (host: string) => ["127.0.0.1", "localhost", "[::1]", "::1"].includes(host);
export function evaluationEnabled(env: Env) { return !!env.MARKETPLACE_EVALUATION_URL?.trim(); }
export function useMockEvaluation(env: Env) {
  return (env.MARKETPLACE_V3_DEMO === "true" || env.MARKETPLACE_V3_DEMO === "false") &&
    !evaluationEnabled(env) && !env.MARKETPLACE_EVALUATION_OVERRIDE_INVALID;
}
function allowDemo(env: Env) {
  return evaluationEnabled(env) && (env.MARKETPLACE_DATA_MODE ?? "mock") === "mock" && loopback(env.NITRO_HOST ?? env.HOST ?? "");
}
export function demoEvaluationRefs(env: Env) {
  if (!allowDemo(env)) return [];
  try { return Object.keys(readBindings(env)); } catch { return []; }
}
export function evaluationInput(request: Request): Input {
  const search = new URL(request.url).searchParams;
  const parsed = query.safeParse(Object.fromEntries(search));
  if (!parsed.success || new Set(search.keys()).size !== search.size)
    return fail(422, "evaluation_request_invalid", "Select a valid guardrail revision and evaluation run.");
  const value = parsed.data;
  if (request.method === "POST" ? !value.revision || value.run || value.report || value.offset :
    request.method !== "GET" || value.revision || (value.report && !value.run) || (value.offset && !value.report))
    return fail(422, "evaluation_request_invalid", "The evaluation request has incompatible fields.");
  return value;
}

function apiBase(env: Env) {
  if (!evaluationEnabled(env)) return fail(503, "evaluation_not_configured", "No Evaluate URL is active. Configure the service in V3 Connections or set marketplace.evaluationUrl in the deployment. No request was sent.");
  try { return evaluationApiBase(env.MARKETPLACE_EVALUATION_URL!); }
  catch { return fail(503, "evaluation_url_invalid", "Configure a valid HTTP(S) MARKETPLACE_EVALUATION_URL without credentials, query or fragment."); }
}

export async function probeEvaluation(env: Env, fetcher: typeof fetch) {
  try {
    const get = client(env, fetcher, true);
    await get("/targets?limit=1", z.object({ items: z.array(z.object({ id })), total: count }));
  } catch (error) {
    if (error instanceof EvaluationError) {
      const failure = new DeploymentError("evaluation", error.code, error.message, undefined, error.status, error.cause);
      if (error.upstream) failure.upstream = error.upstream;
      throw failure;
    }
    throw new DeploymentError("evaluation", "evaluation_response_invalid", "Evaluate did not return a valid target list. Use the evaluation API service URL, not the web UI.", ["MARKETPLACE_EVALUATION_URL"], 502);
  }
}

function client(env: Env, fetcher: typeof fetch, probing = false) {
  const base = apiBase(env);
  return async <T>(path: string, schema: z.ZodType<T>, init?: { key: string; configRevision: string }) => {
    let response: Response;
    const requestId = nmgrRequestContext.getStore()?.requestId;
    try {
      response = await fetcher(base + path, {
        method: init ? "POST" : "GET", redirect: probing ? "manual" : "error", signal: AbortSignal.timeout(12_000),
        headers: {
          Accept: "application/json",
          ...(requestId ? { "X-Request-ID": requestId } : {}),
          ...(env.MARKETPLACE_EVALUATION_TOKEN ? { Authorization: `Bearer ${env.MARKETPLACE_EVALUATION_TOKEN.trim()}` } : {}),
          ...(env.MARKETPLACE_EVALUATION_PROJECT_ID ? { "X-Project-ID": env.MARKETPLACE_EVALUATION_PROJECT_ID.trim() } : {}),
          ...(init ? { "Content-Type": "application/json", "Idempotency-Key": init.key } : {}),
        },
        ...(init ? { body: JSON.stringify({ config_revision: init.configRevision }) } : {}),
      });
    } catch (error) {
      throw new EvaluationError(503, "evaluation_unreachable", error instanceof Error && error.name === "TimeoutError"
        ? "The evaluation service timed out. Check its health, network and logs."
        : "Cannot reach the evaluation service. Check its URL, network and trusted TLS settings.", { cause: error });
    }
    const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    const contentType = type && /^[a-z0-9.+-]{1,40}\/[a-z0-9.+-]{1,48}$/.test(type) ? type : null;
    const reject = (status: number, code: string, message: string): never => {
      const error = new EvaluationError(status, code, message);
      error.upstream = { httpStatus: response.status, contentType };
      throw error;
    };
    if (!response.ok || contentType !== "application/json") void response.body?.cancel().catch(() => {});
    if (!response.ok) {
      if (response.status >= 300 && response.status < 400) return reject(502, "evaluation_redirect", "The Evaluate API redirected the request. Verify that the URL serves the API directly rather than a login page.");
      if ([401, 403].includes(response.status)) return reject(502, "evaluation_credentials", "The evaluation service rejected Marketplace credentials. Check its token and project access.");
      if (response.status === 404) return reject(404, "evaluation_not_found", probing ? "The Evaluate target catalog route was not found. Check the API base URL and gateway routing." : "The evaluation target, run or report was not found in the configured project.");
      if (response.status === 409) return reject(409, "evaluation_changed", "The evaluation configuration changed or the service rejected the request as conflicting. Reload before starting a new run.");
      if (response.status === 422) return reject(422, "evaluation_rejected", "The evaluation service rejected the configuration. Check the published datasets, runner and guardrail endpoint.");
      if (response.status === 429 || response.status >= 500) return reject(503, "evaluation_busy", `The evaluation service is temporarily unavailable (HTTP ${response.status}).`);
      return reject(502, "evaluation_api_error", `The evaluation service returned HTTP ${response.status}. Check gateway routing and service logs.`);
    }
    if (contentType !== "application/json")
      return reject(502, "evaluation_response_invalid", "Evaluate returned a non-JSON response. Check whether the URL routes to the API, a web page, or an authentication gateway.");
    try { return schema.parse(await response.json()); }
    catch { return reject(502, "evaluation_response_invalid", "Evaluate returned an incompatible JSON response. Check the API version and gateway routing."); }
  };
}

type MockRun = { id: string; status: "COMPLETED"; createdAt: string };
async function mockEvaluation(request: Request, input: Input, scope: EvaluationScope, database: NmgrPersistence) {
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  const scopeKey = digest(JSON.stringify([scope.workspace, input.guardrail, input.version, scope.provider]));
  const historyKey = "mock-eval:" + scopeKey;
  const revision = "mock:" + scopeKey;
  const rows = ["allow", "block"].map(label => ({
    id: "sample-" + label, status: "PASS", labels: [{ expected: label, observed: label }],
  }));
  const runView = (run: MockRun) => ({ ...run, completed: rows.length, total: rows.length });
  if (request.method === "POST") {
    const key = z.string().uuid().safeParse(request.headers.get("idempotency-key"));
    if (!key.success) return fail(422, "evaluation_request_invalid", "Starting an evaluation requires a valid request ID.");
    if (input.revision !== revision) return fail(409, "evaluation_changed", "Reload the evaluation setup before starting a mock run.");
    const runId = "mock-" + digest(scopeKey + key.data);
    const run = await database.exclusive(async () => {
      const history = await database.readDocument<MockRun[]>(historyKey) ?? [];
      const existing = await database.readDocument<MockRun>(mockRunDocument(scopeKey, runId));
      const entry: MockRun = existing ?? { id: runId, createdAt: new Date().toISOString(), status: "COMPLETED" };
      if (!existing) await database.writeDocument(mockRunDocument(scopeKey, runId), entry);
      if (!history.some(item => item.id === runId))
        await database.writeDocument(historyKey, [entry, ...history].slice(0, 12));
      return entry;
    });
    return json({ source: "mock", run: runView(run) }, 202);
  }
  if (input.run) {
    // Scope the stored lookup even when a caller supplies another workspace's run ID.
    const run = await database.readDocument<MockRun>(mockRunDocument(scopeKey, input.run));
    if (!run) return fail(404, "evaluation_not_found", "Mock run not found for this guardrail revision.");
    if (!input.report) return json({ source: "mock", run: runView(run) });
    return json({ source: "mock", report: { status: run.status, total: rows.length, matched: rows.length,
      mismatches: 0, errors: 0, offset: input.offset, nextOffset: null, rows: rows.slice(input.offset) } });
  }
  return json({ source: "mock", setup: { revision, target: input.guardrail, endpoint: input.guardrail, demo: false,
    datasets: [{ id: "mock-examples", version: 1, name: "Mock examples" }] },
    history: await database.readDocument<MockRun[]>(historyKey) ?? [] });
}
function mockRunDocument(scopeKey: string, runId: string) {
  return "mock-run:" + createHash("sha256").update(scopeKey + "/" + runId).digest("hex");
}

export async function guardrailEvaluation(
  request: Request, env: Env, authorize: (input: Input) => Promise<EvaluationScope> | EvaluationScope, fetcher: typeof fetch = fetch,
) {
  try {
    const input = evaluationInput(request);
    const scope = await authorize(input);
    if (scope.database && useMockEvaluation(env)) return await mockEvaluation(request, input, scope, scope.database);
    const bindings = readBindings(env), ref = `${input.guardrail}@${input.version}`;
    if (scope.demo && !Object.hasOwn(bindings, ref)) return fail(404, "evaluation_not_bound", "No independent evaluation is mapped to this demo guardrail revision.");
    const target = Object.hasOwn(bindings, ref) ? bindings[ref]! : input.guardrail;
    if (!Object.hasOwn(bindings, ref) && Object.entries(bindings).some(([other, mapped]) => mapped === target && other.endsWith(`@${input.version}`)))
      return fail(404, "evaluation_not_bound", "This evaluation target is mapped to a different guardrail.");
    const get = client(env, fetcher);
    const targetPath = `/targets/${encodeURIComponent(target)}`;
    const providerMatches = (provider: string) => !scope.provider || normalizedProvider(provider) === normalizedProvider(scope.provider);
    const viewRun = (run: z.infer<typeof runSchema>) => {
      if (run.target_id !== target || run.snapshot.target.version !== input.version || !providerMatches(run.guardrail_provider))
        return fail(404, "evaluation_not_found", "This evaluation run does not belong to the selected guardrail revision.");
      return { id: run.id, status: run.status, phase: run.phase, completed: run.completed, total: run.sample_count, createdAt: run.created_at };
    };
    if (input.run) {
      const run = await get(`/runs/${encodeURIComponent(input.run)}`, runSchema);
      if (run.id !== input.run) throw new Error("Unexpected run ID");
      const result = viewRun(run);
      if (!input.report) return json({ run: result });
      let report;
      try { report = await get(`/reports/${encodeURIComponent(run.experiment_id)}?offset=${input.offset}&limit=25`, reportSchema); }
      catch (error) {
        if (error instanceof EvaluationError && error.status === 404)
          return fail(404, "evaluation_report_pending", "The evaluation report is not available yet.");
        throw error;
      }
      if (report.evaluation_id !== run.experiment_id) throw new Error("Unexpected report ID");
      return json({ report: {
        status: report.status, total: report.total, offset: input.offset, nextOffset: report.nextOffset,
        matched: report.overall.TP + report.overall.TN, mismatches: report.overall.FP + report.overall.FN, errors: report.overall.errors,
        rows: report.results.map(row => ({
          id: row.caseid.slice(0, 160), status: row.status, httpStatus: row.guardrail_result?.http_status,
          labels: (row.guardrail_result?.classifications ?? []).slice(0, 12).map(label => ({ expected: label.expected?.slice(0, 80), observed: label.predicted?.slice(0, 80) })),
        })),
      } });
    }
    const config = await get(targetPath + "/config", configSchema);
    if (config.id !== target || config.version !== input.version || config.execution_mode !== "guardrail")
      return fail(409, "evaluation_revision_mismatch", "The backend target is not a Guardrail evaluation for this revision. Publish the matching evaluation configuration.");
    if (!config.default_endpoint || !providerMatches(config.default_endpoint.provider))
      return fail(409, "evaluation_endpoint_missing", "Configure a default evaluation endpoint for the selected guardrail provider.");
    if (config.data_source !== "published" || !config.datasets.length)
      return fail(422, "evaluation_datasets_missing", "Publish a dataset in this evaluation configuration. Marketplace does not accept temporary uploads.");
    if (request.method === "POST") {
      const key = request.headers.get("idempotency-key");
      if (!key || !z.string().uuid().safeParse(key).success) return fail(422, "evaluation_request_invalid", "Starting an evaluation requires a valid request ID.");
      if (input.revision !== config.revision) return fail(409, "evaluation_changed", "The evaluation configuration changed. Reload before starting a new run.");
      const idempotencyKey = createHash("sha256").update(JSON.stringify([scope.workspace, ref, key])).digest("hex");
      const run = await get(targetPath + "/runs", runSchema, { key: idempotencyKey, configRevision: config.revision });
      return json({ run: viewRun(run) }, 202);
    }
    const history = await get(`/guardrail-reports?config_id=${encodeURIComponent(target)}&config_version=${input.version}`, historySchema);
    return json({
      setup: { revision: config.revision, target, demo: !!scope.demo, endpoint: config.default_endpoint.guardrail_id,
        datasets: config.datasets.map(d => ({
          id: d.dataset_id, version: d.dataset_version,
          name: config.benchmarks.find(b => b.dataset_id === d.dataset_id && b.dataset_version === d.dataset_version)?.name ?? d.dataset_id,
        })) },
      history: history.items.filter(row => row.config_id === target && row.config_version === input.version && providerMatches(row.provider))
        .slice(0, 12).map(row => ({ id: row.report_id, status: row.status, createdAt: row.created_at })),
    });
  } catch (error) { return failResponse(error); }
}

export function demoGuardrailEvaluation(request: Request, env = process.env, fetcher: typeof fetch = fetch) {
  return guardrailEvaluation(request, env, () => {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (!allowDemo(env) || !loopback(url.hostname) || (origin && origin !== url.origin) ||
        (request.method === "POST" && !origin) || request.headers.get("sec-fetch-site") === "cross-site" ||
        request.headers.get("x-marketplace-role") !== "IT Admin")
      return fail(403, "evaluation_demo_access_denied", "Independent demo evaluation is only available to Tech on a loopback Marketplace.");
    return { demo: true, workspace: "marketplace-loopback-demo" };
  }, fetcher);
}
