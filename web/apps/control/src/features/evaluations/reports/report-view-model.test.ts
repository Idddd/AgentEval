import { describe, expect, it } from "vitest";
import { cloneEvaluationFixtures } from "../fixture-validation";
import {
  reportComparisonView,
  reportDetailView,
} from "./report-view-model";

describe("evaluation Report view models", () => {
  it("keeps optional evidence unavailable without changing Report status", () => {
    const state = cloneEvaluationFixtures();
    const report = state.reports[0]!;
    const run = state.runs.find((item) => item.id === report.runId)!;
    delete run.results[0]!.judge;
    const view = reportDetailView(state, report.id)!;
    expect(view.status).toBe(report.status);
    expect(view.caseRows[0]!.judge).toBe("Not available");
  });

  it("identifies the intentionally injected regression", () => {
    const state = cloneEvaluationFixtures();
    const [current, baseline] = state.reports;
    const view = reportComparisonView(state, baseline!.id, current!.id);
    expect(view.regressions).toContain("permission-bypass");
  });
});
