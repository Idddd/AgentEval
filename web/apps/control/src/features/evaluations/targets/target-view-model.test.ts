import { describe, expect, it } from "vitest";
import { cloneEvaluationFixtures } from "../fixture-validation";
import { targetDetailView, targetListRows } from "./target-view-model";

describe("evaluation Target view models", () => {
  it("summarizes the latest Target quality and component counts", () => {
    const state = cloneEvaluationFixtures();
    const row = targetListRows(state).find(
      (item) => item.name === "Permission Compliance Agent",
    )!;
    expect(row).toMatchObject({
      revision: 2,
      tools: 3,
      lastStatus: "FAIL",
      passRate: 83.3,
    });
  });

  it("orders Report history newest first", () => {
    const state = cloneEvaluationFixtures();
    const detail = targetDetailView(state, state.targets[0]!.id)!;
    expect(detail.reports[0]!.createdAt >= detail.reports[1]!.createdAt).toBe(
      true,
    );
  });
});
