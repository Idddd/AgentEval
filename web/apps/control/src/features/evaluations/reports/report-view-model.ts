import type { EvaluationState } from "../model";
import { compareReports } from "../scenario-engine";

const unavailable = "Not available";

export function reportListRows(state: EvaluationState) {
  return [...state.reports]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((report) => {
      const target = state.targets.find((item) => item.id === report.targetId);
      const run = state.runs.find((item) => item.id === report.runId);
      const targetRevision = state.targetRevisions.find(
        (item) => item.id === run?.targetRevisionId,
      );
      const datasetRevision = state.datasetRevisions.find(
        (item) => item.id === run?.datasetRevisionId,
      );
      const dataset = state.datasets.find(
        (item) => item.id === datasetRevision?.datasetId,
      );
      return {
        id: report.id,
        targetName: target?.name ?? "Unknown Target",
        targetRevision: targetRevision?.revision ?? 0,
        datasetName: dataset?.name ?? "Unknown Dataset",
        datasetRevision: datasetRevision?.revision ?? 0,
        status: report.status,
        passRate: report.metrics.passRate,
        failed: report.metrics.failed,
        costUsd: report.costs.evaluationTotal,
        createdAt: report.createdAt,
      };
    });
}

export function reportDetailView(state: EvaluationState, reportId: string) {
  const report = state.reports.find((item) => item.id === reportId);
  if (!report) return undefined;
  const run = state.runs.find((item) => item.id === report.runId);
  if (!run) return undefined;
  const target = state.targets.find((item) => item.id === report.targetId);
  const targetRevision = state.targetRevisions.find(
    (item) => item.id === run.targetRevisionId,
  );
  const datasetRevision = state.datasetRevisions.find(
    (item) => item.id === run.datasetRevisionId,
  );
  const dataset = state.datasets.find(
    (item) => item.id === datasetRevision?.datasetId,
  );
  const cases = new Map(
    datasetRevision?.cases.map((item) => [item.id, item]) ?? [],
  );
  return {
    report,
    run,
    target,
    targetRevision,
    dataset,
    datasetRevision,
    status: report.status,
    caseRows: run.results.map((result) => {
      const item = cases.get(result.caseId);
      return {
        caseId: result.caseId,
        query: item?.input.query ?? unavailable,
        status: result.status,
        expectedOutcome: item?.expected.outcome ?? unavailable,
        actualOutcome: result.actualOutcome ?? unavailable,
        duration: result.durationMs === undefined ? unavailable : `${result.durationMs}ms`,
        tokens:
          result.inputTokens === undefined || result.outputTokens === undefined
            ? unavailable
            : `${result.inputTokens + result.outputTokens}`,
        cost:
          result.costUsd === undefined
            ? unavailable
            : `$${result.costUsd.toFixed(4)}`,
        reason: result.reason ?? unavailable,
        expectedTool: item?.expected.tool ?? unavailable,
        toolEvidence: result.toolEvidence ?? unavailable,
        judge: result.judge?.rationale ?? unavailable,
        judgeScore: result.judge?.score ?? unavailable,
      };
    }),
  };
}

export function reportComparisonView(
  state: EvaluationState,
  baselineId: string,
  currentId: string,
) {
  const comparison = compareReports(state, baselineId, currentId);
  const baseline = state.reports.find((item) => item.id === baselineId);
  const current = state.reports.find((item) => item.id === currentId);
  const baselineRun = state.runs.find((item) => item.id === baseline?.runId);
  const currentRun = state.runs.find((item) => item.id === current?.runId);
  const baselineRevision = state.targetRevisions.find(
    (item) => item.id === baselineRun?.targetRevisionId,
  );
  const currentRevision = state.targetRevisions.find(
    (item) => item.id === currentRun?.targetRevisionId,
  );
  return {
    ...comparison,
    baseline,
    current,
    passRateDelta:
      baseline && current
        ? Number((current.metrics.passRate - baseline.metrics.passRate).toFixed(1))
        : 0,
    costDelta:
      baseline && current
        ? Number(
            (
              current.costs.evaluationTotal - baseline.costs.evaluationTotal
            ).toFixed(4),
          )
        : 0,
    configurationChanged:
      baselineRun?.targetRevisionId !== currentRun?.targetRevisionId,
    baselineRevision,
    currentRevision,
  };
}

export function reflectionView(state: EvaluationState, reportId: string) {
  const reflection = state.reflections.find(
    (item) => item.reportId === reportId,
  );
  const report = state.reports.find((item) => item.id === reportId);
  const run = state.runs.find((item) => item.id === report?.runId);
  const sourceRevision = state.targetRevisions.find(
    (item) => item.id === run?.targetRevisionId,
  );
  if (!reflection || !report || !run || !sourceRevision) return undefined;
  return { reflection, report, run, sourceRevision };
}
