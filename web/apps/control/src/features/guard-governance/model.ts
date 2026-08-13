export type GuardrailStatus = "READY" | "NEEDS_TESTING" | "PROTECTED" | "DISABLED";
export type GuardrailRisk =
  | "builtin_content_filter"
  | "prompt_injection"
  | "jailbreak"
  | "pii"
  | "secrets"
  | "content_safety"
  | "topic_control"
  | "company_policy"
  | "contextual_grounding"
  | "automated_reasoning";
export type GuardrailAction =
  | "reject"
  | "redact"
  | "rewrite"
  | "regenerate"
  | "redirect"
  | "clarify"
  | "pass"
  | "fallback";
export type GuardrailDecision = "ALLOW" | "BLOCK" | "REDACT" | "TRANSFORM";
export type GuardrailSafetyLevel = "balanced" | "strict" | "standard" | "maximum";
export type GuardrailOutputDelivery =
  | "interruptible"
  | "window_buffered"
  | "windowed"
  | "full_buffered";
export type EvidenceOutcome = GuardrailDecision | "ERROR" | "SUCCESS" | "FAILED";
export type IntegrationProtocol = "litellm" | "http" | "a2a";
export type IntegrationEnvironment = "production" | "staging" | "development" | "test";
export type TargetSource = "user_input" | "retrieved_content" | "tool_output" | "model_output";
export type TrafficScopeSource = "field" | "header" | "jwt_claim";
export type TrafficScopeOperator = "equals" | "not_equals" | "contains" | "starts_with" | "glob";
export type AutomatedReasoningResult =
  | "valid"
  | "invalid"
  | "satisfiable"
  | "impossible"
  | "translation_ambiguous"
  | "too_complex"
  | "no_translations";

export type AutomatedReasoningPolicyBinding = {
  policyId: string;
  policyVersion: string;
  confidenceThreshold: number;
};

export type GuardrailControl = {
  risk: GuardrailRisk;
  action: GuardrailAction;
  enabled: boolean;
  reasoningPolicy?: AutomatedReasoningPolicyBinding | null;
};

export type GroundingFilterAssessment = {
  type: "grounding" | "relevance";
  score: number;
  threshold: number;
  detected: boolean;
};

export type GroundingClaimEvidence = {
  id: string;
  claim: string;
  support: "supported" | "unsupported" | "uncertain";
  confidence: number;
  sourceBlockIds: string[];
  rationale: string;
};

export type AutomatedReasoningFinding = {
  id: string;
  result: AutomatedReasoningResult;
  confidence: number;
  translation?: { premises: string[]; claims: string[]; untranslated: string[] } | null;
  supportingRules: Array<{ id: string; expression: string; description: string }>;
  contradictingRules: Array<{ id: string; expression: string; description: string }>;
  claimsTrueScenario?: { assignments: Array<[string, string]> } | null;
  claimsFalseScenario?: { assignments: Array<[string, string]> } | null;
  message: string;
};

export type EvaluationFinding = {
  risk: GuardrailRisk;
  verdict: string;
  confidence: number;
  evidence: string;
  recommendedAction: GuardrailAction;
  replacement?: string | null;
  grounding?: GroundingFilterAssessment[];
  claims?: GroundingClaimEvidence[];
  reasoning?: AutomatedReasoningFinding[];
};

export type EvidenceTraceStep = {
  id: string;
  kind?: string;
  name?: string;
  status?: string;
  stage: string;
  detail: string;
  durationMs: number;
  verdict?: string | null;
  route?: string | null;
  risk?: GuardrailRisk | null;
  confidence?: number | null;
};

export type GuardrailTestCase = {
  id: string;
  guardrailId?: string;
  name: string;
  content: string;
  phase: "input" | "output";
  risk: GuardrailRisk;
  expectedDecision: GuardrailDecision;
  actualDecision: GuardrailDecision;
  origin: "generated" | "custom";
  updatedAt: string;
  trustedInstruction: string;
  targetSource: TargetSource;
  query: string;
  groundingSources: string[];
  expectedReasoningResult: AutomatedReasoningResult | null;
};

export type EvaluationCaseResult = {
  caseId: string;
  name: string;
  risk: GuardrailRisk;
  expectedDecision: GuardrailDecision;
  actualDecision: GuardrailDecision;
  passed: boolean;
  stageReached: string;
  latencyMs: number;
  reason: string;
  phase: "input" | "output";
  inputContent: string;
  action: GuardrailAction;
  outputContent: string;
  findings: EvaluationFinding[];
  trace: EvidenceTraceStep[];
  trustedInstruction: string;
  targetSource: TargetSource;
  query: string;
  groundingSources: string[];
  expectedReasoningResult: AutomatedReasoningResult | null;
  actualReasoningResult: AutomatedReasoningResult | null;
};

export type EvaluationMetrics = {
  total: number;
  passed: number;
  complianceRate: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  deepEscalationRate: number;
  p95LatencyMs: number;
};

export type GuardrailTestRun = {
  id: string;
  guardrailId: string;
  guardrailVersion: number | null;
  sourceDraftVersion: number;
  status: "PASSED" | "FAILED" | "INCOMPLETE";
  metrics: EvaluationMetrics;
  results: EvaluationCaseResult[];
  createdAt: string;
  caseResults: Array<{
    testCaseId: string;
    passed: boolean;
    expectedDecision: GuardrailDecision;
    actualDecision: GuardrailDecision;
  }>;
};

export type RiskCoverage = {
  risk: GuardrailRisk;
  passed: number;
  total: number;
  score: number | null;
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
  sourceTemplateId: string | null;
  templateParameters: Record<string, string>;
  draftVersion: number;
  activeVersion: number | null;
  assignmentCount: number;
  testCaseCount: number;
  testedCurrent: boolean;
  isDefault: boolean;
  systemManaged: boolean;
  localOnly: boolean;
  coverage: RiskCoverage[];
  updatedAt: string;
};

export type GuardrailVersion = {
  guardrailId: string;
  version: number;
  sourceDraftVersion: number;
  compilerVersion: string;
  planChecksum: string;
  createdAt: string;
  active: boolean;
};

export type GuardrailTemplateParameter = {
  name: string;
  label: string;
  kind: "text" | "multiline" | "textarea";
  required: boolean;
  placeholder: string;
  description: string;
};

export type GuardrailTemplate = {
  id: string;
  name: string;
  description: string;
  purpose: string;
  allowedTopics: string[];
  restrictedTopics: string[];
  defaultControls: GuardrailControl[];
  safetyLevel: GuardrailSafetyLevel;
  outputDelivery: GuardrailOutputDelivery;
  source: string;
  version: string;
  domain: string;
  collections: string[];
  tags: string[];
  limitations: string[];
  controls: string[];
  parameters: GuardrailTemplateParameter[];
};

export type ControlDefinition = {
  id: GuardrailRisk;
  displayName: string;
  description: string;
  domain: string;
  defaultPhases: Array<"input" | "output">;
  defaultAction: GuardrailAction;
  allowedActions: GuardrailAction[];
  availableStages: string[];
  limitations: string[];
};

export type TrafficScopeField =
  | "environment"
  | "protocol"
  | "auth_principal"
  | "integration_id"
  | "http_method"
  | "http_host"
  | "http_path"
  | "http_header"
  | "auth_jwt_claim"
  | "model"
  | "litellm_api_key_alias"
  | "litellm_team_id"
  | "litellm_user_id"
  | "a2a_version"
  | "a2a_extensions"
  | "a2a_operation"
  | "a2a_context_id"
  | "a2a_task_id"
  | "adapter_field"
  | "provider"
  | "route"
  | "tag";

export type TrafficScopeRule = {
  field: TrafficScopeField;
  key?: string;
  operator: TrafficScopeOperator;
  value: string;
};

export type TrafficScopeExpression = {
  combinator: "and" | "or";
  rules: Array<TrafficScopeRule | TrafficScopeExpression>;
};

export type TrafficScopeFieldDefinition = {
  id: TrafficScopeField;
  group: "request" | "authentication" | "http" | "model" | "litellm" | "a2a";
  source: TrafficScopeSource;
  key: string;
  operators: TrafficScopeOperator[];
  values: string[];
  customKey?: boolean;
};

export type GuardrailAssignment = {
  id: string;
  projectId: string;
  name: string;
  guardrailId: string;
  guardrailVersion: number;
  priority: number;
  enabled: boolean;
  isDefault: boolean;
  systemManaged: boolean;
  trafficScope: TrafficScopeExpression;
  updatedAt: string;
};

export type GuardIntegration = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  protocol: IntegrationProtocol;
  environment: IntegrationEnvironment;
  enabled: boolean;
  credentialPrefix: string;
  verificationStatus: "verified" | "waiting" | "failed";
  runtimeStatus: "online" | "degraded" | "waiting" | "disabled";
  lastSeenAt: string | null;
  requestCount: number;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
  health: "HEALTHY" | "DEGRADED" | "DISABLED";
  credentialHint: string;
};

export type SystemStatus = {
  status: "healthy" | "degraded";
  activeAssignments: number;
  onlineIntegrations: number;
  totalIntegrations: number;
  capabilities: {
    deterministic: boolean;
    fastSemantic: boolean;
    deepJudge: boolean;
    automatedReasoning: boolean;
  };
};

export type AuditEvent = {
  id: string;
  createdAt: string;
  kind: string;
  outcome: EvidenceOutcome;
  guardrailId: string | null;
  assignmentId: string | null;
  risk: GuardrailRisk | null;
  detail: string;
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
  templates: GuardrailTemplate[];
  controlDefinitions: ControlDefinition[];
  trafficScopeFields: TrafficScopeFieldDefinition[];
  guardrails: Guardrail[];
  versions: GuardrailVersion[];
  assignments: GuardrailAssignment[];
  integrations: GuardIntegration[];
  systemStatus: SystemStatus;
  auditEvents: AuditEvent[];
  decisionEvidence: EvidenceEvent[];
  evidence: EvidenceEvent[];
};

export type EffectiveEnforcement = {
  assignmentId: string;
  assignmentName: string;
  guardrailId: string;
  guardrailName: string;
  guardrailVersion: number;
  priority: number;
  trafficScope: TrafficScopeExpression;
  actions: GuardrailAction[];
  isDefault: boolean;
};

export type EvidenceFilters = {
  guardrailId?: string;
  assignmentId?: string;
  outcome?: EvidenceOutcome;
  risk?: GuardrailRisk;
};

export type CreateGuardrailInput = Pick<
  Guardrail,
  "name" | "purpose" | "safetyLevel" | "outputDelivery" | "allowedTopics" | "restrictedTopics" | "controls"
> & { sourceTemplateId?: string | null; templateParameters?: Record<string, string> };

export type CreateAssignmentInput = Pick<
  GuardrailAssignment,
  "name" | "guardrailId" | "priority" | "enabled" | "trafficScope"
>;

export type RegisterIntegrationInput = Pick<GuardIntegration, "name" | "protocol" | "environment"> & {
  description?: string;
};
