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

    const summary = traceEvaluatorSummary(trace, state.evaluators);

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
      ["Data leak detection", 80, true],
      ["Token efficiency", 70, false],
    ]);
  });

  it("excludes disabled evaluators and reports missing enabled results", () => {
    const state = cloneEvaluationLayerFixtures();
    const { judge: _judge, ...trace } = state.traces[0]!;
    const withJudgeDisabled = state.evaluators.map((item) =>
      item.provider === "LANGFUSE" ? { ...item, enabled: false } : item,
    );

    expect(traceEvaluatorSummary(trace, withJudgeDisabled)).toMatchObject({
      passed: 1,
      evaluated: 1,
      totalEnabled: 1,
      allPassed: true,
    });
    expect(traceEvaluatorSummary(trace, state.evaluators)).toMatchObject({
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

    expect(traceEvaluatorSummary(trace, state.evaluators)).toMatchObject({
      passed: 0,
      evaluated: 0,
      totalEnabled: 2,
      allPassed: false,
      evaluatedAny: false,
    });
    expect(overviewTraceStatus(trace, state.evaluators)).toBe("PASS");
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

    expect(overviewTraceStatus(passing, state.evaluators)).toBe("PASS");
    expect(overviewTraceStatus(failing, state.evaluators)).toBe("FAIL");
    expect(overviewTraceStatus(runtimeError, state.evaluators)).toBe("ERROR");
    expect(
      overviewTraceStatus(
        { ...passing, status: "FAIL", markedFailed: true },
        state.evaluators,
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

    const alertOnFailingJudge = state.evaluators.map((evaluator) => ({
      ...evaluator,
      sendAlert: evaluator.provider === "LANGFUSE",
    }));
    const alertOnPassingBuiltIn = state.evaluators.map((evaluator) => ({
      ...evaluator,
      sendAlert: evaluator.provider === "BUILT_IN",
      minimumScore: evaluator.provider === "BUILT_IN" ? 0 : evaluator.minimumScore,
    }));

    expect(traceEvaluatorAlertTriggered(failing, alertOnFailingJudge)).toBe(true);
    expect(traceEvaluatorAlertTriggered(failing, alertOnPassingBuiltIn)).toBe(false);
    expect(traceEvaluatorAlertTriggered(passing, alertOnFailingJudge)).toBe(false);
  });

  it("uses each evaluator's own minimum score", () => {
    const state = cloneEvaluationLayerFixtures();
    const fixtureTrace = state.traces.find(
      (item) => item.id === "demo-jailbreak-guard-bypass",
    )!;
    const trace = {
      ...fixtureTrace,
      deterministicScores: { permission_compliance: 0.75 },
      judge: { ...fixtureTrace.judge!, scores: { correctness: 4.5 } },
    };
    const evaluators = state.evaluators.map((evaluator) => ({
      ...evaluator,
      minimumScore: evaluator.provider === "BUILT_IN" ? 70 : 95,
    }));

    expect(traceEvaluatorSummary(trace, evaluators).details.map((detail) => detail.passed)).toEqual([
      true,
      false,
    ]);
  });
});
