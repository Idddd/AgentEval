import { describe, expect, it } from 'vitest';
import { cloneEvaluationLayerFixtures } from '../fixture-validation';
import type { EvaluationLayerDataset, EvaluationLayerDatasetRevision } from '../model';
import { createEvaluationLayerStore } from '../mock-store';
import {
  workspaceNextStep,
  workspaceRows,
  workspaceTargetView,
} from './workspace-view-model';

const OFFICE_TARGET_ID = 'demo-permission-compliance';
const ADMIN_ACTOR = { name: 'Local Administrator', role: 'admin' };

describe('evaluation catalog workspace view model', () => {
  it('joins every Target to its selected Dataset and latest Evaluation graph', () => {
    const state = cloneEvaluationLayerFixtures();
    const rows = workspaceRows(state);
    const office = rows.find((row) => row.target.id === OFFICE_TARGET_ID)!;

    expect(rows.map((row) => row.target.id)).toEqual(
      state.targets.map((target) => target.id),
    );
    expect(office).toMatchObject({
      currentRevision: { id: 'demo-permission-compliance-r2' },
      selectedDataset: { id: 'permission-compliance-regression' },
      draftRevision: { id: 'permission-compliance-regression-r2' },
      publishedRevision: { id: 'permission-compliance-regression-r1' },
      latestRun: { id: 'run-permission-baseline' },
      latestReport: { id: 'report-permission-baseline' },
      decisionStatus: 'PENDING',
      decisionRecommendation: 'REJECTED',
      stage: 'COMPLETED',
      progress: 100,
      result: '6 passed · 2 findings',
      risk: { kind: 'FINDINGS', count: 2, label: '2 findings' },
      isStale: false,
      primaryAction: 'VIEW_RESULTS',
      updatedAt: '2026-07-31T10:00:00.000Z',
    });
  });

  it('treats PARTIAL as a completed Evaluation with findings', () => {
    const state = cloneEvaluationLayerFixtures();
    const run = state.runs.find((item) => item.id === 'run-permission-baseline')!;
    run.status = 'PARTIAL';

    expect(workspaceTargetView(state, OFFICE_TARGET_ID)).toMatchObject({
      stage: 'COMPLETED',
      progress: 100,
      risk: { kind: 'FINDINGS', count: 2 },
      primaryAction: 'VIEW_RESULTS',
    });
  });

  it('uses the failed stage only for an explicitly FAILED run', () => {
    const state = cloneEvaluationLayerFixtures();
    const failed = workspaceTargetView(
      state,
      'demo-permission-compliance-baseline',
    )!;
    expect(failed).toMatchObject({
      stage: 'FAILED',
      result: 'Evaluation failed',
      risk: { kind: 'INCONCLUSIVE', label: 'Inconclusive' },
      decisionStatus: 'PENDING',
      decisionRecommendation: 'REJECTED',
      primaryAction: 'RUN_EVALUATION',
    });

    failed.latestRun!.status = 'PARTIAL';
    expect(
      workspaceTargetView(state, 'demo-permission-compliance-baseline'),
    ).toMatchObject({ stage: 'COMPLETED' });
  });

  it('does not make a completed Evaluation stale because its Dataset has draft changes', () => {
    const state = cloneEvaluationLayerFixtures();
    const row = workspaceTargetView(state, OFFICE_TARGET_ID)!;

    expect(row.draftRevision!.revision).toBeGreaterThan(
      row.publishedRevision!.revision,
    );
    expect(row.isStale).toBe(false);
    expect(row.stage).toBe('COMPLETED');
  });

  it('becomes stale when either immutable run pin is behind the current published graph', () => {
    const targetState = cloneEvaluationLayerFixtures();
    const target = targetState.targets.find((item) => item.id === OFFICE_TARGET_ID)!;
    const current = targetState.targetRevisions.find(
      (item) => item.id === target.currentRevisionId,
    )!;
    targetState.targetRevisions.push({
      ...current,
      id: 'demo-permission-compliance-r3',
      revision: 3,
      createdAt: '2026-08-01T09:00:00.000Z',
    });
    target.currentRevisionId = 'demo-permission-compliance-r3';
    expect(workspaceTargetView(targetState, target.id)).toMatchObject({
      isStale: true,
      stage: 'NEEDS_RE_EVALUATION',
      primaryAction: 'RUN_EVALUATION',
    });

    const datasetState = cloneEvaluationLayerFixtures();
    const published = datasetState.datasetRevisions.find(
      (item) => item.id === 'permission-compliance-regression-r1',
    )!;
    datasetState.datasetRevisions.push({
      ...published,
      id: 'permission-compliance-regression-r3',
      revision: 3,
      createdAt: '2026-08-01T10:00:00.000Z',
    });
    expect(workspaceTargetView(datasetState, OFFICE_TARGET_ID)).toMatchObject({
      publishedRevision: { id: 'permission-compliance-regression-r3' },
      isStale: true,
      stage: 'NEEDS_RE_EVALUATION',
    });
  });

  it('excludes live-monitoring runs from Evaluation history', () => {
    const state = cloneEvaluationLayerFixtures();
    const baseline = state.runs.find((item) => item.id === 'run-permission-baseline')!;
    const { completedAt: _completedAt, ...liveTemplate } = baseline;
    state.runs.push({
      ...liveTemplate,
      id: `live-monitoring-${OFFICE_TARGET_ID}`,
      status: 'RUNNING',
      startedAt: '2099-01-01T00:00:00.000Z',
    });

    expect(workspaceTargetView(state, OFFICE_TARGET_ID)).toMatchObject({
      latestRun: { id: 'run-permission-baseline' },
      stage: 'COMPLETED',
    });
  });

  it('keeps Catalog ordering stable when live activity updates', () => {
    const state = cloneEvaluationLayerFixtures();
    const before = workspaceTargetView(state, OFFICE_TARGET_ID)!.updatedAt;
    const target = state.targets.find((item) => item.id === OFFICE_TARGET_ID)!;

    target.lastActivityAt = '2099-01-01T00:00:00.000Z';

    expect(workspaceTargetView(state, OFFICE_TARGET_ID)!.updatedAt).toBe(before);
  });

  it('covers the complete Catalog lifecycle matrix with demo fixtures', () => {
    const rows = workspaceRows(cloneEvaluationLayerFixtures());
    const stages = Object.fromEntries(rows.map((row) => [row.target.id, row.stage]));

    expect(stages).toMatchObject({
      'demo-onboarding-assistant': 'NOT_EVALUATED',
      'demo-invoice-classification': 'NOT_EVALUATED',
      'demo-deployment-monitor': 'RUNNING',
      'demo-operations-mcp': 'COMPLETED',
      'demo-document-summarization': 'COMPLETED',
      'demo-permission-compliance-baseline': 'FAILED',
      'demo-policy-kb': 'NEEDS_RE_EVALUATION',
    });
    expect(workspaceTargetView(cloneEvaluationLayerFixtures(), OFFICE_TARGET_ID)).toMatchObject({
      stage: 'COMPLETED',
      risk: { kind: 'FINDINGS', count: 2 },
    });
  });

  it('uses one not-evaluated stage for missing and draft Test Cases', () => {
    const rows = workspaceRows(cloneEvaluationLayerFixtures());

    expect({
      withoutDataset: rows.find(
        (row) => row.target.id === 'demo-onboarding-assistant',
      )?.stage,
      withDraft: rows.find(
        (row) => row.target.id === 'demo-invoice-classification',
      )?.stage,
    }).toEqual({
      withoutDataset: 'NOT_EVALUATED',
      withDraft: 'NOT_EVALUATED',
    });
  });

  it('routes every lifecycle state to the next actionable workflow tab', () => {
    const rows = workspaceRows(cloneEvaluationLayerFixtures());
    const nextTabs = Object.fromEntries(
      rows.map((row) => [row.target.id, workspaceNextStep(row).tab]),
    );

    expect(nextTabs).toMatchObject({
      'demo-onboarding-assistant': 'dataset',
      'demo-invoice-classification': 'dataset',
      'demo-deployment-monitor': 'run',
      'demo-operations-mcp': 'result',
      'demo-permission-compliance-baseline': 'result',
      'demo-policy-kb': 'run',
    });
  });

  it('routes a completed Guardrail evaluation through revision approval', () => {
    let sequence = 0;
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => `approval-flow-${sequence++}`,
      now: () => '2026-08-10T10:00:00.000Z',
      random: () => 0.5,
    });
    const revision = store.getState().targetRevisions.find(
      (item) => item.targetId === 'demo-pii-guardrail',
    )!;
    const dataset = store.getState().datasetRevisions.find(
      (item) => item.targetId === 'demo-pii-guardrail',
    )!;
    const created = store.createRun({
      targetRevisionId: revision.id,
      datasetRevisionId: dataset.id,
      guardrailTemplateIds: ['guardrail-template-universal-safety'],
      evaluatorIds: ['permission-compliance'],
    });
    if (!created.ok) throw new Error(created.error);
    let complete = false;
    while (!complete) {
      const result = store.advanceRun(created.value.runId);
      if (!result.ok) throw new Error(result.error);
      complete = result.value.complete;
    }

    const pending = workspaceTargetView(store.getState(), 'demo-pii-guardrail')!;
    expect(pending.decisionStatus).toBe('PENDING');
    expect(pending.decisionRecommendation).toBe('APPROVED');
    expect(workspaceNextStep(pending)).toMatchObject({
      tab: 'result',
      label: 'Approve evaluation',
    });

    const report = store.getState().reports.find(
      (item) => item.runId === created.value.runId,
    )!;
    store.decideRevision(report.id, 'APPROVED', ADMIN_ACTOR);
    expect(
      workspaceTargetView(store.getState(), 'demo-pii-guardrail')?.decisionStatus,
    ).toBe('APPROVED');
  });

  it('routes approved and rejected evaluations to their final workflow states', () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
    const passedReport = store.getState().reports.find(
      (item) => item.id === 'report-skill-summary-baseline',
    )!;
    const failedReport = store.getState().reports.find(
      (item) => item.id === 'report-permission-baseline',
    )!;

    expect(store.decideRevision(passedReport.id, 'APPROVED', ADMIN_ACTOR).ok).toBe(true);
    expect(store.decideRevision(failedReport.id, 'REJECTED', ADMIN_ACTOR).ok).toBe(true);

    const approved = workspaceTargetView(store.getState(), 'demo-document-summarization')!;
    const rejected = workspaceTargetView(store.getState(), OFFICE_TARGET_ID)!;
    expect(approved.decisionStatus).toBe('APPROVED');
    expect(workspaceNextStep(approved)).toMatchObject({
      tab: 'result',
      label: 'Evaluation approved',
    });
    expect(rejected.decisionStatus).toBe('REJECTED');
    expect(workspaceNextStep(rejected)).toMatchObject({
      tab: 'agent',
      label: 'Update rejected target',
    });
  });

  it('moves a rejected FAILED evaluation to re-evaluation after Developer changes', () => {
    let sequence = 0;
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => `failed-revision-flow-${sequence++}`,
    });
    expect(store.decideRevision('report-tool-error', 'REJECTED', ADMIN_ACTOR).ok).toBe(true);
    expect(store.createTargetRevision('demo-permission-compliance-baseline', {}, {
      name: 'Developer',
      role: 'member',
    }).ok).toBe(true);

    const row = workspaceTargetView(
      store.getState(),
      'demo-permission-compliance-baseline',
    )!;
    expect(row.stage).toBe('NEEDS_RE_EVALUATION');
    expect(workspaceNextStep(row)).toMatchObject({
      tab: 'run',
      label: 'Run evaluation again',
    });
  });

  it('reselects latest Run and revisions inside the active Dataset', () => {
    const state = cloneEvaluationLayerFixtures();
    const dataset: EvaluationLayerDataset = {
      id: 'permission-compliance-canary',
      targetId: OFFICE_TARGET_ID,
      name: 'Permission canary',
      description: 'Canary Dataset',
      currentRevisionId: 'permission-compliance-canary-r1',
      createdAt: '2026-08-02T10:00:00.000Z',
    };
    const published: EvaluationLayerDatasetRevision = {
      id: 'permission-compliance-canary-r1',
      datasetId: dataset.id,
      targetId: OFFICE_TARGET_ID,
      revision: 1,
      status: 'PUBLISHED',
      cases: [],
      createdAt: dataset.createdAt,
    };
    const draft: EvaluationLayerDatasetRevision = {
      ...published,
      id: 'permission-compliance-canary-r2',
      revision: 2,
      status: 'DRAFT',
      createdAt: '2026-08-03T10:00:00.000Z',
    };
    state.datasets.push(dataset);
    state.datasetRevisions.push(published, draft);
    state.settings.activeTargetId = OFFICE_TARGET_ID;
    state.settings.activeDatasetId = dataset.id;

    expect(workspaceTargetView(state, OFFICE_TARGET_ID)).toMatchObject({
      selectedDataset: { id: dataset.id },
      draftRevision: { id: draft.id },
      publishedRevision: { id: published.id },
      latestRun: undefined,
      latestReport: undefined,
      stage: 'NOT_EVALUATED',
      isStale: false,
      primaryAction: 'RUN_EVALUATION',
    });
  });
});
