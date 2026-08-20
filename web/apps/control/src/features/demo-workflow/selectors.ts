import type {
  DemoAgent,
  DemoAgentRevision,
  DemoInstanceStatus,
  DemoRevisionStatus,
  DemoWorkflowEvent,
  DemoWorkflowState,
} from "./model";

export interface AgentWizardBuildView {
  agentId: string;
  revisionId: string;
  revision: number;
  name: string;
  owner: string;
  status: DemoRevisionStatus;
  runtimeType: string;
  model: string;
  endpoint: string;
  mcpIds: string[];
  mcpNames: string[];
  skillIds: string[];
  skillNames: string[];
  knowledgeBaseIds: string[];
  knowledgeBaseNames: string[];
  basedOnRevisionId: string | null;
  technicalResult: DemoAgentRevision["technicalResult"];
  isActiveDraft: boolean;
  isCurrentApproved: boolean;
}

export interface AdminReleaseCandidateView {
  agentId: string;
  revisionKey: string;
  revision: number;
  name: string;
  owner: string;
  status: DemoRevisionStatus;
  businessPurpose: string;
  targetUsers: string;
  criticality: string;
  dataSensitivity: string;
  successThreshold: number;
  scenarioSuccess: number | null;
  scenariosCovered: number;
  residualRisk: string;
  approvalReason: string;
  guardrailCoverage: string;
}

export interface EndUserAgentCardView {
  agentId: string;
  name: string;
  description: string;
  businessOutcome: string;
  targetUsers: string;
  typicalScenarios: string[];
  owner: string;
  approved: true;
  availability: "Available";
  revisionNumber: number;
  businessEvalSummary: string;
}

export interface EndUserInstanceView {
  id: string;
  agentId: string;
  name: string;
  agentName: string;
  team: string;
  intendedUse: string;
  status: DemoInstanceStatus;
  versionLabel: string;
  updatedAt: string;
  canStop: boolean;
  canWork: boolean;
}

export interface AdminMonitorView {
  publishedAgents: number;
  activeInstances: number;
  stoppedInstances: number;
  adoption: number;
  taskSuccess: number;
  estimatedCost: number;
  businessFailures: number;
  guardrailIncidents: number;
  blockedScenarios: number;
  approvalCoverage: number;
  events: DemoWorkflowEvent[];
}

function agentFor(state: DemoWorkflowState, agentId: string): DemoAgent {
  const agent = state.agents.find((item) => item.id === agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  return agent;
}

export function selectAgentWizardBuilds(
  state: DemoWorkflowState,
): AgentWizardBuildView[] {
  return [...state.agentRevisions]
    .sort((left, right) =>
      left.agentId === right.agentId
        ? right.revision - left.revision
        : left.agentId.localeCompare(right.agentId),
    )
    .map((revision) => {
      const agent = agentFor(state, revision.agentId);
      return {
        agentId: agent.id,
        revisionId: revision.id,
        revision: revision.revision,
        name: agent.name,
        owner: agent.owner,
        status: revision.status,
        runtimeType: revision.runtimeType,
        model: revision.model,
        endpoint: revision.endpoint,
        mcpIds: [...revision.mcpIds],
        mcpNames: revision.mcpIds.flatMap((id) => {
          const resource = state.mcpServers.find((item) => item.id === id);
          return resource ? [resource.name] : [];
        }),
        skillIds: [...revision.skillIds],
        skillNames: revision.skillIds.flatMap((id) => {
          const resource = state.skills.find((item) => item.id === id);
          return resource ? [resource.name] : [];
        }),
        knowledgeBaseIds: [...revision.knowledgeBaseIds],
        knowledgeBaseNames: revision.knowledgeBaseIds.flatMap((id) => {
          const resource = state.knowledgeBases.find((item) => item.id === id);
          return resource ? [resource.name] : [];
        }),
        basedOnRevisionId: revision.basedOnRevisionId,
        technicalResult: revision.technicalResult,
        isActiveDraft: agent.activeDraftRevisionId === revision.id,
        isCurrentApproved: agent.currentApprovedRevisionId === revision.id,
      };
    });
}

const adminStatuses: DemoRevisionStatus[] = [
  "RELEASE_CANDIDATE",
  "PENDING_EVAL",
  "BUSINESS_EVALUATING",
  "BUSINESS_EVAL_FAILED",
  "READY_FOR_APPROVAL",
  "PENDING_APPROVAL",
  "REJECTED",
  "APPROVED",
  "PUBLISHED",
];

export function selectAdminReleaseCandidates(
  state: DemoWorkflowState,
): AdminReleaseCandidateView[] {
  return state.agentRevisions
    .filter((revision) => adminStatuses.includes(revision.status))
    .map((revision) => {
      const agent = agentFor(state, revision.agentId);
      const evaluation = revision.businessEvaluation;
      return {
        agentId: agent.id,
        revisionKey: revision.id,
        revision: revision.revision,
        name: agent.name,
        owner: agent.owner,
        status: revision.status,
        businessPurpose: evaluation?.businessPurpose ?? agent.businessOutcome,
        targetUsers: evaluation?.targetUsers ?? agent.targetUsers,
        criticality: evaluation?.criticality ?? "Not assessed",
        dataSensitivity: evaluation?.dataSensitivity ?? "Not assessed",
        successThreshold: evaluation?.successThreshold ?? 85,
        scenarioSuccess: evaluation?.scenarioSuccess ?? null,
        scenariosCovered: evaluation?.scenariosCovered ?? 0,
        residualRisk: evaluation?.residualRisk ?? "Pending",
        approvalReason: evaluation?.approvalReason ?? "Pending business review",
        guardrailCoverage: evaluation?.guardrailTemplates.length
          ? `${evaluation.scenariosCovered || 8} safety scenarios covered`
          : "Guardrail coverage pending",
      };
    })
    .sort((left, right) => right.revision - left.revision);
}

export function selectEndUserGarden(
  state: DemoWorkflowState,
): EndUserAgentCardView[] {
  return state.agents.flatMap((agent) => {
    if (!agent.currentApprovedRevisionId) return [];
    const revision = state.agentRevisions.find(
      (item) => item.id === agent.currentApprovedRevisionId,
    );
    if (!revision || revision.status !== "PUBLISHED") return [];
    return [
      {
        agentId: agent.id,
        name: agent.name,
        description: agent.description,
        businessOutcome: agent.businessOutcome,
        targetUsers: agent.targetUsers,
        typicalScenarios: [...agent.typicalScenarios],
        owner: agent.owner,
        approved: true as const,
        availability: "Available" as const,
        revisionNumber: revision.revision,
        businessEvalSummary: revision.businessEvaluation?.scenarioSuccess
          ? `${revision.businessEvaluation.scenarioSuccess}% scenario success · Low residual risk`
          : "Approved for business use",
      },
    ];
  });
}

export function selectEndUserInstances(
  state: DemoWorkflowState,
): EndUserInstanceView[] {
  return [...state.instances]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((instance) => {
      const agent = agentFor(state, instance.agentId);
      const revision = state.agentRevisions.find(
        (item) => item.id === instance.revisionId,
      );
      return {
        id: instance.id,
        agentId: instance.agentId,
        name: instance.name,
        agentName: agent.name,
        team: instance.team,
        intendedUse: instance.intendedUse,
        status: instance.status,
        versionLabel: `Stable version ${revision?.revision ?? 1}`,
        updatedAt: instance.updatedAt,
        canStop: instance.status === "READY",
        canWork: instance.status === "READY",
      };
    });
}

export function selectAdminMonitor(
  state: DemoWorkflowState,
): AdminMonitorView {
  const publishedAgents = selectEndUserGarden(state).length;
  const activeInstances = state.instances.filter((item) =>
    ["PROVISIONING", "READY", "STOPPING"].includes(item.status),
  ).length;
  const stoppedInstances = state.instances.filter(
    (item) => item.status === "STOPPED",
  ).length;
  const evaluations = state.agentRevisions.flatMap((revision) =>
    revision.businessEvaluation ? [revision.businessEvaluation] : [],
  );
  const businessFailures = evaluations.filter(
    (evaluation) => evaluation.outcome === "FAILED",
  ).length;
  const events = state.events.filter(
    (event) => event.audience === "BUSINESS" || event.audience === "BOTH",
  );
  return {
    publishedAgents,
    activeInstances,
    stoppedInstances,
    adoption: state.instances.length,
    taskSuccess: publishedAgents ? 92 : 0,
    estimatedCost: Number(
      evaluations
        .reduce((total, evaluation) => total + evaluation.estimatedCost, 0)
        .toFixed(2),
    ),
    businessFailures,
    guardrailIncidents: events.filter((event) =>
      event.action.includes("guardrail-incident"),
    ).length,
    blockedScenarios: events.filter((event) =>
      event.action.includes("blocked"),
    ).length,
    approvalCoverage: publishedAgents
      ? Math.round(
          (state.agentRevisions.filter(
            (revision) => revision.status === "PUBLISHED",
          ).length /
            publishedAgents) *
            100,
        )
      : 0,
    events,
  };
}
