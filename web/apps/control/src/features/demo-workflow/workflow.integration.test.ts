import { describe, expect, it } from "vitest";
import type { DemoWorkflowDependencies, DemoWorkflowScheduler } from "./model";
import { createDemoWorkflowActions } from "./simulation";
import { selectAdminMonitor, selectAdminReleaseCandidates, selectEndUserGarden, selectEndUserInstances } from "./selectors";
import { createDemoWorkflowStore } from "./store";

function dependencies(): DemoWorkflowDependencies {
  let id = 0;
  let tick = 0;
  return {
    id: () => `workflow-${++id}`,
    now: () => `2026-08-20T00:00:${String(tick++).padStart(2, "0")}.000Z`,
    sessionId: () => "complete-workflow-session",
  };
}

function scheduler() {
  const queued: Array<() => void> = [];
  const value: DemoWorkflowScheduler = {
    schedule: (callback) => {
      queued.push(callback);
      return queued.length as unknown as ReturnType<typeof setTimeout>;
    },
    clear: () => undefined,
  };
  return { value, flush: () => queued.shift()?.() };
}

describe("complete session demo workflow", () => {
  it("connects Build, Eval, approval, Garden, Instance, and Monitor without a refresh", () => {
    const store = createDemoWorkflowStore("individual", dependencies());
    const scheduled = scheduler();
    const actions = createDemoWorkflowActions(store, scheduled.value);
    const agent = store.createAgent(
      {
        name: "Customer Resolution Assistant",
        owner: "Customer Operations",
        description: "Helps service teams resolve customer cases consistently.",
        businessOutcome: "Faster, safer customer case resolution",
        targetUsers: "Customer service representatives",
        typicalScenarios: ["Case resolution", "Policy guidance"],
        runtimeType: "Managed interactive",
        model: "Demo reasoning model",
        endpoint: "https://demo.invalid/customer-resolution",
        mcpIds: [],
        skillIds: [],
        knowledgeBaseIds: [],
      },
      "agent-wizard",
    );
    const revision = store.getState().agentRevisions.find((item) => item.agentId === agent.id)!;
    store.markReadyForTechnicalValidation(revision.id, "agent-wizard");
    actions.runTechnicalValidation(revision.id);
    scheduled.flush();
    store.submitReleaseCandidate(revision.id, "agent-wizard");

    expect(selectAdminReleaseCandidates(store.getState()).find((item) => item.name === "Customer Resolution Assistant")).toMatchObject({
      name: "Customer Resolution Assistant",
      status: "PENDING_EVAL",
    });
    actions.runBusinessEvaluation(revision.id, {
      businessPurpose: "Resolve customer cases consistently while protecting restricted information.",
      targetUsers: "Customer service representatives",
      criticality: "High",
      dataSensitivity: "Confidential customer data",
      successThreshold: 85,
      datasetId: "dataset-support-readiness",
      guardrailTemplates: [{
        id: "guardrail-template:customer-data:R1",
        sourceGuardrailId: "customer-data",
        sourceGuardrailRevisionId: "customer-data:R1",
        version: "1",
        name: "Customer Data Protection",
      }],
      approvalReason: "Meets service quality and safety expectations for the pilot team.",
    });
    scheduled.flush();
    store.decideRevision(revision.id, "APPROVED", "Meets pilot expectations", "admin");

    expect(selectEndUserGarden(store.getState())).toContainEqual(
      expect.objectContaining({ name: "Customer Resolution Assistant", availability: "Available" }),
    );
    const instance = actions.provisionInstance({
      agentId: agent.id,
      revisionId: revision.id,
      name: "Customer Resolution Pilot",
      team: "Customer Service Operations",
      intendedUse: "Resolve customer cases using approved policy guidance.",
    });
    scheduled.flush();
    expect(selectEndUserInstances(store.getState())).toContainEqual(
      expect.objectContaining({ id: instance.id, status: "READY" }),
    );
    actions.stopInstance(instance.id);
    scheduled.flush();

    expect(selectEndUserInstances(store.getState())).toContainEqual(
      expect.objectContaining({ id: instance.id, status: "STOPPED" }),
    );
    expect(selectAdminMonitor(store.getState())).toMatchObject({
      publishedAgents: 2,
      activeInstances: 0,
      stoppedInstances: 1,
      taskSuccess: 92,
    });
  });
});
