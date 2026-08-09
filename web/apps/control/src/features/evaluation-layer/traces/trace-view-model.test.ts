import { describe, expect, it } from 'vitest';
import { cloneEvaluationLayerFixtures } from '../fixture-validation';
import {
  judgeAverage,
  legacyToolEvidence,
  observationCount,
  recommendations,
  spanRows,
  traceCost,
  traceLatency,
  traceScoreJson,
} from './trace-view-model';

describe('legacy-aligned Trace view model', () => {
  const traces = cloneEvaluationLayerFixtures().traces;
  const passing = traces.find((trace) => trace.id === 'demo-weather-guest-allow')!;
  const failing = traces.find((trace) => trace.id === 'demo-jailbreak-guard-bypass')!;

  it('uses the legacy summary field definitions', () => {
    expect(observationCount(passing)).toBe(2);
    expect(traceLatency(passing)).toBe(80);
    expect(traceCost(passing)).toBeCloseTo(0.003);
    expect(judgeAverage(passing)).toBeCloseTo(4.75);
  });

  it('builds a selectable parent-child waterfall', () => {
    const rows = spanRows(passing);
    expect(rows.map((row) => [row.span.id, row.depth])).toEqual([
      ['weather-root', 0],
      ['weather-tool', 1],
    ]);
    expect(rows[0]!.latencyMs).toBe(180);
    expect(rows[1]!.latencyMs).toBe(80);
  });

  it('ports the evidence-backed legacy recommendation rules', () => {
    const titles = recommendations(failing).map((item) => item.title);
    expect(titles).toContain('Fix failed check: permission_compliance');
    expect(titles).toContain('Improve correctness (2/5)');
    expect(titles).toContain('Improve safety (1/5)');
  });

  it('exposes the complete legacy Tool observation field shape', () => {
    expect(legacyToolEvidence(passing.toolEvidence[0]!)).toMatchObject({
      call_id: 'demo-weather-guest-allow-call',
      tool_id: 'weather',
      requested: true,
      executed: true,
      succeeded: true,
      effect_verified: null,
      verification_required: false,
      latency_ms: 80,
    });
  });

  it('merges every scoring evaluator into one JSON keyed by evaluator name', () => {
    const fixtures = cloneEvaluationLayerFixtures();
    const json = traceScoreJson(passing, fixtures.evaluators);
    expect(json).toEqual({
      'Permission compliance': passing.deterministicScores,
      'Recorded demo judge': passing.judge!.scores,
    });
  });

  it('includes only the evaluators that actually scored the trace', () => {
    const fixtures = cloneEvaluationLayerFixtures();
    const { judge: _judge, ...withoutJudge } = passing;
    expect(traceScoreJson(withoutJudge, fixtures.evaluators)).toEqual({
      'Permission compliance': passing.deterministicScores,
    });
  });

  it('returns null when no evaluator scored the trace', () => {
    const fixtures = cloneEvaluationLayerFixtures();
    const { judge: _judge, ...rest } = passing;
    const unscored = { ...rest, deterministicScores: {} };
    expect(traceScoreJson(unscored, fixtures.evaluators)).toBeNull();
  });
});
