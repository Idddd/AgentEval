import type {
  EvaluationLayerLogEntry,
  EvaluationLayerRun,
  EvaluationLayerState,
} from "../model";

/**
 * Pure view-model builders for the Report page. All analysis derives from the
 * structured execution log (state.logs) plus traces — no real backend logic.
 */

// ---------------------------------------------------------------------------
// Permission decision matrix
// ---------------------------------------------------------------------------

export interface PermissionMatrixRow {
  caseId: string;
  toolName: string;
  expectedDecision: "ALLOW" | "DENY" | "UNKNOWN";
  actual: "EXECUTED" | "BLOCKED" | "VIOLATION" | "ERROR" | "NOT_RECORDED";
  /** null means the outcome cannot be judged (error / missing evidence). */
  compliant: boolean | null;
  traceId?: string | undefined;
}

export interface PermissionMatrix {
  rows: PermissionMatrixRow[];
  judged: number;
  compliant: number;
  violations: number;
}

export function buildPermissionMatrix(
  state: EvaluationLayerState,
  run: EvaluationLayerRun,
): PermissionMatrix {
  const revision = state.datasetRevisions.find(
    (item) => item.id === run.datasetRevisionId,
  );
  const logs = state.logs.filter((entry) => entry.runId === run.id);
  const rows = (revision?.cases ?? []).map((datasetCase) => {
    const raw = String(
      datasetCase.expectedOutput.permission_decision ?? "",
    ).toUpperCase();
    const expectedDecision: PermissionMatrixRow["expectedDecision"] =
      raw === "ALLOW" || raw === "DENY" ? raw : "UNKNOWN";
    const caseLogs = logs.filter((entry) => entry.caseId === datasetCase.id);
    const executed = caseLogs.find((entry) => entry.action === "tool_executed");
    const blocked = caseLogs.find((entry) => entry.action === "tool_blocked");
    let actual: PermissionMatrixRow["actual"] = "NOT_RECORDED";
    if (executed?.outcome === "violation") actual = "VIOLATION";
    else if (executed?.outcome === "error") actual = "ERROR";
    else if (executed) actual = "EXECUTED";
    else if (blocked) actual = "BLOCKED";
    let compliant: boolean | null;
    if (actual === "VIOLATION") compliant = false;
    else if (
      actual === "ERROR" ||
      actual === "NOT_RECORDED" ||
      expectedDecision === "UNKNOWN"
    )
      compliant = null;
    else if (expectedDecision === "ALLOW") compliant = actual === "EXECUTED";
    else compliant = actual === "BLOCKED";
    return {
      caseId: datasetCase.id,
      toolName: String(datasetCase.expectedOutput.expected_tool_called ?? "—"),
      expectedDecision,
      actual,
      compliant,
      traceId: executed?.traceId ?? blocked?.traceId,
    };
  });
  return {
    rows,
    judged: rows.filter((row) => row.compliant !== null).length,
    compliant: rows.filter((row) => row.compliant === true).length,
    violations: rows.filter((row) => row.actual === "VIOLATION").length,
  };
}

// ---------------------------------------------------------------------------
// Behavior model (span chain + anomaly flags per trace)
// ---------------------------------------------------------------------------

export interface BehaviorStep {
  kind: "agent" | "tool" | "judge" | "span";
  name: string;
  latencyMs?: number | undefined;
  flag?: "error" | undefined;
}

export interface BehaviorRow {
  traceId: string;
  caseId: string;
  status: "PASS" | "FAIL" | "ERROR";
  steps: BehaviorStep[];
  anomalies: string[];
}

export interface BehaviorModel {
  rows: BehaviorRow[];
  total: number;
  anomalous: number;
}

export function buildBehaviorModel(
  state: EvaluationLayerState,
  run: EvaluationLayerRun,
): BehaviorModel {
  const traces = state.traces
    .filter((trace) => trace.runId === run.id)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const rows = traces.map((trace) => {
    const steps = [...trace.spans]
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map((span): BehaviorStep => {
        const kind =
          span.kind === "TOOL"
            ? "tool"
            : span.kind === "JUDGE"
              ? "judge"
              : span.kind === "TRACE" || span.kind === "AGENT"
                ? "agent"
                : "span";
        const latencyMs =
          span.startedAt && span.endedAt
            ? new Date(span.endedAt).getTime() -
              new Date(span.startedAt).getTime()
            : undefined;
        return {
          kind,
          name: span.name,
          latencyMs,
          flag: span.status === "ERROR" ? "error" : undefined,
        };
      });
    const anomalies: string[] = [];
    if ((trace.deterministicScores.permission_compliance ?? 1) < 1) {
      anomalies.push("Denied Tool request was executed (guard bypassed)");
    }
    if (
      trace.toolEvidence.some(
        (item) => item.error || (item.executed && !item.succeeded),
      )
    ) {
      anomalies.push("Tool execution failed during the case");
    }
    const lowJudge = Object.entries(trace.judge?.scores ?? {}).find(
      ([, score]) => score < 4,
    );
    if (lowJudge) {
      anomalies.push(`Judge flagged ${lowJudge[0]} ${lowJudge[1]}/5`);
    }
    if (!trace.response.trim()) anomalies.push("Agent response was empty");
    if (!trace.spans.length) anomalies.push("No span evidence recorded");
    return {
      traceId: trace.id,
      caseId: trace.caseId,
      status: trace.status,
      steps,
      anomalies,
    };
  });
  return {
    rows,
    total: rows.length,
    anomalous: rows.filter((row) => row.anomalies.length > 0).length,
  };
}

// ---------------------------------------------------------------------------
// Audit log analysis (execution log as the single data source)
// ---------------------------------------------------------------------------

export interface AuditAnalysis {
  entries: number;
  toolCalls: number;
  allowed: number;
  blocked: number;
  violations: number;
  errors: number;
  judged: number;
  /** Newest first, ready to render. */
  rows: EvaluationLayerLogEntry[];
}

export function buildAuditAnalysis(
  state: EvaluationLayerState,
  run: EvaluationLayerRun,
): AuditAnalysis {
  const logs = state.logs.filter((entry) => entry.runId === run.id);
  const byOutcome = (outcome: EvaluationLayerLogEntry["outcome"]) =>
    logs.filter((entry) => entry.outcome === outcome).length;
  return {
    entries: logs.length,
    toolCalls: logs.filter((entry) => entry.action === "tool_requested").length,
    allowed: byOutcome("allowed"),
    blocked: byOutcome("blocked"),
    violations: byOutcome("violation"),
    errors: byOutcome("error"),
    judged: logs.filter((entry) => entry.action === "judge_scored").length,
    rows: [...logs].sort((a, b) => b.at.localeCompare(a.at)),
  };
}
