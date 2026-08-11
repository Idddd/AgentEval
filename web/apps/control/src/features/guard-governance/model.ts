export type GuardrailStatus = "READY" | "NEEDS_TESTING" | "DISABLED";
export type GuardrailRisk =
  | "prompt_injection"
  | "pii"
  | "secrets"
  | "content_safety"
  | "topic_control"
  | "company_policy";
export type GuardrailAction =
  | "reject"
  | "redact"
  | "rewrite"
  | "redirect";
export type GuardrailDecision = "ALLOW" | "BLOCK" | "REDACT" | "TRANSFORM";
export type GuardrailSafetyLevel = "standard" | "strict" | "maximum";
export type GuardrailOutputDelivery =
  | "interruptible"
  | "windowed"
  | "full_buffered";
export type EvidenceOutcome = GuardrailDecision | "ERROR";
export type IntegrationProtocol = "litellm" | "http" | "a2a";
export type IntegrationEnvironment =
  | "production"
  | "staging"
  | "development"
  | "test";
export type TrafficScopeField =
  | "environment"
  | "model"
  | "provider"
  | "route"
  | "tag";
export type TrafficScopeOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "starts_with";

export type GuardrailControl = {
  risk: GuardrailRisk;
  action: GuardrailAction;
  enabled: boolean;
};

export type GuardrailTestCase = {
  id: string;
  name: string;
  content: string;
  phase: "input" | "output";
  risk: GuardrailRisk;
  expectedDecision: GuardrailDecision;
  actualDecision: GuardrailDecision;
};

export type GuardrailTestRun = {
  id: string;
  guardrailId: string;
  status: "PASSED" | "FAILED";
  createdAt: string;
  caseResults: Array<{
    testCaseId: string;
    passed: boolean;
    expectedDecision: GuardrailDecision;
    actualDecision: GuardrailDecision;
  }>;
};

export type Guardrail = {
  id: string;
  projectId: string;
  name: string;
  purpose: string;
  status: GuardrailStatus;
  safetyLevel: GuardrailSafetyLevel;
  outputDelivery: GuardrailOutputDelivery;
  allowedTopics: string[];
  restrictedTopics: string[];
  controls: GuardrailControl[];
  testCases: GuardrailTestCase[];
  latestTestRun?: GuardrailTestRun;
  updatedAt: string;
};

export type TrafficScopeRule = {
  field: TrafficScopeField;
  operator: TrafficScopeOperator;
  value: string;
};

export type TrafficScopeExpression = {
  combinator: "and" | "or";
  rules: TrafficScopeRule[];
};

export type GuardrailAssignment = {
  id: string;
  projectId: string;
  name: string;
  guardrailId: string;
  priority: number;
  enabled: boolean;
  trafficScope: TrafficScopeExpression;
  updatedAt: string;
};

export type GuardIntegration = {
  id: string;
  projectId: string;
  name: string;
  protocol: IntegrationProtocol;
  environment: IntegrationEnvironment;
  enabled: boolean;
  health: "HEALTHY" | "DEGRADED" | "DISABLED";
  credentialHint: string;
  updatedAt: string;
};

export type EvidenceTraceStep = {
  id: string;
  stage: string;
  detail: string;
  durationMs: number;
};

export type EvidenceEvent = {
  id: string;
  projectId: string;
  guardrailId: string;
  assignmentId?: string;
  testRunId?: string;
  risk: GuardrailRisk;
  outcome: EvidenceOutcome;
  input: string;
  output: string;
  matchedControls: string[];
  stage: string;
  reason: string;
  durationMs: number;
  trace: EvidenceTraceStep[];
  createdAt: string;
};

export type GuardGovernanceState = {
  projectId: string;
  guardrails: Guardrail[];
  assignments: GuardrailAssignment[];
  integrations: GuardIntegration[];
  evidence: EvidenceEvent[];
};

export type EffectiveEnforcement = {
  assignmentId: string;
  assignmentName: string;
  guardrailId: string;
  guardrailName: string;
  priority: number;
  trafficScope: TrafficScopeExpression;
  actions: GuardrailAction[];
};

export type EvidenceFilters = {
  guardrailId?: string;
  assignmentId?: string;
  outcome?: EvidenceOutcome;
  risk?: GuardrailRisk;
};

export type CreateGuardrailInput = Pick<
  Guardrail,
  | "name"
  | "purpose"
  | "safetyLevel"
  | "outputDelivery"
  | "allowedTopics"
  | "restrictedTopics"
  | "controls"
>;

export type CreateAssignmentInput = Pick<
  GuardrailAssignment,
  "name" | "guardrailId" | "priority" | "enabled" | "trafficScope"
>;

export type RegisterIntegrationInput = Pick<
  GuardIntegration,
  "name" | "protocol" | "environment"
>;
