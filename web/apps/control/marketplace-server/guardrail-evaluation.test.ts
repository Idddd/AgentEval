import { describe, expect, it, vi } from "vitest";
import { demoGuardrailEvaluation, guardrailEvaluation } from "./guardrail-evaluation";
import { assertOpenApiResponse } from "./test-utils/openapi";

const origin = "http://127.0.0.1:18082";
const env = {
  HOST: "127.0.0.1", MARKETPLACE_EVALUATION_URL: "http://evaluation.internal",
  MARKETPLACE_EVALUATION_TOKEN: "server-only", MARKETPLACE_EVALUATION_PROJECT_ID: "test",
  MARKETPLACE_EVALUATION_BINDINGS: '{"banking@1":"test-suite"}',
};
const cfg = { id: "test-suite", version: 1, revision: "7:1", execution_mode: "guardrail", data_source: "published", default_endpoint: { provider: "f5", guardrail_id: "fixture" }, datasets: [{ dataset_id: "suite", dataset_version: 3 }] };
const run = { id: "eval-a", experiment_id: "exp-b", status: "RUNNING", phase: "QUEUED", completed: 0, sample_count: 4, created_at: "2026-11-24", execution_mode: "guardrail", target_id: "test-suite", guardrail_provider: "f5", guardrail_instance_id: "fixture", snapshot: { target: { version: 1 } } };
const key = "47a13ecc-5426-4c54-b3ff-4d1c21043dea";
function request(query = "", method = "GET", role = "IT Admin", site = origin) {
  return new Request(`${origin}/api/guardrail-evaluation?guardrail=banking&version=1${query}`, { method, headers: { origin: site, "x-marketplace-role": role, "idempotency-key": key } });
}

describe("independent Guardrail evaluation", () => {
  it("uses only the configured upstream and pinned revision with stable idempotency", async () => {
    const upstream = vi.fn(async (url: string, init?: RequestInit) => init?.method === "POST" ? Response.json(run) : Response.json(cfg));
    for (let n = 0; n < 2; n++) expect((await demoGuardrailEvaluation(request("&revision=7%3A1", "POST"), env, upstream as typeof fetch)).status).toBe(202);
    const writes = upstream.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes).toHaveLength(2);
    expect(writes[0]?.[0]).toBe("http://evaluation.internal/api/v1/evaluations/targets/test-suite/runs");
    expect(writes[0]?.[1]).toMatchObject({ redirect: "error", body: '{"config_revision":"7:1"}', headers: { Authorization: "Bearer server-only", "X-Project-ID": "test" } });
    expect(new Headers(writes[0]?.[1]?.headers).get("Idempotency-Key")).toEqual(new Headers(writes[1]?.[1]?.headers).get("Idempotency-Key"));
    const stale = await demoGuardrailEvaluation(request("&revision=6%3A1", "POST"), env, upstream as typeof fetch);
    expect(stale.status).toBe(409);
    expect(upstream.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
  });

  it("rejects cross-origin, unprivileged, unmapped and network-hosted demo requests without upstream calls", async () => {
    const upstream = vi.fn();
    expect((await demoGuardrailEvaluation(request("", "GET", "User"), env, upstream)).status).toBe(403);
    expect((await demoGuardrailEvaluation(request("&revision=7%3A1", "POST", "IT Admin", "http://other"), env, upstream)).status).toBe(403);
    expect((await demoGuardrailEvaluation(request(), { ...env, HOST: "0.0.0.0" }, upstream)).status).toBe(403);
    expect((await demoGuardrailEvaluation(request(), { ...env, MARKETPLACE_EVALUATION_BINDINGS: "{}" }, upstream)).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("returns only report fields for the authorized target revision", async () => {
    const report = { evaluation_id: "exp-b", status: "COMPLETED", total: 1, overall: { TP: 0, TN: 0, FP: 0, FN: 1, errors: 0 },
      results: [{ caseid: "sample", status: "FAIL", input: "never forwarded", reference: "private", guardrail_result: { http_status: 200, classifications: [{ expected: "unsafe", predicted: "safe" }] } }] };
    const upstream = vi.fn(async (url: string) => Response.json(url.includes("/reports/exp-b?") ? report : run));
    const readReport = new Request(`${origin}/api/nmgr/guardrail-evaluation?guardrail=banking&version=1&run=eval-a&report=true`);
    const response = await guardrailEvaluation(readReport, env, () => ({ workspace: "internal", provider: "F5" }), upstream as typeof fetch);
    await assertOpenApiResponse(readReport, response);
    expect(await response.json()).toEqual({ report: { status: "COMPLETED", total: 1, offset: 0, matched: 0, mismatches: 1, errors: 0, rows: [{ id: "sample", status: "FAIL", httpStatus: 200, labels: [{ expected: "unsafe", observed: "safe" }] }] } });
    const wrongProvider = await guardrailEvaluation(readReport, env, () => ({ workspace: "internal", provider: "NeMo" }), upstream as typeof fetch);
    expect(wrongProvider.status).toBe(404);
    await assertOpenApiResponse(readReport, wrongProvider);
    expect(upstream).toHaveBeenCalledTimes(3);
  });

  it("distinguishes a report still being prepared from an unreachable service", async () => {
    const upstream = vi.fn(async (url: string) => url.includes("/reports/") ? Response.json({}, { status: 404 }) : Response.json(run));
    const preparing = await demoGuardrailEvaluation(request("&run=eval-a&report=true"), env, upstream as typeof fetch);
    expect(await preparing.json()).toMatchObject({ error: { code: "evaluation_report_pending" } });
    const failure = await demoGuardrailEvaluation(request(), env, vi.fn().mockRejectedValue(new Error("sensitive upstream details")));
    expect(failure.status).toBe(503);
    expect(await failure.json()).toEqual({ error: { code: "evaluation_unreachable", message: "Cannot reach the evaluation service. Check its URL, network and trusted TLS settings." } });
  });

  it("accepts the independent backend's NeMo provider identifier for config and history", async () => {
    const provider = "nemo guardrail";
    const upstream = vi.fn(async (url: string) => Response.json(url.includes("guardrail-reports?")
      ? { items: [{ report_id: "eval-a", config_id: "test-suite", config_version: 1, created_at: "2026-11-24", status: "COMPLETED", guardrail_id: "fixture", provider }] }
      : { ...cfg, default_endpoint: { ...cfg.default_endpoint, provider } }));
    const response = await guardrailEvaluation(request(), env, () => ({ workspace: "internal", provider: "NeMo" }), upstream as typeof fetch);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ setup: { endpoint: "fixture" }, history: [{ id: "eval-a" }] });
  });
});
