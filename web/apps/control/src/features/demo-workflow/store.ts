import { cloneDemoWorkflowFixtures } from "./fixtures";
import type {
  DemoAgent,
  DemoAgentInput,
  DemoAgentRevision,
  DemoAgentRevisionInput,
  DemoBusinessEvaluationInput,
  DemoEntityBase,
  DemoInstance,
  DemoInstanceInput,
  DemoKnowledgeBase,
  DemoKnowledgeBaseInput,
  DemoMcpInput,
  DemoMcpServer,
  DemoRevisionStatus,
  DemoSkill,
  DemoSkillInput,
  DemoWorkflowDependencies,
  DemoWorkflowEvent,
  DemoWorkflowState,
  DemoWorkflowStore,
} from "./model";

function defaultId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

const defaultDependencies: DemoWorkflowDependencies = {
  id: defaultId,
  now: () => new Date().toISOString(),
  sessionId: defaultId,
};

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function assertPersona(actual: string, expected: string, label: string) {
  if (actual !== expected) throw new Error(`${label} requires ${expected === "agent-wizard" ? "Agent Wizard" : expected}`);
}

export function createDemoWorkflowStore(
  projectId: string,
  dependencies: DemoWorkflowDependencies = defaultDependencies,
): DemoWorkflowStore {
  const demoSessionId = dependencies.sessionId();
  let state = cloneDemoWorkflowFixtures(projectId, demoSessionId);
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((listener) => listener());
  const replace = (next: DemoWorkflowState) => {
    state = next;
    emit();
  };
  const base = (persona: DemoEntityBase["createdByPersona"]): DemoEntityBase => {
    const now = dependencies.now();
    return {
      id: dependencies.id(),
      demoSessionId,
      projectId,
      source: "SESSION",
      createdByPersona: persona,
      createdAt: now,
      updatedAt: now,
    };
  };
  const uniqueName = (items: Array<{ name: string }>, name: string) => {
    const normalized = required(name, "Name");
    if (items.some((item) => item.name.toLowerCase() === normalized.toLowerCase())) {
      throw new Error(`A session resource named ${normalized} already exists`);
    }
    return normalized;
  };
  const findRevision = (revisionId: string) => {
    const revision = state.agentRevisions.find((item) => item.id === revisionId);
    if (!revision) throw new Error("Agent revision not found");
    return revision;
  };
  const findAgent = (agentId: string) => {
    const agent = state.agents.find((item) => item.id === agentId);
    if (!agent) throw new Error("Agent not found");
    return agent;
  };
  const updateRevision = (
    revisionId: string,
    update: (revision: DemoAgentRevision) => DemoAgentRevision,
  ) => {
    let changed: DemoAgentRevision | undefined;
    replace({
      ...state,
      agentRevisions: state.agentRevisions.map((revision) => {
        if (revision.id !== revisionId) return revision;
        changed = update(revision);
        return changed;
      }),
    });
    if (!changed) throw new Error("Agent revision not found");
    return changed;
  };
  const addEvent = (
    persona: DemoEntityBase["createdByPersona"],
    input: Omit<DemoWorkflowEvent, keyof DemoEntityBase>,
  ) => {
    const event: DemoWorkflowEvent = { ...base(persona), ...input };
    replace({ ...state, events: [...state.events, event] });
  };

  const store: DemoWorkflowStore = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    createMcpServer(input, persona) {
      assertPersona(persona, "agent-wizard", "Create MCP Server");
      const created: DemoMcpServer = {
        ...base(persona),
        name: uniqueName(state.mcpServers, input.name),
        endpoint: required(input.endpoint, "Endpoint"),
        authType: input.authType,
      };
      replace({ ...state, mcpServers: [...state.mcpServers, created] });
      addEvent(persona, { entityType: "mcp", entityId: created.id, action: "created", outcome: "SESSION", audience: "TECHNICAL", label: `${created.name} created`, metadata: {} });
      return created;
    },
    createSkill(input, persona) {
      assertPersona(persona, "agent-wizard", "Create Skill");
      const created: DemoSkill = {
        ...base(persona),
        name: uniqueName(state.skills, input.name),
        description: required(input.description, "Description"),
      };
      replace({ ...state, skills: [...state.skills, created] });
      addEvent(persona, { entityType: "skill", entityId: created.id, action: "created", outcome: "SESSION", audience: "TECHNICAL", label: `${created.name} created`, metadata: {} });
      return created;
    },
    createKnowledgeBase(input, persona) {
      assertPersona(persona, "agent-wizard", "Create Knowledge Base");
      const created: DemoKnowledgeBase = {
        ...base(persona),
        name: uniqueName(state.knowledgeBases, input.name),
        sourceType: required(input.sourceType, "Source type"),
        description: required(input.description, "Description"),
      };
      replace({ ...state, knowledgeBases: [...state.knowledgeBases, created] });
      addEvent(persona, { entityType: "knowledge-base", entityId: created.id, action: "created", outcome: "SESSION", audience: "TECHNICAL", label: `${created.name} created`, metadata: {} });
      return created;
    },
    createAgent(input, persona) {
      assertPersona(persona, "agent-wizard", "Create Agent");
      const agentBase = base(persona);
      const revisionBase = base(persona);
      const revision: DemoAgentRevision = {
        ...revisionBase,
        agentId: agentBase.id,
        revision: 1,
        basedOnRevisionId: null,
        status: "DRAFT",
        runtimeType: required(input.runtimeType, "Runtime type"),
        model: required(input.model, "Model"),
        endpoint: required(input.endpoint, "Endpoint"),
        mcpIds: [...input.mcpIds],
        skillIds: [...input.skillIds],
        knowledgeBaseIds: [...input.knowledgeBaseIds],
        technicalResult: null,
        businessEvaluation: null,
        decisionReason: null,
      };
      const agent: DemoAgent = {
        ...agentBase,
        name: uniqueName(state.agents, input.name),
        owner: required(input.owner, "Owner"),
        description: required(input.description, "Description"),
        businessOutcome: required(input.businessOutcome, "Business outcome"),
        targetUsers: required(input.targetUsers, "Target users"),
        typicalScenarios: input.typicalScenarios.map((item) => item.trim()).filter(Boolean),
        currentApprovedRevisionId: null,
        activeDraftRevisionId: revision.id,
      };
      replace({
        ...state,
        agents: [...state.agents, agent],
        agentRevisions: [...state.agentRevisions, revision],
      });
      addEvent(persona, { entityType: "agent", entityId: agent.id, action: "built", outcome: "DRAFT", audience: "TECHNICAL", label: `${agent.name} R1 draft created`, metadata: { revision: 1 } });
      return agent;
    },
    createAgentRevision(agentId, persona) {
      assertPersona(persona, "agent-wizard", "Create Agent revision");
      const agent = findAgent(agentId);
      if (agent.activeDraftRevisionId) throw new Error("This Agent already has an active draft revision");
      const approved = agent.currentApprovedRevisionId
        ? findRevision(agent.currentApprovedRevisionId)
        : undefined;
      if (!approved) throw new Error("An approved revision is required before creating a new revision");
      const created: DemoAgentRevision = {
        ...base(persona),
        agentId,
        revision: Math.max(...state.agentRevisions.filter((item) => item.agentId === agentId).map((item) => item.revision)) + 1,
        basedOnRevisionId: approved.id,
        status: "DRAFT",
        runtimeType: approved.runtimeType,
        model: approved.model,
        endpoint: approved.endpoint,
        mcpIds: [...approved.mcpIds],
        skillIds: [...approved.skillIds],
        knowledgeBaseIds: [...approved.knowledgeBaseIds],
        technicalResult: null,
        businessEvaluation: null,
        decisionReason: null,
      };
      replace({
        ...state,
        agentRevisions: [...state.agentRevisions, created],
        agents: state.agents.map((item) => item.id === agentId ? { ...item, activeDraftRevisionId: created.id, updatedAt: created.updatedAt } : item),
      });
      addEvent(persona, { entityType: "revision", entityId: created.id, action: "created", outcome: "DRAFT", audience: "TECHNICAL", label: `${agent.name} R${created.revision} draft created`, metadata: { revision: created.revision } });
      return created;
    },
    updateAgentDraft(revisionId, input, persona) {
      assertPersona(persona, "agent-wizard", "Edit Agent draft");
      const current = findRevision(revisionId);
      if (["PUBLISHED", "APPROVED", "REJECTED"].includes(current.status)) {
        throw new Error("Approved or rejected revisions cannot be edited");
      }
      const updatedAt = dependencies.now();
      const nextStatus: DemoRevisionStatus = current.status === "DRAFT" ? "DRAFT" : "READY_FOR_VALIDATION";
      const updated = updateRevision(revisionId, (revision) => ({
        ...revision,
        runtimeType: required(input.runtimeType, "Runtime type"),
        model: required(input.model, "Model"),
        endpoint: required(input.endpoint, "Endpoint"),
        mcpIds: [...input.mcpIds],
        skillIds: [...input.skillIds],
        knowledgeBaseIds: [...input.knowledgeBaseIds],
        status: nextStatus,
        technicalResult: null,
        businessEvaluation: null,
        decisionReason: null,
        updatedAt,
      }));
      addEvent(persona, { entityType: "revision", entityId: revisionId, action: "updated", outcome: nextStatus, audience: "TECHNICAL", label: `R${updated.revision} draft updated`, metadata: { revision: updated.revision } });
      return updated;
    },
    markReadyForTechnicalValidation(revisionId, persona) {
      assertPersona(persona, "agent-wizard", "Prepare Technical Validation");
      const current = findRevision(revisionId);
      if (!["DRAFT", "VALIDATION_FAILED"].includes(current.status)) {
        throw new Error("Only a draft or failed validation can be prepared");
      }
      updateRevision(revisionId, (revision) => ({ ...revision, status: "READY_FOR_VALIDATION", updatedAt: dependencies.now() }));
    },
    startTechnicalValidation(revisionId, persona) {
      assertPersona(persona, "agent-wizard", "Technical Validation");
      const current = findRevision(revisionId);
      if (current.status !== "READY_FOR_VALIDATION") throw new Error("Revision is not ready for Technical Validation");
      updateRevision(revisionId, (revision) => ({ ...revision, status: "VALIDATING", updatedAt: dependencies.now() }));
      addEvent(persona, { entityType: "revision", entityId: revisionId, action: "technical-validation-started", outcome: "VALIDATING", audience: "TECHNICAL", label: `R${current.revision} Technical Validation started`, metadata: { revision: current.revision } });
    },
    completeTechnicalValidation(revisionId, outcome) {
      const current = findRevision(revisionId);
      if (current.status !== "VALIDATING") throw new Error("Technical Validation is not running");
      const completedAt = dependencies.now();
      const checks = [
        { id: "configuration", label: "Configuration completeness", status: outcome, detail: outcome === "PASSED" ? "Required technical configuration is complete." : "Required configuration is incomplete." },
        { id: "dependencies", label: "Dependency resolution", status: outcome, detail: outcome === "PASSED" ? "Dependency resolution passed." : "A configured dependency could not be resolved." },
        { id: "schema", label: "Schema compatibility", status: outcome, detail: outcome === "PASSED" ? "Demo schemas are compatible." : "A demo schema is incompatible." },
        { id: "endpoint", label: "Endpoint format", status: outcome, detail: outcome === "PASSED" ? "Endpoint format is valid." : "Endpoint format is invalid." },
      ] as const;
      updateRevision(revisionId, (revision) => ({
        ...revision,
        status: outcome === "PASSED" ? "VALIDATED" : "VALIDATION_FAILED",
        technicalResult: { outcome, completedAt, checks: checks.map((item) => ({ ...item })) },
        updatedAt: completedAt,
      }));
      addEvent("agent-wizard", { entityType: "revision", entityId: revisionId, action: "technical-validation-completed", outcome, audience: "TECHNICAL", label: `R${current.revision} Technical Validation ${outcome.toLowerCase()}`, metadata: { revision: current.revision } });
    },
    submitReleaseCandidate(revisionId, persona) {
      assertPersona(persona, "agent-wizard", "Submit Release Candidate");
      const current = findRevision(revisionId);
      if (current.status !== "VALIDATED") throw new Error("Technical Validation must pass before submission");
      updateRevision(revisionId, (revision) => ({ ...revision, status: "PENDING_EVAL", updatedAt: dependencies.now() }));
      addEvent(persona, { entityType: "revision", entityId: revisionId, action: "release-candidate-submitted", outcome: "PENDING_EVAL", audience: "BOTH", label: `R${current.revision} submitted for Business Eval`, metadata: { revision: current.revision } });
    },
    startBusinessEvaluation(revisionId, input, persona) {
      assertPersona(persona, "admin", "Business Eval");
      const current = findRevision(revisionId);
      if (current.status !== "PENDING_EVAL") throw new Error("Release Candidate is not pending Business Eval");
      if (!state.datasets.some((dataset) => dataset.id === input.datasetId)) throw new Error("Select a valid Business Dataset");
      if (!input.guardrailTemplates.length) throw new Error("Select at least one Guardrail Eval Template");
      updateRevision(revisionId, (revision) => ({
        ...revision,
        status: "BUSINESS_EVALUATING",
        businessEvaluation: {
          ...structuredClone(input),
          outcome: "RUNNING",
          scenarioSuccess: null,
          scenariosCovered: 0,
          residualRisk: null,
          estimatedCost: 0.04,
          completedAt: null,
        },
        updatedAt: dependencies.now(),
      }));
      addEvent(persona, { entityType: "evaluation", entityId: revisionId, action: "business-eval-started", outcome: "RUNNING", audience: "BUSINESS", label: `R${current.revision} Business Eval started`, metadata: { revision: current.revision } });
    },
    completeBusinessEvaluation(revisionId, outcome) {
      const current = findRevision(revisionId);
      if (current.status !== "BUSINESS_EVALUATING" || !current.businessEvaluation) throw new Error("Business Eval is not running");
      const completedAt = dependencies.now();
      updateRevision(revisionId, (revision) => ({
        ...revision,
        status: outcome === "PASSED" ? "PENDING_APPROVAL" : "BUSINESS_EVAL_FAILED",
        businessEvaluation: {
          ...revision.businessEvaluation!,
          outcome,
          scenarioSuccess: outcome === "PASSED" ? 92 : 68,
          scenariosCovered: 8,
          residualRisk: outcome === "PASSED" ? "Low" : "High",
          completedAt,
        },
        updatedAt: completedAt,
      }));
      addEvent("admin", { entityType: "evaluation", entityId: revisionId, action: "business-eval-completed", outcome, audience: "BUSINESS", label: `R${current.revision} Business Eval ${outcome.toLowerCase()}`, metadata: { revision: current.revision, scenarioSuccess: outcome === "PASSED" ? 92 : 68 } });
    },
    retryBusinessEvaluation(revisionId, persona) {
      assertPersona(persona, "admin", "Retry Business Eval");
      const current = findRevision(revisionId);
      if (current.status !== "BUSINESS_EVAL_FAILED") throw new Error("Only a failed Business Eval can be retried");
      updateRevision(revisionId, (revision) => ({ ...revision, status: "PENDING_EVAL", businessEvaluation: null, updatedAt: dependencies.now() }));
    },
    decideRevision(revisionId, decision, reason, persona) {
      assertPersona(persona, "admin", "Approval");
      const current = findRevision(revisionId);
      if (current.status !== "PENDING_APPROVAL") throw new Error("Business Eval must be ready for approval");
      const decisionReason = required(reason, "Decision reason");
      const updatedAt = dependencies.now();
      const finalStatus = decision === "APPROVED" ? "PUBLISHED" : "REJECTED";
      updateRevision(revisionId, (revision) => ({ ...revision, status: finalStatus, decisionReason, updatedAt }));
      replace({
        ...state,
        agents: state.agents.map((agent) => agent.id === current.agentId ? {
          ...agent,
          currentApprovedRevisionId: decision === "APPROVED" ? revisionId : agent.currentApprovedRevisionId,
          activeDraftRevisionId: null,
          updatedAt,
        } : agent),
      });
      addEvent(persona, { entityType: "approval", entityId: revisionId, action: decision === "APPROVED" ? "approved-and-published" : "rejected", outcome: finalStatus, audience: "BOTH", label: `R${current.revision} ${decision === "APPROVED" ? "approved and published" : "rejected"}`, metadata: { revision: current.revision } });
    },
    createInstance(input, persona) {
      assertPersona(persona, "end-user", "Apply Instance");
      const agent = findAgent(input.agentId);
      const revision = findRevision(input.revisionId);
      if (revision.status !== "PUBLISHED" || agent.currentApprovedRevisionId !== revision.id) throw new Error("Instances can only use the latest published revision");
      const created: DemoInstance = {
        ...base(persona),
        ...input,
        name: uniqueName(state.instances, input.name),
        team: required(input.team, "Team"),
        intendedUse: required(input.intendedUse, "Intended use"),
        status: "PROVISIONING",
        readyAt: null,
        stoppedAt: null,
      };
      replace({ ...state, instances: [...state.instances, created] });
      addEvent(persona, { entityType: "instance", entityId: created.id, action: "provisioning-started", outcome: "PROVISIONING", audience: "BUSINESS", label: `${created.name} provisioning started`, metadata: { agentId: agent.id, revision: revision.revision } });
      return created;
    },
    markInstanceReady(instanceId) {
      const current = state.instances.find((item) => item.id === instanceId);
      if (!current || current.status !== "PROVISIONING") throw new Error("Instance is not provisioning");
      const readyAt = dependencies.now();
      replace({ ...state, instances: state.instances.map((item) => item.id === instanceId ? { ...item, status: "READY", readyAt, updatedAt: readyAt } : item) });
      addEvent("end-user", { entityType: "instance", entityId: instanceId, action: "ready", outcome: "READY", audience: "BUSINESS", label: `${current.name} is ready`, metadata: {} });
    },
    stopInstance(instanceId, persona) {
      assertPersona(persona, "end-user", "Stop Instance");
      const current = state.instances.find((item) => item.id === instanceId);
      if (!current) throw new Error("Instance not found");
      if (current.status === "STOPPED") throw new Error("Instance is already stopped");
      if (current.status !== "READY") throw new Error("Only a ready Instance can be stopped");
      replace({ ...state, instances: state.instances.map((item) => item.id === instanceId ? { ...item, status: "STOPPING", updatedAt: dependencies.now() } : item) });
      addEvent(persona, { entityType: "instance", entityId: instanceId, action: "stopping", outcome: "STOPPING", audience: "BUSINESS", label: `${current.name} is stopping`, metadata: {} });
    },
    markInstanceStopped(instanceId) {
      const current = state.instances.find((item) => item.id === instanceId);
      if (!current || current.status !== "STOPPING") throw new Error("Instance is not stopping");
      const stoppedAt = dependencies.now();
      replace({ ...state, instances: state.instances.map((item) => item.id === instanceId ? { ...item, status: "STOPPED", stoppedAt, updatedAt: stoppedAt } : item) });
      addEvent("end-user", { entityType: "instance", entityId: instanceId, action: "stopped", outcome: "STOPPED", audience: "BUSINESS", label: `${current.name} stopped`, metadata: {} });
    },
  };
  return store;
}
