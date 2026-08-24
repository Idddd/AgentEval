import type {
  EvaluationState,
  EvaluationStatus,
  ReportRecord,
  TargetRecord,
  TargetRevision,
} from "../model";

export function targetListRows(state: EvaluationState): Array<{
  id: string;
  name: string;
  model: string;
  revision: number;
  tools: number;
  mcpServers: number;
  knowledgeBases: number;
  lastStatus: EvaluationStatus | "NOT_RUN";
  passRate?: number;
  updatedAt: string;
}> {
  return state.targets.map((target) => {
    const revision = state.targetRevisions.find(
      (item) => item.id === target.currentRevisionId,
    )!;
    const report = state.reports
      .filter((item) => item.targetId === target.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    return {
      id: target.id,
      name: target.name,
      model: revision.model.name,
      revision: revision.revision,
      tools: revision.tools.length,
      mcpServers: revision.mcpServers.length,
      knowledgeBases: revision.knowledgeBases.length,
      lastStatus: report?.status ?? "NOT_RUN",
      ...(report ? { passRate: report.metrics.passRate } : {}),
      updatedAt: target.updatedAt,
    };
  });
}

export function targetDetailView(
  state: EvaluationState,
  targetId: string,
): {
  target: TargetRecord;
  currentRevision: TargetRevision;
  revisions: TargetRevision[];
  reports: ReportRecord[];
  qualityTrend: Array<{ createdAt: string; passRate: number }>;
  costTrend: Array<{ createdAt: string; costUsd: number }>;
} | undefined {
  const target = state.targets.find((item) => item.id === targetId);
  if (!target) return undefined;
  const currentRevision = state.targetRevisions.find(
    (item) => item.id === target.currentRevisionId,
  );
  if (!currentRevision) return undefined;
  const revisions = state.targetRevisions
    .filter((item) => item.targetId === targetId)
    .sort((left, right) => right.revision - left.revision);
  const reports = state.reports
    .filter((item) => item.targetId === targetId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const chronological = [...reports].reverse();
  return {
    target,
    currentRevision,
    revisions,
    reports,
    qualityTrend: chronological.map((item) => ({
      createdAt: item.createdAt,
      passRate: item.metrics.passRate,
    })),
    costTrend: chronological.map((item) => ({
      createdAt: item.createdAt,
      costUsd: item.costs.evaluationTotal,
    })),
  };
}
