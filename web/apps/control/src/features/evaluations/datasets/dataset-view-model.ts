import type {
  DatasetRecord,
  DatasetRevision,
  EvaluationRun,
  EvaluationState,
  TargetRecord,
} from "../model";

function sameCases(left: DatasetRecord["draftCases"], right: DatasetRecord["draftCases"]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function datasetListRows(state: EvaluationState) {
  return state.datasets.map((dataset) => {
    const target = state.targets.find((item) => item.id === dataset.targetId);
    const revision = state.datasetRevisions.find(
      (item) => item.id === dataset.currentRevisionId,
    );
    return {
      id: dataset.id,
      name: dataset.name,
      targetId: dataset.targetId,
      targetName: target?.name ?? "Unknown Target",
      revision: revision?.revision,
      cases: dataset.draftCases.length,
      status: revision ? "PUBLISHED" as const : "DRAFT" as const,
      hasUnpublishedChanges: !revision || !sameCases(dataset.draftCases, revision.cases),
      updatedAt: dataset.updatedAt,
    };
  });
}

export function datasetDetailView(
  state: EvaluationState,
  datasetId: string,
): {
  dataset: DatasetRecord;
  target: TargetRecord;
  currentRevision?: DatasetRevision;
  revisions: DatasetRevision[];
  publishedCaseCount: number;
  draftCaseCount: number;
  hasUnpublishedChanges: boolean;
  caseRows: Array<{
    id: string;
    query: string;
    headers: Record<string, string>;
    expectedOutcome: "ALLOW" | "DENY";
    expectedTool?: string;
    reason: string;
    source: string;
  }>;
  evaluations: EvaluationRun[];
} | undefined {
  const dataset = state.datasets.find((item) => item.id === datasetId);
  if (!dataset) return undefined;
  const target = state.targets.find((item) => item.id === dataset.targetId);
  if (!target) return undefined;
  const currentRevision = state.datasetRevisions.find(
    (item) => item.id === dataset.currentRevisionId,
  );
  const revisions = state.datasetRevisions
    .filter((item) => item.datasetId === datasetId)
    .sort((left, right) => right.revision - left.revision);
  const revisionIds = new Set(revisions.map((item) => item.id));
  return {
    dataset,
    target,
    ...(currentRevision ? { currentRevision } : {}),
    revisions,
    publishedCaseCount: currentRevision?.cases.length ?? 0,
    draftCaseCount: dataset.draftCases.length,
    hasUnpublishedChanges:
      !currentRevision || !sameCases(dataset.draftCases, currentRevision.cases),
    caseRows: dataset.draftCases.map((item) => ({
      id: item.id,
      query: item.input.query,
      headers: item.input.headers ?? {},
      expectedOutcome: item.expected.outcome,
      ...(item.expected.tool ? { expectedTool: item.expected.tool } : {}),
      reason: item.expected.reason,
      source: item.source,
    })),
    evaluations: state.runs
      .filter((item) => revisionIds.has(item.datasetRevisionId))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };
}
