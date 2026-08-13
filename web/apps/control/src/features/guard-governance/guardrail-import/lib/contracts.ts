export type SafetyLevel = "balanced" | "strict";
export type OutputDelivery =
  "interruptible" | "window_buffered" | "full_buffered";
export type TargetSource =
  "user_input" | "retrieved_content" | "tool_output" | "model_output";
export type AutomatedReasoningResult =
  | "valid"
  | "invalid"
  | "satisfiable"
  | "impossible"
  | "translation_ambiguous"
  | "too_complex"
  | "no_translations";

export type Collection<T> = { items: T[]; count: number };
export type GuardrailControl = {
  risk: string;
  action: string;
  reasoning_policy?: {
    policy_id: string;
    policy_version: string;
    confidence_threshold: number;
  } | null;
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
  source_block_ids: string[];
  rationale: string;
};
export type AutomatedReasoningFinding = {
  id: string;
  result: AutomatedReasoningResult;
  confidence: number;
  translation?:
    | {
        premises: string[];
        claims: string[];
        untranslated: string[];
      }
    | null
    | undefined;
  supporting_rules: Array<{
    id: string;
    expression: string;
    description: string;
  }>;
  contradicting_rules: Array<{
    id: string;
    expression: string;
    description: string;
  }>;
  claims_true_scenario?:
    { assignments: Array<[string, string]> } | null | undefined;
  claims_false_scenario?:
    { assignments: Array<[string, string]> } | null | undefined;
  message: string;
};
export type EvaluationMetrics = {
  total: number;
  passed: number;
  compliance_rate: number;
  false_positive_rate: number;
  false_negative_rate: number;
  deep_escalation_rate: number;
  p95_latency_ms: number;
};
export type EvaluationFinding = {
  risk: string;
  verdict: string;
  confidence: number;
  evidence: string;
  recommended_action: string;
  replacement?: string | null | undefined;
  grounding?: GroundingFilterAssessment[] | undefined;
  claims?: GroundingClaimEvidence[] | undefined;
  reasoning?: AutomatedReasoningFinding[] | undefined;
};
export type EvaluationTraceStep = {
  id: string;
  kind?: string | undefined;
  name: string;
  status: string;
  detail: string;
  duration_ms: number;
  stage?: string | null | undefined;
  verdict?: string | null | undefined;
  route?: string | null | undefined;
  risk?: string | null | undefined;
  confidence?: number | null | undefined;
};
export type EvaluationCaseResult = {
  case_id: string;
  name: string;
  risk: string;
  expected_decision: string;
  actual_decision: string;
  passed: boolean;
  stage_reached: string;
  latency_ms: number;
  reason: string;
  phase: "input" | "output";
  input_content: string;
  action: string;
  output_content: string;
  findings: EvaluationFinding[];
  trace: EvaluationTraceStep[];
  trusted_instruction: string;
  target_source: TargetSource;
  query: string;
  grounding_sources: string[];
  expected_reasoning_result: AutomatedReasoningResult | null;
  actual_reasoning_result: AutomatedReasoningResult | null;
};
export type TestRun = {
  id: string;
  guardrail_id: string;
  guardrail_version: number | null;
  source_draft_version: number;
  status: "passed" | "failed" | "incomplete";
  metrics: EvaluationMetrics;
  results: EvaluationCaseResult[];
  created_at: string;
};
export type TestCase = {
  id: string;
  guardrail_id: string;
  name: string;
  risk: string;
  phase: "input" | "output";
  content: string;
  expected_decision: "allow" | "block" | "transform" | "intervene";
  origin: "generated" | "custom";
  updated_at: string;
  trusted_instruction: string;
  target_source: TargetSource;
  query: string;
  grounding_sources: string[];
  expected_reasoning_result: AutomatedReasoningResult | null;
};
export type RiskCoverage = {
  risk: string;
  passed: number;
  total: number;
  score: number | null;
};
export type Guardrail = {
  id: string;
  name: string;
  purpose: string;
  allowed_topics: string[];
  restricted_topics: string[];
  controls: GuardrailControl[];
  safety_level: SafetyLevel;
  output_delivery: OutputDelivery;
  source_template_id: string | null;
  template_parameters: Record<string, string>;
  updated_at: string;
  status: "needs_testing" | "ready" | "protected";
  latest_test_run: TestRun | null;
  assignment_count: number;
  test_case_count: number;
  tested_current: boolean;
  is_default: boolean;
  system_managed: boolean;
  local_only: boolean;
  coverage: RiskCoverage[];
};
export type GuardrailVersion = {
  guardrail_id: string;
  version: number;
  source_draft_version: number;
  compiler_version: string;
  plan_checksum: string;
  created_at: string;
  active: boolean;
};
export type GuardrailTemplate = {
  id: string;
  name: string;
  description: string;
  purpose: string;
  allowed_topics: string[];
  restricted_topics: string[];
  default_controls: GuardrailControl[];
  safety_level: SafetyLevel;
  output_delivery: OutputDelivery;
  source?: string;
  version?: string;
  domain?: string;
  collections?: string[];
  tags?: string[];
  limitations?: string[];
  controls?: string[];
  parameters?: Array<{
    name: string;
    label: string;
    kind: string;
    required: boolean;
    placeholder: string;
    description: string;
  }>;
};
export type ControlDefinition = {
  id: string;
  display_name: string;
  description: string;
  domain: string;
  default_phases: Array<"input" | "output">;
  default_action: string;
  allowed_actions: string[];
  available_stages: string[];
  limitations: string[];
};
export type TrafficScopeSource = "field" | "header" | "jwt_claim";
export type TrafficScopeOperator =
  "equals" | "not_equals" | "contains" | "starts_with" | "glob";
export type TrafficScopeRule = {
  field: string;
  key?: string;
  operator: TrafficScopeOperator;
  value: string;
};
export type TrafficScopeExpression = {
  combinator: "and" | "or";
  rules: Array<TrafficScopeRule | TrafficScopeExpression>;
};
export type TrafficScopeField = {
  id: string;
  group: "request" | "authentication" | "http" | "model" | "litellm" | "a2a";
  source: TrafficScopeSource;
  key: string;
  operators: TrafficScopeOperator[];
  values: string[];
  custom_key?: boolean | undefined;
};
export type GuardrailAssignment = {
  id: string;
  name: string;
  guardrail_id: string;
  guardrail_version: number;
  traffic_scope: TrafficScopeExpression;
  enabled: boolean;
  is_default: boolean;
  system_managed: boolean;
  updated_at: string;
};
export type IntentAnalysisStatus = {
  available: boolean;
  provider: string | null;
  model: string | null;
};
export type IntentAnalysis = {
  summary: string;
  allowed_topics: string[];
  restricted_topics: string[];
  review_notes: string[];
};

export type CreateGuardrailInput = {
  name: string;
  purpose?: string;
  template_id?: string;
  template_parameters?: Record<string, string>;
  allowed_topics?: string[];
  restricted_topics?: string[];
  controls?: GuardrailControl[];
  safety_level?: SafetyLevel;
  output_delivery?: OutputDelivery;
};
export type UpdateGuardrailInput = Partial<
  Pick<
    Guardrail,
    | "name"
    | "purpose"
    | "allowed_topics"
    | "restricted_topics"
    | "controls"
    | "safety_level"
    | "output_delivery"
  >
>;
export type CreateTestCaseInput = Pick<
  TestCase,
  | "name"
  | "risk"
  | "phase"
  | "content"
  | "expected_decision"
  | "trusted_instruction"
  | "target_source"
  | "query"
  | "grounding_sources"
  | "expected_reasoning_result"
>;
export type CreateAssignmentInput = {
  name: string;
  guardrail_id: string;
  traffic_scope: TrafficScopeExpression;
  enabled: boolean;
};
