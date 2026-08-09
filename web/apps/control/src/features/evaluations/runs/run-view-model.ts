import type { EvaluationRun, EvaluationState, WorkflowStage } from "../model";

const stageOrder: WorkflowStage[] = [
  "setup",
  "evaluate",
  "report",
  "reflect",
  "complete",
];

export function workflowStages(run: Pick<EvaluationRun, "stage">) {
  const current = stageOrder.indexOf(run.stage);
  return stageOrder.map((id, index) => ({
    id,
    enabled: index <= current,
    complete: index < current,
  }));
}

export function runProgressView(run: EvaluationRun) {
  const total = run.results.length;
  const completed = run.results.filter(
    (item) => item.status !== "PENDING" && item.status !== "RUNNING",
  ).length;
  const passed = run.results.filter((item) => item.status === "PASS").length;
  const failed = run.results.filter((item) => item.status === "FAIL").length;
  const blocked = run.results.filter((item) => item.status === "BLOCKED").length;
  return {
    total,
    completed,
    passed,
    failed,
    blocked,
    percent: total ? Math.round((completed / total) * 100) : 0,
    currentCaseId: run.results.find((item) => item.status === "PENDING")?.caseId,
    recentResults: run.results
      .filter((item) => item.status !== "PENDING")
      .slice(-5)
      .reverse(),
  };
}

export function evaluationListRows(state: EvaluationState) {
  return [...state.runs]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((run) => {
      const target = state.targets.find((item) => item.id === run.targetId);
      const targetRevision = state.targetRevisions.find(
        (item) => item.id === run.targetRevisionId,
      );
      const datasetRevision = state.datasetRevisions.find(
        (item) => item.id === run.datasetRevisionId,
      );
      const dataset = state.datasets.find(
        (item) => item.id === datasetRevision?.datasetId,
      );
      const report = state.reports.find((item) => item.runId === run.id);
      const durations = run.results.reduce(
        (total, item) => total + (item.durationMs ?? 0),
        0,
      );
      return {
        id: run.id,
        targetName: target?.name ?? "Unknown Target",
        targetRevision: targetRevision?.revision ?? 0,
        datasetName: dataset?.name ?? "Unknown Dataset",
        datasetRevision: datasetRevision?.revision ?? 0,
        status: run.status,
        stage: run.stage,
        passRate: report?.metrics.passRate,
        durationMs: durations,
        costUsd: report?.costs.evaluationTotal,
        createdAt: run.createdAt,
      };
    });
}

export function evaluationSetupOptions(state: EvaluationState) {
  return state.datasets.flatMap((dataset) => {
    const datasetRevision = state.datasetRevisions.find(
      (item) => item.id === dataset.currentRevisionId,
    );
    const target = state.targets.find((item) => item.id === dataset.targetId);
    if (!datasetRevision || !target) return [];
    const revisions = state.targetRevisions
      .filter((item) => item.targetId === target.id)
      .sort((left, right) => right.revision - left.revision);
    return [
      {
        dataset,
        datasetRevision,
        target,
        targetRevisions: revisions,
      },
    ];
  });
}
