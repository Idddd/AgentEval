import { describe, expect, it } from "vitest";
import type { DemoWorkflowDependencies, DemoWorkflowScheduler } from "./model";
import { createDemoWorkflowActions } from "./simulation";
import { selectAdminMonitor, selectAdminReleaseCandidates, selectEndUserGarden, selectEndUserInstances } from "./selectors";
import { createDemoWorkflowStore } from "./store";
import * as demoStoreModule from "./store";
import { cloneEvaluationLayerFixtures } from "../evaluation-layer/fixture-validation";
import { createEvaluationLayerStore } from "../evaluation-layer/mock-store";

function createBridgeStores() {
  let evalId = 0;
  const workflow = createDemoWorkflowStore("individual", dependencies());
  const evaluation = createEvaluationLayerStore(
    cloneEvaluationLayerFixtures(),
    {
      id: () => `eval-bridge-${++evalId}`,
      now: () => "2026-08-20T00:30:00.000Z",
      random: () => 0.9,
    },
  );
  const factory = (demoStoreModule as unknown as {
    createDemoEvaluationBridge: (
      workflowStore: typeof workflow,
      evaluationStore: typeof evaluation,
    ) => {
      sync(): void;
      evaluationTargetIdFor(revisionId: string): string | null;
      evaluationTargetRevisionIdFor(revisionId: string): string | null;
      submitToAdminEval(targetRevisionId: string, justification: string): void;
    };
  }).createDemoEvaluationBridge;
  return { workflow, evaluation, bridge: factory(workflow, evaluation) };
}

function createReadyBridgeAgent(workflow: ReturnType<typeof createDemoWorkflowStore>) {
  const agent = workflow.createAgent(
    {
      name: "Returns Triage Assistant",
      owner: "Customer Operations",
      description: "Triages return requests against approved policy.",
      businessOutcome: "Resolve valid returns faster",
      targetUsers: "Customer support specialists",
      typicalScenarios: ["Return eligibility", "Escalation guidance"],
      runtimeType: "Managed interactive",
      model: "Demo reasoning model",
      endpoint: "https://demo.invalid/returns",
      mcpIds: [],
      skillIds: [],
      knowledgeBaseIds: [],
    },
    "agent-wizard",
  );
  const revision = workflow.getState().agentRevisions.find((item) => item.agentId === agent.id)!;
  workflow.markReadyForTechnicalValidation(revision.id, "agent-wizard");
  return revision;
}

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
  it("carries selected demo resources from Build into the Evaluate revision", () => {
    const { workflow, evaluation, bridge } = createBridgeStores();
    const agent = workflow.createAgent(
      {
        name: "Preset Resource Assistant",
        owner: "Customer Operations",
        description: "Uses the prebuilt demo resources.",
        businessOutcome: "Demonstrate a connected Agent build",
        targetUsers: "Demo reviewers",
        typicalScenarios: ["Connected resource demo"],
        runtimeType: "Managed interactive",
        model: "Demo reasoning model",
        endpoint: "https://demo.invalid/preset-resource-agent",
        mcpIds: ["demo-operations-mcp"],
        skillIds: ["demo-document-summarization"],
        knowledgeBaseIds: ["demo-policy-kb"],
      },
      "agent-wizard",
    );
    const revision = workflow.getState().agentRevisions.find((item) => item.agentId === agent.id)!;
    workflow.markReadyForTechnicalValidation(revision.id, "agent-wizard");

    bridge.sync();

    const targetRevisionId = bridge.evaluationTargetRevisionIdFor(revision.id);
    const targetRevision = evaluation.getState().targetRevisions.find(
      (item) => item.id === targetRevisionId,
    );
    expect(targetRevision?.tools.map((item) => item.name)).toEqual([
      "Operations MCP",
      "Document Summarization",
    ]);
    expect(targetRevision?.sources?.map((item) => item.name)).toEqual([
      "Permission Policy KB",
    ]);
  });

  it("keeps a newly added Agent in Build until it is ready for Evaluate", () => {
    const { workflow, evaluation, bridge } = createBridgeStores();
    const agent = workflow.createAgent(
      {
        name: "Returns Triage Assistant",
        owner: "Customer Operations",
        description: "Triages return requests against approved policy.",
        businessOutcome: "Resolve valid returns faster",
        targetUsers: "Customer support specialists",
        typicalScenarios: ["Return eligibility"],
        runtimeType: "Managed interactive",
        model: "Demo reasoning model",
        endpoint: "https://demo.invalid/returns",
        mcpIds: [],
        skillIds: [],
        knowledgeBaseIds: [],
      },
      "agent-wizard",
    );
    const revision = workflow.getState().agentRevisions.find((item) => item.agentId === agent.id)!;

    bridge.sync();

    expect(bridge.evaluationTargetIdFor(revision.id)).toBeNull();
    expect(evaluation.getState().targets.some((item) => item.name === agent.name)).toBe(false);

    workflow.markReadyForTechnicalValidation(revision.id, "agent-wizard");
    bridge.sync();

    expect(bridge.evaluationTargetIdFor(revision.id)).not.toBeNull();
  });

  it("maps a ready Build into Evaluate and submits the evaluated revision to Admin Eval", () => {
    const { workflow, evaluation, bridge } = createBridgeStores();
    const revision = createReadyBridgeAgent(workflow);

    bridge.sync();

    const targetId = bridge.evaluationTargetIdFor(revision.id);
    const targetRevisionId = bridge.evaluationTargetRevisionIdFor(revision.id);
    expect(targetId).not.toBeNull();
    expect(evaluation.getState().targets.find((item) => item.id === targetId)).toMatchObject({
      name: "Returns Triage Assistant",
      kind: "agent",
    });
    expect(evaluation.getState().targetRevisions.find((item) => item.id === targetRevisionId)).toMatchObject({
      model: "Demo reasoning model",
      adapter: "Managed interactive",
      endpoint: "https://demo.invalid/returns",
    });

    const dataset = evaluation.createDataset({
      targetId: targetId!,
      name: "Returns readiness",
      description: "Core return scenarios",
    });
    if (!dataset.ok) throw new Error(dataset.error);
    const testCase = evaluation.createCase(dataset.value.datasetId, {
      input: { prompt: "Is this return eligible?" },
      expectedOutput: { answer: "Use the approved return policy." },
      tags: ["returns"],
      source: "session",
    });
    if (!testCase.ok) throw new Error(testCase.error);
    const published = evaluation.publishDatasetRevision(dataset.value.datasetId);
    if (!published.ok) throw new Error(published.error);
    const run = evaluation.createRun({
      targetRevisionId: targetRevisionId!,
      datasetRevisionId: published.value.revisionId,
      guardrailTemplateIds: ["guardrail-template-universal-safety"],
      evaluatorIds: evaluation.getState().evaluators.filter((item) => item.enabled).map((item) => item.id),
    });
    if (!run.ok) throw new Error(run.error);

    bridge.sync();
    expect(workflow.getState().agentRevisions.find((item) => item.id === revision.id)?.status).toBe("VALIDATING");
    for (;;) {
      const advanced = evaluation.advanceRun(run.value.runId);
      if (!advanced.ok) throw new Error(advanced.error);
      if (advanced.value.complete) break;
    }
    bridge.sync();

    expect(workflow.getState().agentRevisions.find((item) => item.id === revision.id)).toMatchObject({
      status: "VALIDATED",
      technicalResult: { outcome: "PASSED" },
    });

    bridge.submitToAdminEval(targetRevisionId!, "Ready for Admin review.");
    expect(workflow.getState().agentRevisions.find((item) => item.id === revision.id)?.status).toBe("PENDING_EVAL");

    workflow.startBusinessEvaluation(
      revision.id,
      {
        businessPurpose: "Resolve valid returns faster without bypassing policy.",
        targetUsers: "Customer support specialists",
        criticality: "High",
        dataSensitivity: "Confidential customer data",
        successThreshold: 85,
        datasetId: "dataset-support-readiness",
        guardrailTemplates: [{
          id: "guardrail-template:returns:R1",
          sourceGuardrailId: "returns",
          sourceGuardrailRevisionId: "returns:R1",
          version: "1",
          name: "Returns Safety",
        }],
        approvalReason: "Ready for the returns pilot.",
      },
      "admin",
    );
    workflow.completeBusinessEvaluation(revision.id, "PASSED");
    workflow.decideRevision(revision.id, "APPROVED", "Approved for pilot", "admin");
    bridge.sync();

    expect(evaluation.getState().revisionDecisions.find((item) => item.targetRevisionId === targetRevisionId)).toMatchObject({
      status: "APPROVED",
    });

    const nextRevision = workflow.createAgentRevision(revision.agentId, "agent-wizard");
    workflow.markReadyForTechnicalValidation(nextRevision.id, "agent-wizard");
    bridge.sync();

    expect(bridge.evaluationTargetRevisionIdFor(nextRevision.id)).not.toBeNull();
    expect(evaluation.getState().targetRevisions.find(
      (item) => item.id === bridge.evaluationTargetRevisionIdFor(nextRevision.id),
    )).toMatchObject({ revision: 2 });
  });

  it("creates a new Evaluate revision when a ready Build configuration changes", () => {
    const { workflow, evaluation, bridge } = createBridgeStores();
    const revision = createReadyBridgeAgent(workflow);
    bridge.sync();
    const firstEvaluationRevisionId = bridge.evaluationTargetRevisionIdFor(revision.id);

    workflow.updateAgentDraft(
      revision.id,
      {
        runtimeType: revision.runtimeType,
        model: "Demo reasoning model v2",
        endpoint: revision.endpoint,
        mcpIds: revision.mcpIds,
        skillIds: revision.skillIds,
        knowledgeBaseIds: revision.knowledgeBaseIds,
      },
      "agent-wizard",
    );
    bridge.sync();

    const nextEvaluationRevisionId = bridge.evaluationTargetRevisionIdFor(revision.id);
    expect(nextEvaluationRevisionId).not.toBe(firstEvaluationRevisionId);
    expect(evaluation.getState().targetRevisions.find((item) => item.id === nextEvaluationRevisionId)).toMatchObject({
      revision: 2,
      model: "Demo reasoning model v2",
    });
    expect(workflow.getState().agentRevisions.find((item) => item.id === revision.id)?.status).toBe("READY_FOR_VALIDATION");
  });

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
      publishedAgents: 8,
      activeInstances: 0,
      stoppedInstances: 1,
      taskSuccess: 92,
    });
  });
});
