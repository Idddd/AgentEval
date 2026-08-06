import { describe, expect, it } from "vitest";
import {
  cloneEvaluationFixtures,
  validateEvaluationState,
} from "./fixture-validation";
import { evaluationFixtures } from "./fixtures";

describe("evaluation fixtures", () => {
  it("form a valid connected Target-to-Report graph", () => {
    expect(validateEvaluationState(evaluationFixtures)).toEqual([]);
  });

  it("create an isolated mutable graph for each mounted project", () => {
    const first = cloneEvaluationFixtures();
    const second = cloneEvaluationFixtures();

    first.targets[0]!.name = "Changed in one tab";

    expect(second.targets[0]!.name).not.toBe("Changed in one tab");
    expect(evaluationFixtures.targets[0]!.name).not.toBe("Changed in one tab");
  });

  it("reports broken revision references with a stable path", () => {
    const state = cloneEvaluationFixtures();
    state.runs[0]!.targetRevisionId = "missing-revision";

    expect(validateEvaluationState(state)).toContain(
      `runs.${state.runs[0]!.id}.targetRevisionId: missing-revision`,
    );
  });
});
