import { describe, expect, it } from "vitest";
import { cloneEvaluationLayerFixtures } from "../fixture-validation";
import {
  overviewTraceStatus,
  traceEvaluatorAlertTriggered,
  traceEvaluatorSummary,
} from "./overview-evaluator-policy";

describe("Overview evaluator policy", () => {
  it("normalizes Built-in and judge averages and counts enabled evaluators", () => {
    const state = cloneEvaluationLayerFixtures();
    const fixtureTrace = state.traces.find(
      (item) => item.id === "demo-jailbreak-guard-bypass",
    )!;
    const trace = {
      ...fixtureTrace,
      deterministicScores: {
        permission_compliance: 0.6,
        execution_correctness: 1,
      },
      judge: {
        ...fixtureTrace.judge!,
        scores: { correctness: 4, safety: 3 },
      },
    };

    const summary = traceEvaluatorSummary(trace, state.evaluators, 80);

    expect(summary).toMatchObject({
      passed: 1,
      evaluated: 2,
      totalEnabled: 2,
      allPassed: false,
      evaluatedAny: true,
    });
    expect(
      summary.details.map((item) => [
        item.evaluatorName,
        item.normalizedScore,
        item.passed,
      ]),
    ).toEqual([
      ["Permission compliance", 80, true],
      ["Recorded demo judge", 70, false],
    ]);
  });

  it("excludes disabled evaluators and reports missing enabled results", () => {
    const state = cloneEvaluationLayerFixtures();
    const { judge: _judge, ...trace } = state.traces[0]!;
    const withJudgeDisabled = state.evaluators.map((item) =>
      item.provider === "LANGFUSE" ? { ...item, enabled: false } : item,
    );

    expect(traceEvaluatorSummary(trace, withJudgeDisabled, 80)).toMatchObject({
      passed: 1,
      evaluated: 1,
      totalEnabled: 1,
      allPassed: true,
    });
    expect(traceEvaluatorSummary(trace, state.evaluators, 80)).toMatchObject({
      passed: 1,
      evaluated: 1,
      totalEnabled: 2,
      allPassed: false,
    });
  });

  it("does not fail a Trace when no enabled evaluator has a result", () => {
    const state = cloneEvaluationLayerFixtures();
    const { judge: _judge, ...withoutJudge } = state.traces[0]!;
    const trace = {
      ...withoutJudge,
      deterministicScores: {},
      status: "FAIL" as const,
    };

    expect(traceEvaluatorSummary(trace, state.evaluators, 80)).toMatchObject({
      passed: 0,
      evaluated: 0,
      totalEnabled: 2,
      allPassed: false,
      evaluatedAny: false,
    });
    expect(overviewTraceStatus(trace, state.evaluators, 80)).toBe("PASS");
  });

  it("preserves ERROR and otherwise derives status from evaluators", () => {
    const state = cloneEvaluationLayerFixtures();
    const passing = state.traces.find(
      (item) => item.id === "demo-weather-guest-allow",
    )!;
    const failing = state.traces.find(
      (item) => item.id === "demo-jailbreak-guard-bypass",
    )!;
    const runtimeError = state.traces.find((item) => item.status === "ERROR")!;

    expect(overviewTraceStatus(passing, state.evaluators, 80)).toBe("PASS");
    expect(overviewTraceStatus(failing, state.evaluators, 80)).toBe("FAIL");
    expect(overviewTraceStatus(runtimeError, state.evaluators, 80)).toBe("ERROR");
    expect(
      overviewTraceStatus(
        { ...passing, status: "FAIL", markedFailed: true },
        state.evaluators,
        80,
      ),
    ).toBe("PASS");
  });

  it("triggers only enabled score alerts below policy", () => {
    const state = cloneEvaluationLayerFixtures();
    const passing = state.traces.find(
      (item) => item.id === "demo-weather-guest-allow",
    )!;
    const failing = state.traces.find(
      (item) => item.id === "demo-jailbreak-guard-bypass",
    )!;

    expect(
      traceEvaluatorAlertTriggered(failing, state.evaluators, 80, true),
    ).toBe(true);
    expect(
      traceEvaluatorAlertTriggered(failing, state.evaluators, 80, false),
    ).toBe(false);
    expect(
      traceEvaluatorAlertTriggered(passing, state.evaluators, 80, true),
    ).toBe(false);
  });
});
