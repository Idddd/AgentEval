import { afterEach, describe, expect, it } from "vitest";
import { cloneEvaluationLayerFixtures } from "@/features/evaluation-layer/fixture-validation";
import {
  clearSessionApprovedAgents,
  getSessionApprovedAgents,
  publishSessionApprovedAgent,
} from "./session-approved-agents";

afterEach(clearSessionApprovedAgents);

describe("session approved Agents", () => {
  it("publishes an approved Agent only for the current browser session", () => {
    const state = cloneEvaluationLayerFixtures();
    const target = state.targets.find(
      (item) => item.id === "demo-onboarding-assistant",
    )!;
    const revision = state.targetRevisions.find(
      (item) => item.id === target.currentRevisionId,
    )!;

    publishSessionApprovedAgent(
      "individual",
      target,
      revision,
      "2026-08-19T08:00:00.000Z",
    );

    expect(getSessionApprovedAgents("individual")).toEqual([
      expect.objectContaining({
        name: "Onboarding Assistant",
        status: "READY",
        owner: "Approved by Admin",
        updatedAt: "2026-08-19T08:00:00.000Z",
      }),
    ]);
    expect(getSessionApprovedAgents("another-project")).toEqual([]);
  });
});
