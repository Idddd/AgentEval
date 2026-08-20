import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoWorkflowActions } from "./simulation";
import { createDemoWorkflowStore } from "./store";
import type { DemoWorkflowDependencies } from "./model";

function dependencies(): DemoWorkflowDependencies {
  let id = 0;
  return {
    id: () => `simulation-${++id}`,
    now: () => "2026-08-20T00:00:00.000Z",
    sessionId: () => "simulation-session",
  };
}

function readyForValidationStore() {
  const store = createDemoWorkflowStore("individual", dependencies());
  const agent = store.createAgent(
    {
      name: "Validation Assistant",
      owner: "Platform Engineering",
      description: "Validates the simulation layer.",
      businessOutcome: "Reliable technical checks",
      targetUsers: "Agent builders",
      typicalScenarios: ["Build validation"],
      runtimeType: "Managed interactive",
      model: "Demo reasoning model",
      endpoint: "https://demo.invalid/agents/validation",
      mcpIds: [],
      skillIds: [],
      knowledgeBaseIds: [],
    },
    "agent-wizard",
  );
  const revision = store.getState().agentRevisions.find(
    (item) => item.agentId === agent.id,
  )!;
  store.markReadyForTechnicalValidation(revision.id, "agent-wizard");
  return { store, revision };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("DemoWorkflowActions", () => {
  it("completes technical validation through the injected scheduler", () => {
    vi.useFakeTimers();
    const { store, revision } = readyForValidationStore();
    const actions = createDemoWorkflowActions(store, {
      schedule: setTimeout,
      clear: clearTimeout,
    });

    actions.runTechnicalValidation(revision.id);
    expect(
      store.getState().agentRevisions.find((item) => item.id === revision.id)
        ?.status,
    ).toBe("VALIDATING");

    vi.advanceTimersByTime(600);

    expect(
      store.getState().agentRevisions.find((item) => item.id === revision.id)
        ?.status,
    ).toBe("VALIDATED");
  });

  it("cancels pending transitions when disposed", () => {
    vi.useFakeTimers();
    const { store, revision } = readyForValidationStore();
    const actions = createDemoWorkflowActions(store, {
      schedule: setTimeout,
      clear: clearTimeout,
    });

    actions.runTechnicalValidation(revision.id);
    actions.dispose();
    vi.runAllTimers();

    expect(
      store.getState().agentRevisions.find((item) => item.id === revision.id)
        ?.status,
    ).toBe("VALIDATING");
  });
});
