import { z } from "zod";
import { DeploymentError } from "./diagnostics";

const resultsSchema = z.array(z.object({
  caseId: z.string(), passed: z.boolean(),
  actualDecision: z.string().optional(), reason: z.string().optional(),
}).passthrough());

const valueType = (value: unknown) => value === undefined ? "missing" : value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

export function evaluationResults(run: { results?: unknown; status?: unknown }, phase: string) {
  const parsed = resultsSchema.safeParse(run.results);
  if (parsed.success) return parsed.data;

  // Report schema-owned paths and types only, never response values, scan text,
  // upstream failureReason, or a raw Zod error (which may contain those values).
  const issues = parsed.error.issues.slice(0, 8).map(issue => {
    let value: unknown = run.results;
    for (const part of issue.path) value = value != null && typeof value === "object" ? (value as Record<PropertyKey, unknown>)[part] : undefined;
    const path = "results" + issue.path.map(part => typeof part === "number" ? `[${part}]` : `.${String(part)}`).join("");
    return { path, expected: issue.code === "invalid_type" ? issue.expected : "schema-compatible value", received: valueType(value) };
  });
  const runStatus = typeof run.status === "string" && ["queued", "running", "passed", "failed", "error", "cancelled", "canceled", "completed", "pending"].includes(run.status)
    ? run.status : `unrecognized (${valueType(run.status)})`;
  const endpoint = phase === "policy-poll" ? "GET /policies/{policyId}/definition/test-runs/{runId}" : "GET /test-runs/{runId}";
  const summary = issues.map(i => `${i.path}: expected ${i.expected}, received ${i.received}`).join("; ");
  const failure = new DeploymentError("nemo", "nemo_response_schema_invalid",
    `NeMo evaluation response is incompatible at ${phase} (${endpoint}; run status: ${runStatus}). ${summary}${parsed.error.issues.length > issues.length ? `; ${parsed.error.issues.length - issues.length} more issue(s)` : ""}. No evaluation result was recorded. Reconcile the existing run before retrying.`, [], 502);
  failure.responseValidation = { phase, endpoint, runStatus, issueCount: parsed.error.issues.length, issues };
  throw failure;
}
