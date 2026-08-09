import { describe, expect, it } from "vitest";
import { cloneEvaluationFixtures } from "../fixture-validation";
import type { EvaluationRun } from "../model";
import { runProgressView, workflowStages } from "./run-view-model";

describe("evaluation Run view models", () => {
  it("locks only completed and current workflow stages", () => {
    expect(workflowStages({ stage: "report" } as EvaluationRun)).toEqual([
      { id: "setup", enabled: true, complete: true },
      { id: "evaluate", enabled: true, complete: true },
      { id: "report", enabled: true, complete: false },
      { id: "reflect", enabled: false, complete: false },
      { id: "complete", enabled: false, complete: false },
    ]);
  });

  it("summarizes live per-case progress", () => {
    const run = cloneEvaluationFixtures().runs.find(
      (item) => item.results.length > 0,
    )!;
    expect(runProgressView(run)).toMatchObject({
      total: 6,
      completed: 6,
      percent: 100,
    });
  });
});
