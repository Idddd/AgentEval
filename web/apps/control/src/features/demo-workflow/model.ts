import type { DemoPersona } from "@/hooks/use-demo-role";

export type DemoSource = "FIXTURE" | "SESSION";
export type DemoRevisionStatus =
  | "DRAFT"
  | "READY_FOR_VALIDATION"
  | "VALIDATING"
  | "VALIDATION_FAILED"
  | "VALIDATED"
  | "RELEASE_CANDIDATE"
  | "PENDING_EVAL"
  | "BUSINESS_EVALUATING"
  | "BUSINESS_EVAL_FAILED"
  | "READY_FOR_APPROVAL"
  | "PENDING_APPROVAL"
  | "REJECTED"
  | "APPROVED"
  | "PUBLISHED";

export interface DemoEntityBase {
  id: string;
  demoSessionId: string;
  projectId: string;
  source: DemoSource;
  createdByPersona: DemoPersona;
  createdAt: string;
  updatedAt: string;
}

export interface DemoMcpInput {
  name: string;
  endpoint: string;
  authType: "none" | "bearer_token" | "api_key";
}

export interface DemoSkillInput {
  name: string;
  description: string;
}

export interface DemoKnowledgeBaseInput {
  name: string;
  sourceType: string;
  description: string;
}

export interface DemoAgentInput {
  name: string;
  owner: string;
  description: string;
  businessOutcome: string;
  targetUsers: string;
  typicalScenarios: string[];
  runtimeType: string;
  model: string;
  endpoint: string;
  mcpIds: string[];
  skillIds: string[];
  knowledgeBaseIds: string[];
}

export interface DemoAgentRevisionInput {
  runtimeType: string;
  model: string;
  endpoint: string;
  mcpIds: string[];
  skillIds: string[];
  knowledgeBaseIds: string[];
}

export interface DemoMcpServer extends DemoEntityBase, DemoMcpInput {}
export interface DemoSkill extends DemoEntityBase, DemoSkillInput {}
export interface DemoKnowledgeBase
  extends DemoEntityBase,
    DemoKnowledgeBaseInput {}

export interface DemoAgent extends DemoEntityBase {
  name: string;
  owner: string;
  description: string;
  businessOutcome: string;
  targetUsers: string;
  typicalScenarios: string[];
  currentApprovedRevisionId: string | null;
  activeDraftRevisionId: string | null;
}

export interface DemoTechnicalCheck {
  id: string;
  label: string;
  status: "PASSED" | "FAILED";
  detail: string;
}

export interface DemoTechnicalResult {
  outcome: "PASSED" | "FAILED";
  checks: DemoTechnicalCheck[];
  completedAt: string;
}

export interface DemoGuardrailTemplateSnapshot {
  id: string;
  sourceGuardrailId: string;
  sourceGuardrailRevisionId: string;
  version: string;
  name: string;
}

export interface DemoBusinessEvaluationInput {
  businessPurpose: string;
  targetUsers: string;
  criticality: string;
  dataSensitivity: string;
  successThreshold: number;
  datasetId: string;
  guardrailTemplates: DemoGuardrailTemplateSnapshot[];
  approvalReason: string;
}

export interface DemoBusinessEvaluation
  extends DemoBusinessEvaluationInput {
  outcome: "RUNNING" | "PASSED" | "FAILED";
  scenarioSuccess: number | null;
  scenariosCovered: number;
  residualRisk: "Low" | "Medium" | "High" | null;
  estimatedCost: number;
  completedAt: string | null;
}

export interface DemoAgentRevision extends DemoEntityBase {
  agentId: string;
  revision: number;
  basedOnRevisionId: string | null;
  status: DemoRevisionStatus;
  runtimeType: string;
  model: string;
  endpoint: string;
  mcpIds: string[];
  skillIds: string[];
  knowledgeBaseIds: string[];
  technicalResult: DemoTechnicalResult | null;
  businessEvaluation: DemoBusinessEvaluation | null;
  decisionReason: string | null;
}

export interface DemoDataset extends DemoEntityBase {
  name: string;
  description: string;
  scenarioCount: number;
}

export type DemoInstanceStatus =
  | "PROVISIONING"
  | "READY"
  | "STOPPING"
  | "STOPPED";

export interface DemoInstanceInput {
  agentId: string;
  revisionId: string;
  name: string;
  team: string;
  intendedUse: string;
}

export interface DemoInstance extends DemoEntityBase, DemoInstanceInput {
  status: DemoInstanceStatus;
  readyAt: string | null;
  stoppedAt: string | null;
}

export interface DemoWorkflowEvent extends DemoEntityBase {
  entityType:
    | "agent"
    | "revision"
    | "mcp"
    | "skill"
    | "knowledge-base"
    | "evaluation"
    | "approval"
    | "instance";
  entityId: string;
  action: string;
  outcome: string;
  audience: "TECHNICAL" | "BUSINESS" | "BOTH";
  label: string;
  metadata: Record<string, string | number | boolean>;
}

export interface DemoWorkflowState {
  demoSessionId: string;
  projectId: string;
  agents: DemoAgent[];
  agentRevisions: DemoAgentRevision[];
  mcpServers: DemoMcpServer[];
  skills: DemoSkill[];
  knowledgeBases: DemoKnowledgeBase[];
  datasets: DemoDataset[];
  instances: DemoInstance[];
  events: DemoWorkflowEvent[];
}

export interface DemoWorkflowDependencies {
  id(): string;
  now(): string;
  sessionId(): string;
}

export interface DemoWorkflowScheduler {
  schedule(
    callback: () => void,
    delayMs: number,
  ): ReturnType<typeof setTimeout>;
  clear(handle: ReturnType<typeof setTimeout>): void;
}

export interface DemoWorkflowActions {
  runTechnicalValidation(revisionId: string): void;
  runBusinessEvaluation(
    revisionId: string,
    input: DemoBusinessEvaluationInput,
  ): void;
  provisionInstance(input: DemoInstanceInput): DemoInstance;
  stopInstance(instanceId: string): void;
  dispose(): void;
}

export interface DemoWorkflowStore {
  getState(): DemoWorkflowState;
  subscribe(listener: () => void): () => void;
  createMcpServer(input: DemoMcpInput, persona: "agent-wizard"): DemoMcpServer;
  createSkill(input: DemoSkillInput, persona: "agent-wizard"): DemoSkill;
  createKnowledgeBase(
    input: DemoKnowledgeBaseInput,
    persona: "agent-wizard",
  ): DemoKnowledgeBase;
  createAgent(input: DemoAgentInput, persona: "agent-wizard"): DemoAgent;
  createAgentRevision(
    agentId: string,
    persona: "agent-wizard",
  ): DemoAgentRevision;
  updateAgentDraft(
    revisionId: string,
    input: DemoAgentRevisionInput,
    persona: "agent-wizard",
  ): DemoAgentRevision;
  markReadyForTechnicalValidation(
    revisionId: string,
    persona: "agent-wizard",
  ): void;
  startTechnicalValidation(
    revisionId: string,
    persona: "agent-wizard",
  ): void;
  completeTechnicalValidation(
    revisionId: string,
    outcome: "PASSED" | "FAILED",
  ): void;
  submitReleaseCandidate(
    revisionId: string,
    persona: "agent-wizard",
  ): void;
  startBusinessEvaluation(
    revisionId: string,
    input: DemoBusinessEvaluationInput,
    persona: "admin",
  ): void;
  completeBusinessEvaluation(
    revisionId: string,
    outcome: "PASSED" | "FAILED",
  ): void;
  retryBusinessEvaluation(revisionId: string, persona: "admin"): void;
  decideRevision(
    revisionId: string,
    decision: "APPROVED" | "REJECTED",
    reason: string,
    persona: "admin",
  ): void;
  createInstance(input: DemoInstanceInput, persona: "end-user"): DemoInstance;
  markInstanceReady(instanceId: string): void;
  stopInstance(instanceId: string, persona: "end-user"): void;
  markInstanceStopped(instanceId: string): void;
}
