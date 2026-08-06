import { describe, expect, it, vi } from "vitest";
import {
  cloneEvaluationLayerFixtures,
  validateEvaluationLayerState,
} from "./fixture-validation";
import { createEvaluationLayerStore, isLiveMonitoringRun } from "./mock-store";

describe("EvaluationLayerStore", () => {
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
    const revision = store.getState().targetRevisions.find(
      (item) => item.targetId === 'demo-operations-mcp',
    )!;
    const datasetRevision = store.getState().datasetRevisions.find(
      (item) => item.targetId === 'demo-operations-mcp',
    )!;
    const created = store.createRun({
      targetRevisionId: revision.id,
      datasetRevisionId: datasetRevision.id,
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
    const revision = store.getState().targetRevisions.find(
      (item) => item.targetId === 'demo-document-summarization',
    )!;
    const datasetRevision = store.getState().datasetRevisions.find(
      (item) => item.targetId === 'demo-document-summarization',
    )!;
    const created = store.createRun({
      targetRevisionId: revision.id,
      datasetRevisionId: datasetRevision.id,
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
