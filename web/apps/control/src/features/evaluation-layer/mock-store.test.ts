import { describe, expect, it, vi } from "vitest";
import {
  cloneEvaluationLayerFixtures,
  validateEvaluationLayerState,
} from "./fixture-validation";
import { createEvaluationLayerStore, isLiveMonitoringRun } from "./mock-store";

const ADMIN_ACTOR = { name: "Local Administrator", role: "admin" };
const DEVELOPER_ACTOR = { name: "Developer", role: "member" };

describe("EvaluationLayerStore", () => {
  it('ships reusable Guardrail Test Pack presets and a runnable sample', () => {
    const state = cloneEvaluationLayerFixtures();
    const kinds = ['agent', 'mcp', 'kb', 'skill', 'guardrail'] as const;

    expect(state.guardrailTemplates.find(
      (item) => item.name === 'Universal Safety Baseline',
    )?.applicableTargetKinds).toEqual(expect.arrayContaining([...kinds]));
    for (const kind of kinds) {
      expect(state.guardrailTemplates.some(
        (item) => item.defaultFor.includes(kind) && item.applicableTargetKinds.includes(kind),
      )).toBe(true);
    }
    const sample = state.targets.find(
      (item) => item.name === 'Sample Security Assistant',
    );
    expect(sample).toEqual(expect.objectContaining({ kind: 'agent' }));
    expect(state.datasets.find(
      (item) => item.name === 'Sample Security Scenarios',
    )).toEqual(expect.objectContaining({ targetId: sample?.id }));
    expect(state.runs.some((item) => item.targetId === sample?.id)).toBe(false);
  });

  it('requires a compatible Guardrail Test Pack for every new Run', () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
    const input = {
      targetRevisionId: 'demo-sample-security-assistant-r1',
      datasetRevisionId: 'sample-security-scenarios-r1',
      evaluatorIds: ['permission-compliance'],
    };

    expect(store.createRun({ ...input, guardrailTemplateIds: [] })).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(store.createRun({
      ...input,
      guardrailTemplateIds: ['missing-template'],
    })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(store.createRun({
      ...input,
      guardrailTemplateIds: ['guardrail-template-mcp-tool-authorization'],
    })).toMatchObject({ ok: false, code: 'CONFLICT' });
  });

  it('merges business and selected Guardrail Test Pack cases into a Run', () => {
    let sequence = 0;
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => `sample-pack-run-${sequence++}`,
      now: () => '2026-08-11T10:00:00.000Z',
    });
    const created = store.createRun({
      targetRevisionId: 'demo-sample-security-assistant-r1',
      datasetRevisionId: 'sample-security-scenarios-r1',
      guardrailTemplateIds: [
        'guardrail-template-universal-safety',
        'guardrail-template-agent-prompt-injection',
      ],
      evaluatorIds: ['permission-compliance'],
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    let run = store.getState().runs.find((item) => item.id === created.value.runId)!;
    expect(run.results).toHaveLength(4);
    expect(run.results.filter((item) => item.guardrailTemplateId)).toHaveLength(2);

    while (run.results.some((item) => item.status === 'PENDING')) {
      expect(store.advanceRun(run.id).ok).toBe(true);
      run = store.getState().runs.find((item) => item.id === created.value.runId)!;
    }
    expect(run.status).toBe('COMPLETED');
    expect(run.results.every((item) => item.status === 'PASS')).toBe(true);
    expect(validateEvaluationLayerState(store.getState())).toEqual([]);
  });

  it("publishes a Dataset revision without mutating the draft source", () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => "dataset-revision-new",
      now: () => "2026-08-04T10:00:00.000Z",
    });
    const dataset = store.getState().datasets[0]!;
    const draft = store
      .getState()
      .datasetRevisions.find(
        (revision) =>
          revision.datasetId === dataset.id && revision.status === "DRAFT",
      )!;
    const before = structuredClone(draft);

    const result = store.publishDatasetRevision(dataset.id);

    expect(result).toEqual({
      ok: true,
      value: { revisionId: "dataset-revision-new" },
    });
    expect(draft).toEqual(before);
    expect(store.getState().datasets[0]?.currentRevisionId).toBe(
      "dataset-revision-new",
    );
  });

  it("resets one demo store without touching another", () => {
    const first = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
    const second = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
    first.markTraceFailed(first.getState().traces[0]!.id, true);

    first.resetDemo();

    expect(first.getState()).toEqual(cloneEvaluationLayerFixtures());
    expect(second.getState()).toEqual(cloneEvaluationLayerFixtures());
  });

  it('shares the selected Target across Evaluation pages', () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
    const targetId = store.getState().targets[1]!.id;

    expect(store.selectActiveTarget(targetId)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(store.getState().settings.activeTargetId).toBe(targetId);
  });

  it('defaults a created target to the agent kind and stores agent scope', () => {
    let sequence = 0;
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => `agent-target-${sequence++}`,
      now: () => '2026-08-05T10:00:00.000Z',
    });
    const tool = store.getState().targetRevisions[1]!.tools[0]!;

    const result = store.createTarget({
      name: 'Agent-compatible target',
      description: 'Model, prompt and tools',
      model: 'gpt-5-mini',
      prompt: 'Follow the permission policy.',
      tools: [tool],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const target = store.getState().targets.find(
      (item) => item.id === result.value.targetId,
    )!;
    expect(target.kind).toBe('agent');
    const revision = store.getState().targetRevisions.at(-1)!;
    expect(revision.kind).toBe('agent');
    expect(revision.prompt).toBe('Follow the permission policy.');
    expect(revision.tools).toHaveLength(1);
  });

  it('generates mcp scenario traces with tool evidence', () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
    expect(store.decideRevision(
      'report-operations-mcp-baseline',
      'APPROVED',
      ADMIN_ACTOR,
    ).ok).toBe(true);
    const revision = store.getState().targetRevisions.find(
      (item) => item.targetId === 'demo-operations-mcp',
    )!;
    const datasetRevision = store.getState().datasetRevisions.find(
      (item) => item.targetId === 'demo-operations-mcp',
    )!;
    const created = store.createRun({
      targetRevisionId: revision.id,
      datasetRevisionId: datasetRevision.id,
      guardrailTemplateIds: ['guardrail-template-universal-safety'],
      evaluatorIds: ['permission-compliance'],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const runId = created.value.runId;
    let guard = 0;
    let complete = false;
    while (!complete && guard < 20) {
      const result = store.advanceRun(runId);
      expect(result.ok).toBe(true);
      complete = result.ok ? result.value.complete : true;
      guard += 1;
    }
    const trace = store.getState().traces.find((item) => item.runId === runId)!;
    expect(trace.toolEvidence.length).toBeGreaterThan(0);
    expect(trace.deterministicScores.tool_requested).toBe(1);
  });

  it('generates kb scenario traces with grounded response', () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
    const revision = store.getState().targetRevisions.find(
      (item) => item.targetId === 'demo-policy-kb',
    )!;
    const datasetRevision = store.getState().datasetRevisions.find(
      (item) => item.targetId === 'demo-policy-kb',
    )!;
    const created = store.createRun({
      targetRevisionId: revision.id,
      datasetRevisionId: datasetRevision.id,
      guardrailTemplateIds: ['guardrail-template-universal-safety'],
      evaluatorIds: ['permission-compliance'],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const runId = created.value.runId;
    let guard = 0;
    let complete = false;
    while (!complete && guard < 20) {
      const result = store.advanceRun(runId);
      expect(result.ok).toBe(true);
      complete = result.ok ? result.value.complete : true;
      guard += 1;
    }
    const trace = store.getState().traces.find((item) => item.runId === runId)!;
    expect(trace.response).toContain('retrieved');
  });

  it('generates skill scenario traces with instruction compliance scores', () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
    expect(store.decideRevision(
      'report-skill-summary-baseline',
      'APPROVED',
      ADMIN_ACTOR,
    ).ok).toBe(true);
    const revision = store.getState().targetRevisions.find(
      (item) => item.targetId === 'demo-document-summarization',
    )!;
    const datasetRevision = store.getState().datasetRevisions.find(
      (item) => item.targetId === 'demo-document-summarization',
    )!;
    const created = store.createRun({
      targetRevisionId: revision.id,
      datasetRevisionId: datasetRevision.id,
      guardrailTemplateIds: ['guardrail-template-universal-safety'],
      evaluatorIds: ['permission-compliance'],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const runId = created.value.runId;
    let guard = 0;
    let complete = false;
    while (!complete && guard < 20) {
      const result = store.advanceRun(runId);
      expect(result.ok).toBe(true);
      complete = result.ok ? result.value.complete : true;
      guard += 1;
    }
    const trace = store.getState().traces.find((item) => item.runId === runId)!;
    expect(trace.deterministicScores.instruction_compliance).toBe(1);
  });

  it('evaluates and approves the current Guardrail revision', () => {
    let sequence = 0;
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => `guardrail-${sequence++}`,
      now: () => '2026-08-10T09:30:00.000Z',
      random: () => 0.5,
    });
    const revision = store.getState().targetRevisions.find(
      (item) => item.targetId === 'demo-pii-guardrail',
    )!;
    const datasetRevision = store.getState().datasetRevisions.find(
      (item) => item.targetId === 'demo-pii-guardrail' && item.status === 'PUBLISHED',
    )!;

    const created = store.createRun({
      targetRevisionId: revision.id,
      datasetRevisionId: datasetRevision.id,
      guardrailTemplateIds: ['guardrail-template-universal-safety'],
      evaluatorIds: ['permission-compliance'],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    let complete = false;
    while (!complete) {
      const advanced = store.advanceRun(created.value.runId);
      expect(advanced.ok).toBe(true);
      if (!advanced.ok) return;
      complete = advanced.value.complete;
    }

    const state = store.getState();
    const run = state.runs.find((item) => item.id === created.value.runId)!;
    const report = state.reports.find((item) => item.runId === run.id)!;
    const traces = state.traces.filter((item) => item.runId === run.id);
    expect(
      run.results
        .filter((item) => !item.guardrailTemplateId)
        .map((item) => item.status),
    ).toEqual([
      'PASS',
      'PASS',
      'PASS',
      'PASS',
    ]);
    expect(
      traces
        .filter((item) => datasetRevision.cases.some((testCase) => testCase.id === item.caseId))
        .map((item) => item.deterministicReasons.actual_decision),
    ).toEqual([
      'ALLOW',
      'BLOCK',
      'REDACT',
      'BLOCK',
    ]);
    expect(run.results.filter((item) => item.guardrailTemplateId)).toEqual([
      expect.objectContaining({
        guardrailTemplateId: 'guardrail-template-universal-safety',
        status: 'PASS',
      }),
    ]);
    expect(report.summary).toBe('All Guardrail decisions matched the expected policy.');

    expect(store.decideRevision(report.id, 'APPROVED', ADMIN_ACTOR)).toEqual({
      ok: true,
      value: { decisionId: expect.any(String) },
    });
    expect(store.getState().revisionDecisions).toEqual([
      expect.objectContaining({
        reportId: report.id,
        targetRevisionId: revision.id,
        status: 'APPROVED',
        actor: 'Local Administrator',
        decidedAt: '2026-08-10T09:30:00.000Z',
      }),
    ]);
  });

  it("allows an empty Dataset snapshot only when the guided workflow opts in", () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: (() => {
        let sequence = 0;
        return () => `empty-dataset-${sequence++}`;
      })(),
    });
    const created = store.createDataset({
      targetId: 'demo-onboarding-assistant',
      name: 'Onboarding Assistant Dataset',
      description: 'Guided workflow Dataset',
    });
    if (!created.ok) throw new Error(created.error);

    expect(store.publishDatasetRevision(created.value.datasetId)).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    const published = store.publishDatasetRevision(created.value.datasetId, {
      allowEmpty: true,
    });
    expect(published.ok).toBe(true);
    expect(
      store.getState().datasetRevisions.find(
        (revision) => revision.id === (published.ok ? published.value.revisionId : ''),
      )?.cases,
    ).toEqual([]);
  });

  it('approves an all-pass Report for a non-Guardrail Target', () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => 'mcp-pass-decision',
      now: () => '2026-08-10T11:00:00.000Z',
    });

    expect(store.decideRevision('report-operations-mcp-baseline', 'APPROVED', ADMIN_ACTOR)).toEqual({
      ok: true,
      value: { decisionId: 'mcp-pass-decision' },
    });
    expect(store.getState().revisionDecisions).toEqual([
      expect.objectContaining({
        id: 'mcp-pass-decision',
        reportId: 'report-operations-mcp-baseline',
        targetRevisionId: 'demo-operations-mcp-r1',
        status: 'APPROVED',
        actor: 'Local Administrator',
        decidedAt: '2026-08-10T11:00:00.000Z',
      }),
    ]);
  });

  it.each([
    ['a Report with findings', 'report-permission-baseline'],
    ['a failed Report', 'report-tool-error'],
  ])('rejects %s', (_label, reportId) => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => `${reportId}-decision`,
      now: () => '2026-08-10T11:15:00.000Z',
    });

    expect(store.decideRevision(reportId, 'REJECTED', ADMIN_ACTOR)).toEqual({
      ok: true,
      value: { decisionId: `${reportId}-decision` },
    });
    expect(store.getState().revisionDecisions).toEqual([
      expect.objectContaining({
        reportId,
        status: 'REJECTED',
        reason: 'Developer changes required.',
      }),
    ]);
  });

  it.each([
    ['report-operations-mcp-baseline', 'REJECTED' as const],
    ['report-permission-baseline', 'APPROVED' as const],
    ['report-tool-error', 'APPROVED' as const],
  ])('rejects the wrong decision direction for %s', (reportId, status) => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());

    expect(store.decideRevision(reportId, status, ADMIN_ACTOR)).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(store.getState().revisionDecisions).toEqual([]);
  });

  it('rejects a second decision for the same Report', () => {
    let sequence = 0;
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => `duplicate-decision-${sequence++}`,
    });

    expect(store.decideRevision('report-operations-mcp-baseline', 'APPROVED', ADMIN_ACTOR).ok).toBe(true);
    expect(store.decideRevision('report-operations-mcp-baseline', 'APPROVED', ADMIN_ACTOR)).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    expect(store.getState().revisionDecisions).toHaveLength(1);
  });

  it('rejects a decision when the evaluated Target revision is no longer current', () => {
    const state = cloneEvaluationLayerFixtures();
    const target = state.targets.find((item) => item.id === 'demo-operations-mcp')!;
    const current = state.targetRevisions.find((item) => item.id === target.currentRevisionId)!;
    state.targetRevisions.push({
      ...current,
      id: 'demo-operations-mcp-r2',
      revision: 2,
      createdAt: '2026-08-10T12:00:00.000Z',
    });
    target.currentRevisionId = 'demo-operations-mcp-r2';
    const store = createEvaluationLayerStore(state);

    expect(store.decideRevision('report-operations-mcp-baseline', 'APPROVED', ADMIN_ACTOR)).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    expect(store.getState().revisionDecisions).toEqual([]);
  });

  it('requires the Admin decision before a Developer creates a new revision', () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => 'demo-operations-mcp-r2',
    });

    expect(store.createTargetRevision('demo-operations-mcp', {}, DEVELOPER_ACTOR)).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    expect(store.decideRevision('report-operations-mcp-baseline', 'APPROVED', ADMIN_ACTOR).ok).toBe(true);
    expect(store.createTargetRevision('demo-operations-mcp', {}, DEVELOPER_ACTOR).ok).toBe(true);
  });

  it('requires a decision on the latest current Report before rerunning the same revisions', () => {
    let sequence = 0;
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => `rerun-after-decision-${sequence++}`,
    });
    const input = {
      targetRevisionId: 'demo-operations-mcp-r1',
      datasetRevisionId: 'mcp-operational-check-r1',
      guardrailTemplateIds: ['guardrail-template-universal-safety'],
      evaluatorIds: ['permission-compliance'],
    };
    const runCount = store.getState().runs.length;

    expect(store.createRun(input)).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    expect(store.getState().runs).toHaveLength(runCount);

    expect(store.decideRevision(
      'report-operations-mcp-baseline',
      'APPROVED',
      ADMIN_ACTOR,
    ).ok).toBe(true);
    const rerun = store.createRun(input);
    expect(rerun).toMatchObject({ ok: true });
    if (!rerun.ok) return;
    let complete = false;
    while (!complete) {
      const advanced = store.advanceRun(rerun.value.runId);
      expect(advanced.ok).toBe(true);
      if (!advanced.ok) return;
      complete = advanced.value.complete;
    }

    expect(store.createRun(input)).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
  });

  it('does not let an undecided stale Dataset Report block a new Target revision', () => {
    const state = cloneEvaluationLayerFixtures();
    const published = state.datasetRevisions.find(
      (item) => item.id === 'mcp-operational-check-r1',
    )!;
    state.datasetRevisions.push({
      ...published,
      id: 'mcp-operational-check-r2',
      revision: 2,
      createdAt: '2026-08-10T12:00:00.000Z',
    });
    const store = createEvaluationLayerStore(state, {
      id: () => 'demo-operations-mcp-r2',
    });

    expect(store.createTargetRevision('demo-operations-mcp', {}, DEVELOPER_ACTOR)).toMatchObject({
      ok: true,
      value: { revisionId: 'demo-operations-mcp-r2' },
    });
  });

  it('does not let an undecided stale Dataset Report block a run of the latest published revision', () => {
    const state = cloneEvaluationLayerFixtures();
    const published = state.datasetRevisions.find(
      (item) => item.id === 'mcp-operational-check-r1',
    )!;
    state.datasetRevisions.push({
      ...published,
      id: 'mcp-operational-check-r2',
      revision: 2,
      createdAt: '2026-08-10T12:00:00.000Z',
    });
    const store = createEvaluationLayerStore(state, {
      id: () => 'latest-dataset-run',
    });

    expect(store.createRun({
      targetRevisionId: 'demo-operations-mcp-r1',
      datasetRevisionId: 'mcp-operational-check-r2',
      guardrailTemplateIds: ['guardrail-template-universal-safety'],
      evaluatorIds: ['permission-compliance'],
    })).toMatchObject({
      ok: true,
      value: { runId: 'latest-dataset-run' },
    });
  });

  it('does not let a non-reviewable Report block a new Target revision', () => {
    const state = cloneEvaluationLayerFixtures();
    const run = state.runs.find(
      (item) => item.id === 'run-operations-mcp-baseline',
    )!;
    run.status = 'RUNNING';
    run.results[0]!.status = 'PENDING';
    const store = createEvaluationLayerStore(state, {
      id: () => 'demo-operations-mcp-r2',
    });

    expect(store.createTargetRevision('demo-operations-mcp', {}, DEVELOPER_ACTOR)).toMatchObject({
      ok: true,
      value: { revisionId: 'demo-operations-mcp-r2' },
    });
  });

  it('allows Reflection changes only after rejection', () => {
    let sequence = 0;
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => `reflection-after-reject-${sequence++}`,
    });

    expect(store.submitReflection('report-permission-baseline', ['reflection-guard-order'], DEVELOPER_ACTOR)).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    expect(store.decideRevision('report-permission-baseline', 'REJECTED', ADMIN_ACTOR).ok).toBe(true);
    expect(store.submitReflection('report-permission-baseline', ['reflection-guard-order'], DEVELOPER_ACTOR)).toMatchObject({
      ok: true,
      value: { revisionId: expect.any(String) },
    });
  });

  it('allows dismissing Reflection only for the current rejected revision', () => {
    let sequence = 0;
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => `reflection-dismiss-${sequence++}`,
    });

    expect(store.finishReflectionWithoutChanges('report-permission-baseline', DEVELOPER_ACTOR)).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
    expect(store.decideRevision('report-permission-baseline', 'REJECTED', ADMIN_ACTOR).ok).toBe(true);
    expect(store.finishReflectionWithoutChanges('report-permission-baseline', DEVELOPER_ACTOR).ok).toBe(true);
    expect(store.getState().reflections.find(
      (item) => item.id === 'reflection-guard-order',
    )?.status).toBe('DISMISSED');
  });

  it('rejects decisions from non-admin actors', () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());

    expect(store.decideRevision('report-operations-mcp-baseline', 'APPROVED', {
      name: 'Developer',
      role: 'member',
    })).toMatchObject({
      ok: false,
      code: 'UNAVAILABLE',
    });
  });

  it.each(['admin', 'ada', 'frt', 'iss', 'compliance'])(
    'keeps rejected Target changes unavailable to the %s role',
    (role) => {
      const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
      const actor = { name: role, role };

      expect(store.decideRevision(
        'report-permission-baseline',
        'REJECTED',
        ADMIN_ACTOR,
      ).ok).toBe(true);
      expect(store.createTargetRevision(
        'demo-permission-compliance',
        {},
        actor,
      )).toMatchObject({ ok: false, code: 'UNAVAILABLE' });
      expect(store.submitReflection(
        'report-permission-baseline',
        ['reflection-guard-order'],
        actor,
      )).toMatchObject({ ok: false, code: 'UNAVAILABLE' });
      expect(store.finishReflectionWithoutChanges(
        'report-permission-baseline',
        actor,
      )).toMatchObject({ ok: false, code: 'UNAVAILABLE' });
    },
  );

  it('rejects a decision for an outdated published Dataset revision', () => {
    const state = cloneEvaluationLayerFixtures();
    const current = state.datasetRevisions.find(
      (item) => item.id === 'mcp-operational-check-r1',
    )!;
    state.datasetRevisions.push({
      ...current,
      id: 'mcp-operational-check-r2',
      revision: 2,
      createdAt: '2026-08-10T12:00:00.000Z',
    });
    const store = createEvaluationLayerStore(state);

    expect(store.decideRevision('report-operations-mcp-baseline', 'APPROVED', ADMIN_ACTOR)).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
  });

  it('does not approve a completed Report with no Case results', () => {
    const state = cloneEvaluationLayerFixtures();
    state.runs.find((item) => item.id === 'run-operations-mcp-baseline')!.results = [];
    const store = createEvaluationLayerStore(state);

    expect(store.decideRevision('report-operations-mcp-baseline', 'APPROVED', ADMIN_ACTOR)).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
  });

  it('validates that a Revision Decision matches its Report Run revision', () => {
    const state = cloneEvaluationLayerFixtures();
    state.revisionDecisions.push({
      id: 'mismatched-decision',
      reportId: 'report-operations-mcp-baseline',
      targetRevisionId: 'demo-policy-kb-r1',
      status: 'APPROVED',
      actor: 'Local Administrator',
      decidedAt: '2026-08-10T11:30:00.000Z',
    });

    expect(validateEvaluationLayerState(state)).toContain(
      'revisionDecisions.mismatched-decision.targetRevisionId: demo-policy-kb-r1',
    );
  });

  it('stores Dataset schema, completes Tool coverage and shares Dataset context', () => {
    let sequence = 0;
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => `legacy-dataset-${sequence++}`,
      now: () => '2026-08-05T10:00:00.000Z',
    });
    const targetId = store.getState().targets[0]!.id;
    const created = store.createDataset({
      targetId,
      name: 'Coverage draft',
      description: '',
      schema: [{ name: 'query', kind: 'input', dataType: 'string', required: true, description: 'Query' }],
    });
    if (!created.ok) throw new Error(created.error);

    expect(store.selectActiveDataset(created.value.datasetId)).toEqual({ ok: true, value: undefined });
    expect(store.completeCoverage(created.value.datasetId)).toEqual({ ok: true, value: { generated: 3 } });
    expect(store.getState().settings.activeTargetId).toBe(targetId);
    expect(store.getState().settings.activeDatasetId).toBe(created.value.datasetId);
    expect(store.getState().datasets.at(-1)?.schema?.[0]?.name).toBe('query');
    expect(store.getState().datasetRevisions.at(-1)?.cases).toHaveLength(3);
  });

  it('clamps and validates the sampling rate', () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());

    expect(store.setSamplingRate(150)).toEqual({ ok: true, value: undefined });
    expect(store.getState().settings.samplingRate).toBe(100);
    expect(store.setSamplingRate(-5)).toEqual({ ok: true, value: undefined });
    expect(store.getState().settings.samplingRate).toBe(0);
    expect(store.setSamplingRate(Number.NaN).ok).toBe(false);
  });

  it('updates threshold and mock alerts for only the selected evaluator', () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
    const [first, second] = store.getState().evaluators;

    expect(first?.minimumScore).toBe(80);
    expect(first?.sendAlert).toBe(false);
    expect(store.setEvaluatorMinimumScore(first!.id, 120)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(store.getState().evaluators[0]!.minimumScore).toBe(100);
    expect(store.getState().evaluators[1]!.minimumScore).toBe(second!.minimumScore);
    expect(store.setEvaluatorMinimumScore(first!.id, -7)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(store.getState().evaluators[0]!.minimumScore).toBe(0);
    expect(store.setEvaluatorMinimumScore(first!.id, Number.NaN).ok).toBe(false);
    expect(store.setEvaluatorMinimumScore('missing', 80).ok).toBe(false);
    expect(store.setEvaluatorSendAlert(first!.id, true)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(store.getState().evaluators[0]!.sendAlert).toBe(true);
    expect(store.getState().evaluators[1]!.sendAlert).toBe(second!.sendAlert);
    expect(store.setEvaluatorSendAlert('missing', true).ok).toBe(false);
  });

  it('toggles evaluators used by the next Evaluation', () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
    const evaluator = store.getState().evaluators[0]!;

    expect(store.setEvaluatorEnabled(evaluator.id, false)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(store.getState().evaluators[0]!.enabled).toBe(false);
    expect(store.setEvaluatorEnabled('missing', true).ok).toBe(false);
  });

  it('ticks the live simulation with a trace, activity event, and valid state', () => {
    let sequence = 0;
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => `sim-${sequence++}`,
      now: () => '2026-08-05T10:00:00.000Z',
      random: () => 0.1,
    });
    const before = store.getState().traces.length;

    const result = store.tickSimulation();

    expect(result.ok).toBe(true);
    const state = store.getState();
    expect(state.traces.length).toBe(before + 1);
    expect(state.traces[0]!.startedAt).toBe('2026-08-05T10:00:00.000Z');
    expect(state.activity.length).toBeGreaterThan(0);
    expect(state.activity[0]!.traceId).toBe(state.traces[0]!.id);
    expect(state.targets.find((t) => t.id === state.traces[0]!.targetId)?.lastActivityAt).toBe(
      '2026-08-05T10:00:00.000Z',
    );
    // Simulated traces attach to a dedicated live-monitoring run, never to a
    // completed evaluation run, so generated Reports stay static.
    const liveTrace = state.traces[0]!;
    expect(isLiveMonitoringRun(liveTrace.runId)).toBe(true);
    const liveRun = state.runs.find((run) => run.id === liveTrace.runId)!;
    expect(liveRun.targetId).toBe(liveTrace.targetId);
    expect(liveRun.status).toBe("RUNNING");
    expect(
      state.traces.filter((trace) => trace.runId === "run-permission-baseline"),
    ).toHaveLength(6);
    // A second tick reuses the same live run instead of creating more runs.
    const runCount = state.runs.length;
    store.tickSimulation();
    expect(store.getState().runs).toHaveLength(runCount);
    // The simulated trace must keep referential integrity with runs/datasets.
    expect(validateEvaluationLayerState(state)).toEqual([]);
  });

  it('starts and stops the simulation timer idempotently', () => {
    vi.useFakeTimers();
    try {
      let sequence = 0;
      const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
        id: () => `timer-${sequence++}`,
        random: () => 0.1,
      });
      const before = store.getState().traces.length;
      store.startSimulation(10);
      store.startSimulation(10); // second start is a no-op
      vi.advanceTimersByTime(25);
      expect(store.getState().traces.length).toBe(before + 2);
      store.stopSimulation();
      store.stopSimulation(); // second stop is a no-op
      vi.advanceTimersByTime(50);
      expect(store.getState().traces.length).toBe(before + 2);
    } finally {
      vi.useRealTimers();
    }
  });
});
