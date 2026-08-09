import type {
  EvaluationLayerDataset,
  EvaluationLayerDatasetRevision,
  EvaluationLayerReport,
  EvaluationLayerRun,
  EvaluationLayerState,
  EvaluationLayerTarget,
  EvaluationLayerTargetRevision,
} from '../model';
import { isLiveMonitoringRun } from '../mock-store';

export type WorkspaceStage =
  | 'NOT_EVALUATED'
  | 'BUILDING_DATASET'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'NEEDS_RE_EVALUATION';

export type WorkspacePrimaryAction =
  | 'RUN_EVALUATION'
  | 'VIEW_PROGRESS'
  | 'VIEW_RESULTS';

export type WorkspaceRiskKind =
  | 'NOT_EVALUATED'
  | 'PENDING'
  | 'NONE'
  | 'FINDINGS'
  | 'INCONCLUSIVE';

export interface WorkspaceRisk {
  kind: WorkspaceRiskKind;
  count: number;
  label: string;
}

export interface WorkspaceRow {
  target: EvaluationLayerTarget;
  currentRevision: EvaluationLayerTargetRevision | undefined;
  selectedDataset: EvaluationLayerDataset | undefined;
  draftRevision: EvaluationLayerDatasetRevision | undefined;
  publishedRevision: EvaluationLayerDatasetRevision | undefined;
  latestRun: EvaluationLayerRun | undefined;
  latestReport: EvaluationLayerReport | undefined;
  stage: WorkspaceStage;
  progress: number;
  result: string;
  risk: WorkspaceRisk;
  isStale: boolean;
  primaryAction: WorkspacePrimaryAction;
  updatedAt: string;
}

function newest<T>(items: T[], timestamp: (item: T) => string, id: (item: T) => string) {
  return [...items].sort((left, right) => {
    const byTime = timestamp(right).localeCompare(timestamp(left));
    return byTime || id(right).localeCompare(id(left));
  })[0];
}

function newestDatasetRevision(
  revisions: EvaluationLayerDatasetRevision[],
  status: EvaluationLayerDatasetRevision['status'],
) {
  return revisions
    .filter((revision) => revision.status === status)
    .sort(
      (left, right) =>
        right.revision - left.revision ||
        right.createdAt.localeCompare(left.createdAt) ||
        right.id.localeCompare(left.id),
    )[0];
}

function progressFor(run: EvaluationLayerRun | undefined) {
  if (!run?.results.length) return 0;
  const complete = run.results.filter((result) => result.status !== 'PENDING').length;
  return Math.round((complete / run.results.length) * 100);
}

function resultFor(run: EvaluationLayerRun | undefined) {
  if (!run) return 'Not evaluated';
  const passed = run.results.filter((result) => result.status === 'PASS').length;
  const failed = run.results.filter((result) => result.status === 'FAIL').length;
  const errors = run.results.filter((result) => result.status === 'ERROR').length;
  const complete = passed + failed + errors;

  if (run.status === 'QUEUED') return 'Queued';
  if (run.status === 'RUNNING') return `${complete} of ${run.results.length} cases`;
  if (run.status === 'FAILED') return 'Evaluation failed';

  const parts = [`${passed} passed`];
  if (failed) parts.push(`${failed} ${failed === 1 ? 'finding' : 'findings'}`);
  if (errors) parts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`);
  return parts.join(' · ');
}

function riskFor(run: EvaluationLayerRun | undefined): WorkspaceRisk {
  if (!run) return { kind: 'NOT_EVALUATED', count: 0, label: 'Not evaluated' };
  if (run.status === 'FAILED') return { kind: 'INCONCLUSIVE', count: 0, label: 'Inconclusive' };

  const findings = run.results.filter(
    (result) => result.status === 'FAIL' || result.status === 'ERROR',
  ).length;
  if (findings) {
    return {
      kind: 'FINDINGS',
      count: findings,
      label: `${findings} ${findings === 1 ? 'finding' : 'findings'}`,
    };
  }
  if (run.status === 'QUEUED' || run.status === 'RUNNING') {
    return { kind: 'PENDING', count: 0, label: 'No finding yet' };
  }
  return { kind: 'NONE', count: 0, label: 'No findings' };
}

function stageFor(
  run: EvaluationLayerRun | undefined,
  draftRevision: EvaluationLayerDatasetRevision | undefined,
  isStale: boolean,
): WorkspaceStage {
  if (!run) return draftRevision ? 'BUILDING_DATASET' : 'NOT_EVALUATED';
  if (run.status === 'QUEUED' || run.status === 'RUNNING') return 'RUNNING';
  if (run.status === 'FAILED') return 'FAILED';
  if (isStale) return 'NEEDS_RE_EVALUATION';
  return 'COMPLETED';
}

function primaryActionFor(stage: WorkspaceStage): WorkspacePrimaryAction {
  if (stage === 'RUNNING' || stage === 'BUILDING_DATASET') return 'VIEW_PROGRESS';
  if (stage === 'COMPLETED') return 'VIEW_RESULTS';
  return 'RUN_EVALUATION';
}

function latestTimestamp(values: Array<string | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0]!;
}

export function workspaceTargetView(
  state: EvaluationLayerState,
  targetId: string,
): WorkspaceRow | undefined {
  const target = state.targets.find((item) => item.id === targetId);
  if (!target) return undefined;

  const currentRevision = state.targetRevisions.find(
    (revision) => revision.id === target.currentRevisionId,
  );
  const targetRuns = state.runs.filter(
    (run) => run.targetId === target.id && !isLiveMonitoringRun(run.id),
  );
  const latestTargetRun = newest(targetRuns, (run) => run.startedAt, (run) => run.id);
  const targetDatasets = state.datasets.filter((dataset) => dataset.targetId === target.id);
  const activeDataset =
    state.settings.activeTargetId === target.id
      ? targetDatasets.find((dataset) => dataset.id === state.settings.activeDatasetId)
      : undefined;
  const runDataset = latestTargetRun
    ? targetDatasets.find((dataset) => dataset.id === latestTargetRun.datasetId)
    : undefined;
  const selectedDataset =
    activeDataset ??
    runDataset ??
    newest(targetDatasets, (dataset) => dataset.createdAt, (dataset) => dataset.id);
  const latestRun = selectedDataset
    ? newest(
        targetRuns.filter((run) => run.datasetId === selectedDataset.id),
        (run) => run.startedAt,
        (run) => run.id,
      )
    : undefined;
  const selectedRevisions = selectedDataset
    ? state.datasetRevisions.filter((revision) => revision.datasetId === selectedDataset.id)
    : [];
  const draftRevision = newestDatasetRevision(selectedRevisions, 'DRAFT');
  const publishedRevision = newestDatasetRevision(selectedRevisions, 'PUBLISHED');
  const latestReport = latestRun
    ? newest(
        state.reports.filter((report) => report.runId === latestRun.id),
        (report) => report.createdAt,
        (report) => report.id,
      )
    : undefined;
  const isStale = Boolean(
    latestRun &&
      (latestRun.targetRevisionId !== target.currentRevisionId ||
        latestRun.datasetRevisionId !== publishedRevision?.id),
  );
  const stage = stageFor(latestRun, draftRevision, isStale);

  return {
    target,
    currentRevision,
    selectedDataset,
    draftRevision,
    publishedRevision,
    latestRun,
    latestReport,
    stage,
    progress: progressFor(latestRun),
    result: resultFor(latestRun),
    risk: riskFor(latestRun),
    isStale,
    primaryAction: primaryActionFor(stage),
    updatedAt: latestTimestamp([
      target.createdAt,
      currentRevision?.createdAt,
      selectedDataset?.createdAt,
      draftRevision?.createdAt,
      publishedRevision?.createdAt,
      latestRun?.startedAt,
      latestRun?.completedAt,
      latestReport?.createdAt,
    ]),
  };
}

export function workspaceRows(state: EvaluationLayerState): WorkspaceRow[] {
  return state.targets.map((target) => workspaceTargetView(state, target.id)!);
}
