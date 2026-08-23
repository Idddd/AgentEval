import { describe, expect, it } from "vitest";
import { cloneDemoWorkflowFixtures } from "./fixtures";
import {
  selectAdminMonitor,
  selectAdminReleaseCandidates,
  selectAgentWizardBuilds,
  selectEndUserGarden,
  selectEndUserInstances,
} from "./selectors";

describe("demo workflow persona selectors", () => {
  it("shows technical configuration only to Agent Wizard", () => {
    const state = cloneDemoWorkflowFixtures("individual", "selector-session");

    const build = selectAgentWizardBuilds(state).find(
      (item) => item.name === "Policy Guidance Assistant",
    )!;
    const garden = selectEndUserGarden(state);
    const gardenCard = garden.find(
      (item) => item.name === "Policy Guidance Assistant",
    )!;

    expect(build).toMatchObject({
      name: "Policy Guidance Assistant",
      revisionId: "fixture-policy-guidance-r1",
      model: "Demo reasoning model",
      endpoint: "https://demo.invalid/agents/policy-guidance",
    });
    expect(gardenCard).toMatchObject({
      name: "Policy Guidance Assistant",
      availability: "Available",
      approved: true,
    });
    expect(gardenCard).not.toHaveProperty("endpoint");
    expect(gardenCard).not.toHaveProperty("model");
    expect(gardenCard).not.toHaveProperty("mcpIds");
    expect(gardenCard).not.toHaveProperty("revisionId");
    expect(garden).toHaveLength(7);
    expect(garden[0]?.name).toBe("Onboarding Assistant");
    expect(garden.find((item) => item.name === "OpenClaw Generalist")?.runtimeType).toBe("openclaw");
  });

  it("projects Release Candidates as business evidence without technical fields", () => {
    const state = cloneDemoWorkflowFixtures("individual", "selector-session");
    state.agentRevisions[0] = {
      ...state.agentRevisions[0]!,
      status: "PENDING_APPROVAL",
    };

    const candidates = selectAdminReleaseCandidates(state);
    const candidate = candidates.find((item) => item.name === "Policy Guidance Assistant")!;

    expect(candidate).toMatchObject({
      name: "Policy Guidance Assistant",
      status: "PENDING_APPROVAL",
      businessPurpose: "Provide approved policy guidance.",
      criticality: "Medium",
      dataSensitivity: "Internal policy data",
    });
    expect(candidate).not.toHaveProperty("endpoint");
    expect(candidate).not.toHaveProperty("model");
    expect(candidate).not.toHaveProperty("mcpIds");
    expect(candidates[0]?.status).toBe("PENDING_APPROVAL");
  });

  it("summarizes only the current session for Monitor and Instances", () => {
    const state = cloneDemoWorkflowFixtures("individual", "selector-session");
    state.instances.push({
      id: "instance-stopped",
      demoSessionId: "selector-session",
      projectId: "individual",
      source: "SESSION",
      createdByPersona: "end-user",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:01:00.000Z",
      agentId: "fixture-policy-guidance",
      revisionId: "fixture-policy-guidance-r1",
      name: "Policy Pilot",
      team: "Service Operations",
      intendedUse: "Policy lookup",
      status: "STOPPED",
      readyAt: "2026-08-20T00:00:30.000Z",
      stoppedAt: "2026-08-20T00:01:00.000Z",
    });

    expect(selectEndUserInstances(state)).toEqual([
      expect.objectContaining({
        name: "Policy Pilot",
        status: "STOPPED",
        versionLabel: "Stable version 1",
      }),
    ]);
    expect(selectAdminMonitor(state)).toMatchObject({
      publishedAgents: 7,
      activeInstances: 0,
      stoppedInstances: 1,
      taskSuccess: 92,
    });
  });
});
