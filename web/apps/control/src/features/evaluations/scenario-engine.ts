import type { EvaluationStore } from "./mock-store";
import type {
  CaseResult,
  CaseStatus,
  DatasetCase,
  EvaluationState,
  ReportRecord,
} from "./model";

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

export function evaluateCase(item: DatasetCase, index: number): CaseResult {
  const injectedRegression = index === 4;
  const status: CaseStatus = injectedRegression ? "FAIL" : "PASS";
  return {
    caseId: item.id,
    status,
    actualOutcome: injectedRegression ? "ALLOW" : item.expected.outcome,
    reason: injectedRegression
      ? "Permission bypass was not blocked."
      : item.expected.reason,
    durationMs: 420 + index * 37,
    inputTokens: 180 + index * 11,
    outputTokens: 42 + index * 3,
    costUsd: round(0.0024 + index * 0.0002, 4),
    toolEvidence: item.expected.tool
      ? [
          {
            tool: item.expected.tool,
            requested: true,
            allowed: item.expected.outcome === "ALLOW",
            called: injectedRegression || item.expected.outcome === "ALLOW",
          },
        ]
      : [],
    judge: {
      score: status === "PASS" ? 1 : 0.25,
      rationale:
        status === "PASS"
          ? "Expected behavior observed."
          : "Unsafe permission bypass.",
    },
  };
}

export function aggregateResults(results: CaseResult[]): ReportRecord["metrics"] {
  const passed = results.filter((item) => item.status === "PASS").length;
  const failed = results.filter((item) => item.status === "FAIL").length;
  const blocked = results.filter((item) => item.status === "BLOCKED").length;
  return {
    passRate: results.length ? round((passed / results.length) * 100, 1) : 0,
    passed,
    failed,
    blocked,
  };
}

export interface ReportComparison {
  sharedCaseIds: string[];
  regressions: string[];
  resolvedFailures: string[];
  unchangedFailures: string[];
  addedCases: string[];
  removedCases: string[];
}

function resultMapForReport(
  state: EvaluationState,
  reportId: string,
): Map<string, CaseResult> {
  const report = state.reports.find((item) => item.id === reportId);
  const run = report
    ? state.runs.find((item) => item.id === report.runId)
    : undefined;
  return new Map(run?.results.map((item) => [item.caseId, item]) ?? []);
}

export function compareReports(
  state: EvaluationState,
  baselineId: string,
  currentId: string,
): ReportComparison {
  const baseline = resultMapForReport(state, baselineId);
  const current = resultMapForReport(state, currentId);
  const sharedCaseIds = [...baseline.keys()].filter((id) => current.has(id));
  const failed = (result: CaseResult | undefined) =>
    result?.status === "FAIL" || result?.status === "BLOCKED";

  return {
    sharedCaseIds,
    regressions: sharedCaseIds.filter(
      (id) => !failed(baseline.get(id)) && failed(current.get(id)),
    ),
    resolvedFailures: sharedCaseIds.filter(
      (id) => failed(baseline.get(id)) && !failed(current.get(id)),
    ),
    unchangedFailures: sharedCaseIds.filter(
      (id) => failed(baseline.get(id)) && failed(current.get(id)),
    ),
    addedCases: [...current.keys()].filter((id) => !baseline.has(id)),
    removedCases: [...baseline.keys()].filter((id) => !current.has(id)),
  };
}

export function scheduleEvaluationRun(
  store: EvaluationStore,
  runId: string,
  intervalMs = 450,
): () => void {
  const timer = window.setInterval(() => {
    const run = store.getState().runs.find((item) => item.id === runId);
    if (!run || run.status !== "RUNNING") {
      window.clearInterval(timer);
      return;
    }
    const result = store.advanceRun(runId);
    if (!result.ok || result.value.status !== "RUNNING") {
      window.clearInterval(timer);
    }
  }, intervalMs);
  return () => window.clearInterval(timer);
}
