import { describe, expect, it } from "vitest";
import { createDemoWorkflowStore } from "./store";
import type {
  DemoAgentInput,
  DemoAgentRevisionInput,
  DemoWorkflowDependencies,
} from "./model";

function dependencies(sessionId: string): DemoWorkflowDependencies {
  let sequence = 0;
  let tick = 0;
  return {
    id: () => `${sessionId}-${++sequence}`,
    now: () => `2026-08-20T00:00:${String(tick++).padStart(2, "0")}.000Z`,
    sessionId: () => sessionId,
  };
}

const agentInput: DemoAgentInput = {
  name: "Claims Assistant",
  owner: "Claims Operations",
  description: "Helps claims teams review cases consistently.",
  businessOutcome: "Faster, consistent claims review",
  targetUsers: "Claims specialists",
  typicalScenarios: ["Claim intake", "Policy guidance"],
  runtimeType: "Managed interactive",
  model: "Demo reasoning model",
  endpoint: "https://demo.invalid/agents/claims",
  mcpIds: [],
  skillIds: [],
  knowledgeBaseIds: [],
};

function revisionInput(model = agentInput.model): DemoAgentRevisionInput {
  return {
    runtimeType: agentInput.runtimeType,
    model,
    endpoint: agentInput.endpoint,
    mcpIds: [],
    skillIds: [],
    knowledgeBaseIds: [],
  };
}

function publishFirstRevision() {
  const store = createDemoWorkflowStore("individual", dependencies("session-a"));
  const agent = store.createAgent(agentInput, "agent-wizard");
  const revision = store.getState().agentRevisions.find(
    (item) => item.agentId === agent.id,
  )!;
  store.markReadyForTechnicalValidation(revision.id, "agent-wizard");
  store.startTechnicalValidation(revision.id, "agent-wizard");
  store.completeTechnicalValidation(revision.id, "PASSED");
  store.submitReleaseCandidate(revision.id, "agent-wizard");
  store.startBusinessEvaluation(
    revision.id,
    {
      businessPurpose: "Improve consistent claims handling.",
      targetUsers: "Claims specialists",
      criticality: "High",
      dataSensitivity: "Confidential customer data",
      successThreshold: 85,
      datasetId: "dataset-support-readiness",
      guardrailTemplates: [
        {
          id: "guardrail-template:default:R1",
          sourceGuardrailId: "guardrail-default",
          sourceGuardrailRevisionId: "guardrail-default:R1",
          version: "1",
          name: "Default Protection",
        },
      ],
      approvalReason: "Meets pilot expectations.",
    },
    "admin",
  );
  store.completeBusinessEvaluation(revision.id, "PASSED");
  store.decideRevision(revision.id, "APPROVED", "Approved for pilot", "admin");
  return { store, agent, revision };
}

describe("DemoWorkflowStore", () => {
  it("isolates session-created data between store instances", () => {
    const first = createDemoWorkflowStore("individual", dependencies("session-a"));
    const second = createDemoWorkflowStore("individual", dependencies("session-b"));

    first.createSkill(
      { name: "Claims Summary", description: "Summarizes claims" },
      "agent-wizard",
    );

    expect(first.getState().skills.filter((item) => item.source === "SESSION")).toHaveLength(1);
    expect(second.getState().skills.filter((item) => item.source === "SESSION")).toHaveLength(0);
    expect(first.getState().demoSessionId).not.toBe(
      second.getState().demoSessionId,
    );
  });

  it("recreating the store removes session data but restores fixtures", () => {
    const first = createDemoWorkflowStore("individual", dependencies("session-a"));
    first.createSkill(
      { name: "Claims Summary", description: "Summarizes claims" },
      "agent-wizard",
    );

    const refreshed = createDemoWorkflowStore(
      "individual",
      dependencies("session-refresh"),
    );

    expect(refreshed.getState().skills.map((item) => item.name)).toEqual([
      "Document Summarization",
    ]);
    expect(refreshed.getState().agents.map((agent) => agent.name)).toContain(
      "Policy Guidance Assistant",
    );
    expect(refreshed.getState().events).toEqual([]);
  });

  it("does not mutate an approved revision when creating and editing R2", () => {
    const { store, agent, revision: approved } = publishFirstRevision();

    const draft = store.createAgentRevision(agent.id, "agent-wizard");
    store.updateAgentDraft(
      draft.id,
      revisionInput("Demo reasoning model v2"),
      "agent-wizard",
    );

    expect(
      store.getState().agentRevisions.find((item) => item.id === approved.id),
    ).toMatchObject({ revision: 1, model: "Demo reasoning model", status: "PUBLISHED" });
    expect(
      store.getState().agentRevisions.find((item) => item.id === draft.id),
    ).toMatchObject({ revision: 2, model: "Demo reasoning model v2", status: "DRAFT" });
  });

  it("keeps an existing Instance pinned when a new revision is published", () => {
    const { store, agent, revision } = publishFirstRevision();
    const instance = store.createInstance(
      {
        agentId: agent.id,
        revisionId: revision.id,
        name: "Claims North",
        team: "Claims",
        intendedUse: "Triage",
      },
      "end-user",
    );
    store.markInstanceReady(instance.id);

    const next = store.createAgentRevision(agent.id, "agent-wizard");
    store.updateAgentDraft(
      next.id,
      revisionInput("Demo reasoning model v2"),
      "agent-wizard",
    );
    store.markReadyForTechnicalValidation(next.id, "agent-wizard");
    store.startTechnicalValidation(next.id, "agent-wizard");
    store.completeTechnicalValidation(next.id, "PASSED");
    store.submitReleaseCandidate(next.id, "agent-wizard");
    store.startBusinessEvaluation(
      next.id,
      {
        businessPurpose: "Improve consistent claims handling.",
        targetUsers: "Claims specialists",
        criticality: "High",
        dataSensitivity: "Confidential customer data",
        successThreshold: 85,
        datasetId: "dataset-support-readiness",
        guardrailTemplates: [
          {
            id: "guardrail-template:default:R1",
            sourceGuardrailId: "guardrail-default",
            sourceGuardrailRevisionId: "guardrail-default:R1",
            version: "1",
            name: "Default Protection",
          },
        ],
        approvalReason: "Meets pilot expectations.",
      },
      "admin",
    );
    store.completeBusinessEvaluation(next.id, "PASSED");
    store.decideRevision(next.id, "APPROVED", "Approved update", "admin");

    expect(
      store.getState().instances.find((item) => item.id === instance.id)
        ?.revisionId,
    ).toBe(revision.id);
    expect(
      store.getState().agents.find((item) => item.id === agent.id)
        ?.currentApprovedRevisionId,
    ).toBe(next.id);
  });

  it("allows an Admin to approve a revision whose Business Eval failed", () => {
    const store = createDemoWorkflowStore("individual", dependencies("session-failed-approval"));
    const agent = store.createAgent(agentInput, "agent-wizard");
    const revision = store.getState().agentRevisions.find(
      (item) => item.agentId === agent.id,
    )!;
    store.markReadyForTechnicalValidation(revision.id, "agent-wizard");
    store.startTechnicalValidation(revision.id, "agent-wizard");
    store.completeTechnicalValidation(revision.id, "PASSED");
    store.submitReleaseCandidate(revision.id, "agent-wizard");
    store.startBusinessEvaluation(
      revision.id,
      {
        businessPurpose: "Review claims with human oversight.",
        targetUsers: "Claims specialists",
        criticality: "High",
        dataSensitivity: "Confidential customer data",
        successThreshold: 85,
        datasetId: "dataset-support-readiness",
        guardrailTemplates: [
          {
            id: "guardrail-template:default:R1",
            sourceGuardrailId: "guardrail-default",
            sourceGuardrailRevisionId: "guardrail-default:R1",
            version: "1",
            name: "Default Protection",
          },
        ],
        approvalReason: "Evidence requires an Admin decision.",
      },
      "admin",
    );

    store.completeBusinessEvaluation(revision.id, "FAILED");
    expect(
      store.getState().agentRevisions.find((item) => item.id === revision.id),
    ).toMatchObject({
      status: "PENDING_APPROVAL",
      businessEvaluation: { outcome: "FAILED" },
    });

    store.decideRevision(
      revision.id,
      "APPROVED",
      "Approved for a supervised pilot despite the failed Eval.",
      "admin",
    );
    expect(
      store.getState().agentRevisions.find((item) => item.id === revision.id),
    ).toMatchObject({
      status: "PUBLISHED",
      decisionReason: "Approved for a supervised pilot despite the failed Eval.",
    });
  });

  it("rejects lifecycle skips and persona violations", () => {
    const store = createDemoWorkflowStore("individual", dependencies("session-a"));
    const agent = store.createAgent(agentInput, "agent-wizard");
    const revision = store.getState().agentRevisions.find(
      (item) => item.agentId === agent.id,
    )!;

    expect(() =>
      store.submitReleaseCandidate(revision.id, "agent-wizard"),
    ).toThrow("Technical Validation must pass");
    expect(() =>
      store.decideRevision(revision.id, "APPROVED", "Skip", "admin"),
    ).toThrow("Business Eval must be ready for approval");
    expect(() =>
      store.createSkill(
        { name: "Unauthorized", description: "Not allowed" },
        "admin" as never,
      ),
    ).toThrow("Agent Wizard");
  });

  it("stops an Instance without deleting its history", () => {
    const { store, agent, revision } = publishFirstRevision();
    const instance = store.createInstance(
      {
        agentId: agent.id,
        revisionId: revision.id,
        name: "Claims North",
        team: "Claims",
        intendedUse: "Triage",
      },
      "end-user",
    );
    store.markInstanceReady(instance.id);
    store.stopInstance(instance.id, "end-user");
    store.markInstanceStopped(instance.id);

    expect(store.getState().instances).toEqual([
      expect.objectContaining({
        id: instance.id,
        revisionId: revision.id,
        status: "STOPPED",
      }),
    ]);
    expect(() => store.stopInstance(instance.id, "end-user")).toThrow(
      "already stopped",
    );
  });

  it("updates draft resources and blocks deletion while an Agent draft references them", () => {
    const store = createDemoWorkflowStore("individual", dependencies("session-a"));
    const mcp = store.createMcpServer(
      {
        name: "Customer Records MCP",
        endpoint: "https://demo.invalid/mcp/customer-records",
        authType: "bearer_token",
      },
      "agent-wizard",
    );
    store.updateMcpServer(
      mcp.id,
      { ...mcp, endpoint: "https://demo.invalid/mcp/customer-records-v2" },
      "agent-wizard",
    );
    store.createAgent(
      { ...agentInput, name: "Records Assistant", mcpIds: [mcp.id] },
      "agent-wizard",
    );

    expect(store.getState().mcpServers.find((item) => item.id === mcp.id)?.endpoint).toBe(
      "https://demo.invalid/mcp/customer-records-v2",
    );
    expect(() => store.deleteMcpServer(mcp.id, "agent-wizard")).toThrow(
      "referenced by an Agent draft",
    );
  });

  it("deletes an unreferenced session resource but never a fixture", () => {
    const store = createDemoWorkflowStore("individual", dependencies("session-a"));
    const skill = store.createSkill(
      { name: "Case Resolution", description: "Resolve cases" },
      "agent-wizard",
    );

    store.deleteSkill(skill.id, "agent-wizard");

    expect(store.getState().skills.filter((item) => item.source === "SESSION")).toEqual([]);
    expect(() =>
      store.deleteSkill("demo-document-summarization", "agent-wizard"),
    ).toThrow("Only session Skills");
    expect(() =>
      store.deleteAgentDraft("fixture-policy-guidance-r1", "agent-wizard"),
    ).toThrow("Session drafts");
  });
});
