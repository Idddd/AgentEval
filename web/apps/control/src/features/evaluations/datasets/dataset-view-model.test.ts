import { describe, expect, it } from "vitest";
import { cloneEvaluationFixtures } from "../fixture-validation";
import { datasetDetailView } from "./dataset-view-model";

describe("evaluation Dataset view models", () => {
  it("shows current published revision and draft changes", () => {
    const state = cloneEvaluationFixtures();
    state.datasets[0]!.draftCases.push({
      id: "draft-extra",
      input: { query: "new" },
      expected: { outcome: "DENY", reason: "deny" },
      source: "MANUAL",
    });
    const detail = datasetDetailView(state, state.datasets[0]!.id)!;
    expect(detail.publishedCaseCount).toBe(6);
    expect(detail.draftCaseCount).toBe(7);
    expect(detail.hasUnpublishedChanges).toBe(true);
  });

  it("flattens optional headers without losing expected behavior", () => {
    const state = cloneEvaluationFixtures();
    const detail = datasetDetailView(state, state.datasets[0]!.id)!;
    expect(detail.caseRows[0]).toHaveProperty("expectedOutcome");
    expect(detail.caseRows[0]).toHaveProperty("headers");
  });
});
