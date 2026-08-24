import { useMemo } from "react";
import { useGuardGovernanceStore } from "../../mock-provider";
import type {
  CreatePolicyInput,
  GuardrailAction,
  GuardrailDecision,
  GuardrailPolicy,
  GuardrailRail,
} from "../../model";

export type Collection<T> = { items: T[]; count: number };
export type EnforcementAction = "pass" | "redact" | "rewrite" | "regenerate" | "redirect" | "reject" | "fallback" | "clarify";
export type SafetyLevel = "balanced" | "strict";
export type OutputDelivery = "interruptible" | "window_buffered" | "full_buffered";
export type NativeRailType = "input" | "output" | "retrieval" | "dialog" | "execution";
export type PolicyRailType = Extract<NativeRailType, "input" | "output">;
export type PolicyTag = GuardrailPolicy["tags"][number];
export type GuardrailPolicyBinding = {
  policy_id: string;
  policy_version: string;
  action?: EnforcementAction | null;
  parameter_values: Record<string, string>;
  enabled_rule_ids: string[];
  rule_actions: Record<string, EnforcementAction>;
  enabled_rails: NativeRailType[];
  reasoning_policy?: { policy_id: string; policy_version: string; confidence_threshold: number } | null;
};
export type PolicyRule = {
  id: string;
  name: string;
  description: string;
  form: "regex" | "keyword" | "category" | "code_block" | "competitor_intent" | "colang_flow";
  effect: string;
  stages: NativeRailType[];
  implementation: {
    engine: string;
    form: PolicyRule["form"];
    binding_id: string;
    implementation_rule_id: string;
    detector: string | null;
    flow_name: string | null;
    action_name: string | null;
  };
  expression: string | null;
  context_expression: string | null;
  context_max_gap_words?: number | null;
  allow_word_numbers?: boolean;
  redaction: string | null;
  severity_threshold: string | null;
  identifiers: string[];
  conditions: string[];
  keywords: Array<[string, string]>;
  always_block: Array<[string, string]>;
  exceptions: string[];
  phrase_patterns: string[];
};
export type PolicyTestCase = {
  id: string;
  name: string;
  description: string;
  stage: NativeRailType;
  content: string;
  expected_decision: "allow" | "block" | "transform" | "intervene";
  covered_rule_ids: string[];
  group: string;
  kind: "rule_acceptance" | "scenario";
  required: boolean;
  parameter_names: string[];
};
export type PolicyParameter = {
  name: string;
  label?: string;
  kind: string;
  required: boolean;
  placeholder?: string;
  default?: string | null;
  description: string;
};
export type Policy = {
  implementation: "rules" | "nemo_native";
  id: string;
  name: string;
  description: string;
  source: "built_in" | "custom";
  version: string;
  tags: PolicyTag[];
  parameters: PolicyParameter[];
  stages: NativeRailType[];
  effects: string[];
  forms: PolicyRule["form"][];
  rules: PolicyRule[];
  test_cases: PolicyTestCase[];
  test_count: number;
  safety_level: SafetyLevel;
  output_delivery: OutputDelivery;
  draft_revision?: number;
  owner?: string;
  updated_at?: string;
  implementation_detail?: ProgrammablePolicy;
};
export type PolicySourceFile = { path: string; content: string };
export type PolicyDraftParameter = {
  name: string;
  kind: "string" | "number" | "boolean" | "secret";
  required: boolean;
  default: string | null;
  description: string;
};
export type PolicyRailBinding = {
  rail_type: PolicyRailType;
  flow_name: string;
  execution_mode: "detect" | "mutate";
  on_unsafe: "pass" | "redact" | "rewrite" | "regenerate" | "redirect" | "reject" | "fallback" | "clarify";
  parallel_group: string | null;
  priority: number | null;
  timeout_ms: number;
  failure_mode: "fail_open" | "fail_closed";
  required: boolean;
  depends_on: string[];
};
export type PolicyActionReference = { name: string; version: string };
export type PolicyDraftTestCase = {
  id: string;
  description: string;
  name: string;
  rail_type: PolicyRailType;
  content: string;
  expected_decision: "allow" | "block" | "transform";
  covered_rule_ids: string[];
  case_type: "unit" | "input_rail" | "output_rail" | "timeout" | "provider_failure" | "concurrency";
  required: boolean;
  expected_failure: "timeout" | "provider_failure" | null;
  concurrency_group: string | null;
  trusted_instruction: string;
  use_guardrail_instruction: boolean;
  for_each: "allowed_topics" | "restricted_topics" | null;
  target_source: "user_input" | "retrieved_content" | "tool_output" | "model_output";
  query: string;
  grounding_sources: string[];
  expected_reasoning_result: null;
};
export type ProgrammablePolicyDraft = {
  colang_version: "1.0" | "2.x";
  sources: PolicySourceFile[];
  parameter_schema: PolicyDraftParameter[];
  rail_bindings: PolicyRailBinding[];
  action_references: PolicyActionReference[];
  model_dependencies: string[];
  prompt_dependencies: string[];
  execution_contract: Array<[string, string]>;
  test_cases: PolicyDraftTestCase[];
};
export type ProgrammablePolicyVersion = Omit<ProgrammablePolicyDraft, "execution_contract"> & {
  policy_id: string;
  version: string;
  name: string;
  description: string;
  source: "built_in" | "custom";
  owner: string;
  execution_contract: Array<[string, string]>;
  checksum: string;
  published_at: string;
};
export type ProgrammablePolicy = {
  implementation: "nemo_native";
  id: string;
  name: string;
  description: string;
  source: "built_in" | "custom";
  owner: string;
  draft: ProgrammablePolicyDraft;
  draft_revision: number;
  updated_at: string;
  versions?: ProgrammablePolicyVersion[];
};
export type ActionDefinition = {
  name: string;
  version: string;
  input_schema: Array<[string, string]>;
  output_schema: Array<[string, string]>;
  supported_rails: NativeRailType[];
  timeout_ms: number;
  failure_mode: "fail_open" | "fail_closed";
  side_effects: boolean;
  concurrent: boolean;
  network_access: boolean;
  secret_names: string[];
  provider_ready: boolean;
};
export type PolicyDraftValidationRun = {
  id?: string;
  policy_id?: string;
  draft_revision?: number;
  status: "not_run" | "queued" | "running" | "passed" | "failed";
  results?: Array<{
    name: string;
    case_type: PolicyDraftTestCase["case_type"];
    required: boolean;
    rail_type: PolicyRailType;
    concurrency_group: string | null;
    expected_decision: string;
    expected_failure: PolicyDraftTestCase["expected_failure"];
    actual_decision: string;
    actual_failure: string | null;
    passed: boolean;
    latency_ms: number;
    reason: string;
    covered_rule_ids: string[];
    matched_rule_ids: string[];
  }>;
};
export type PolicyImport = { name: string; description: string; owner: string; draft: ProgrammablePolicyDraft };

const decision = (value: GuardrailDecision): PolicyTestCase["expected_decision"] =>
  value === "ALLOW" ? "allow" : value === "BLOCK" ? "block" : value === "REDACT" ? "intervene" : "transform";

const outputDelivery = (value: GuardrailPolicy["outputDelivery"]): OutputDelivery =>
  value === "windowed" ? "window_buffered" : value;

export function toSourcePolicy(item: GuardrailPolicy): Policy {
  const rules: PolicyRule[] = item.rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    description: rule.description,
    form: rule.form,
    effect: rule.effect,
    stages: rule.stages,
    implementation: {
      engine: "nemo_guardrails",
      form: rule.form,
      binding_id: rule.id,
      implementation_rule_id: rule.id,
      detector: rule.form === "colang_flow" ? null : rule.risk,
      flow_name: rule.form === "colang_flow" ? rule.id.split("/").at(-1) ?? rule.id : null,
      action_name: rule.effect,
    },
    expression: rule.expression,
    context_expression: null,
    redaction: null,
    severity_threshold: null,
    identifiers: [],
    conditions: [],
    keywords: [],
    always_block: [],
    exceptions: [],
    phrase_patterns: [],
  }));
  const testCases: PolicyTestCase[] = item.testCases.map((testCase) => ({
    id: testCase.id,
    name: testCase.name,
    description: testCase.description,
    stage: testCase.stage,
    content: testCase.content,
    expected_decision: decision(testCase.expectedDecision),
    covered_rule_ids: testCase.coveredRuleIds,
    group: testCase.group,
    kind: testCase.kind,
    required: testCase.required,
    parameter_names: [],
  }));
  const policy: Policy = {
    implementation: item.source === "custom" ? "nemo_native" : "rules",
    id: item.id,
    name: item.name,
    description: item.description,
    source: item.source,
    version: item.version,
    tags: item.tags,
    parameters: [],
    stages: item.stages,
    effects: [...new Set(item.rules.map((rule) => rule.effect))],
    forms: [...new Set(rules.map((rule) => rule.form))],
    rules,
    test_cases: testCases,
    test_count: testCases.length,
    safety_level: item.safetyLevel === "strict" || item.safetyLevel === "maximum" ? "strict" : "balanced",
    output_delivery: outputDelivery(item.outputDelivery),
    draft_revision: Number(item.version) || 1,
    owner: item.owner,
    updated_at: item.updatedAt,
  };
  if (item.source === "custom") policy.implementation_detail = toProgrammable(item);
  return policy;
}

function toProgrammable(item: GuardrailPolicy): ProgrammablePolicy {
  const rails: PolicyRailBinding[] = item.rules.map((rule, index) => ({
    rail_type: rule.stages.includes("output") ? "output" : "input",
    flow_name: rule.id.split("/").at(-1) || `policy_rule_${index + 1}`,
    execution_mode: rule.effect === "redact" || rule.effect === "rewrite" ? "mutate" : "detect",
    on_unsafe: rule.effect,
    parallel_group: index ? null : "primary-detection",
    priority: index ? 100 : null,
    timeout_ms: 500,
    failure_mode: "fail_closed",
    required: true,
    depends_on: [],
  }));
  return {
    implementation: "nemo_native",
    id: item.id,
    name: item.name,
    description: item.description,
    source: "custom",
    owner: item.owner,
    draft_revision: Number(item.version) || 1,
    updated_at: item.updatedAt,
    draft: {
      colang_version: "2.x",
      sources: [{ path: "main.co", content: item.rules[0]?.expression || "flow check_request $text\n  return" }],
      parameter_schema: [],
      rail_bindings: rails.length ? rails : [defaultRail()],
      action_references: [],
      model_dependencies: [],
      prompt_dependencies: [],
      execution_contract: [],
      test_cases: item.testCases.map((testCase) => ({
        id: testCase.id,
        description: testCase.description,
        name: testCase.name,
        rail_type: testCase.stage === "output" ? "output" : "input",
        content: testCase.content,
        expected_decision: testCase.expectedDecision === "ALLOW" ? "allow" : testCase.expectedDecision === "BLOCK" ? "block" : "transform",
        covered_rule_ids: testCase.coveredRuleIds,
        case_type: "unit",
        required: testCase.required,
        expected_failure: null,
        concurrency_group: null,
        trusted_instruction: "",
        use_guardrail_instruction: false,
        for_each: null,
        target_source: testCase.stage === "output" ? "model_output" : "user_input",
        query: "",
        grounding_sources: [],
        expected_reasoning_result: null,
      })),
    },
  };
}

function defaultRail(): PolicyRailBinding {
  return { rail_type: "input", flow_name: "check_request", execution_mode: "detect", on_unsafe: "reject", parallel_group: "primary-detection", priority: null, timeout_ms: 500, failure_mode: "fail_closed", required: true, depends_on: [] };
}

function toStoreInput(input: { name: string; description: string; owner: string; draft: ProgrammablePolicyDraft }): CreatePolicyInput {
  const rail = input.draft.rail_bindings[0] ?? defaultRail();
  const test = input.draft.test_cases[0];
  const expected: GuardrailDecision = test?.expected_decision === "allow" ? "ALLOW" : test?.expected_decision === "block" ? "BLOCK" : "TRANSFORM";
  return {
    name: input.name,
    description: input.description,
    owner: input.owner,
    risk: "company_policy",
    effect: rail.on_unsafe as GuardrailAction,
    stages: input.draft.rail_bindings.map((item) => item.rail_type as GuardrailRail),
    ruleExpression: input.draft.sources[0]?.content ?? "",
    testPrompt: test?.content ?? "Policy acceptance case",
    expectedDecision: expected,
  };
}

export function useSourcePolicyApi() {
  const store = useGuardGovernanceStore();
  return useMemo(() => ({
    getPolicies: async (): Promise<Collection<Policy>> => {
      const items = store.getState().policies.map(toSourcePolicy);
      return { items, count: items.length };
    },
    getPolicy: async (id: string): Promise<Policy> => {
      const item = store.getState().policies.find((policy) => policy.id === id);
      if (!item) throw new Error("Policy not found");
      return toSourcePolicy(item);
    },
    deleteProgrammablePolicy: async (id: string) => store.deletePolicy(id),
    createProgrammablePolicy: async (input: { name: string; description: string; owner: string; draft: ProgrammablePolicyDraft }) => toProgrammable(store.createPolicy(toStoreInput(input))),
    updateProgrammablePolicy: async (id: string, input: { name: string; description: string; owner: string; draft: ProgrammablePolicyDraft }) => toProgrammable(store.updatePolicy(id, toStoreInput(input))),
    validateProgrammablePolicy: async (id: string) => ({ valid: true, policy_id: id, draft_revision: 1, colang_version: "2.x", rails: ["input"] as NativeRailType[] }),
    runProgrammablePolicyValidation: async (id: string): Promise<PolicyDraftValidationRun> => {
      const item = store.getState().policies.find((policy) => policy.id === id);
      if (!item) throw new Error("Policy not found");
      const draft = toProgrammable(item).draft;
      return { id: `validation-${id}`, policy_id: id, draft_revision: Number(item.version) || 1, status: "passed", results: draft.test_cases.map((test) => ({ name: test.name, case_type: test.case_type, required: test.required, rail_type: test.rail_type, concurrency_group: test.concurrency_group, expected_decision: test.expected_decision, expected_failure: test.expected_failure, actual_decision: test.expected_decision, actual_failure: null, passed: true, latency_ms: 18, reason: "Deterministic demo validation passed", covered_rule_ids: test.covered_rule_ids, matched_rule_ids: test.covered_rule_ids })) };
    },
    publishProgrammablePolicy: async (id: string) => {
      const item = store.getState().policies.find((policy) => policy.id === id);
      if (!item) throw new Error("Policy not found");
      return { policy_id: id, version: item.version };
    },
    getActionCatalog: async (): Promise<Collection<ActionDefinition>> => {
      const items: ActionDefinition[] = [
        { name: "GuardCustomerIdentifierAction", version: "1.0.0", input_schema: [["text", "string"]], output_schema: [["detected", "boolean"]], supported_rails: ["input", "output"], timeout_ms: 500, failure_mode: "fail_closed", side_effects: false, concurrent: true, network_access: false, secret_names: [], provider_ready: true },
        { name: "GuardRecordPolicyAction", version: "1.0.0", input_schema: [["text", "string"]], output_schema: [["recorded", "boolean"]], supported_rails: ["input", "output"], timeout_ms: 500, failure_mode: "fail_closed", side_effects: true, concurrent: true, network_access: false, secret_names: [], provider_ready: true },
      ];
      return { items, count: items.length };
    },
  }), [store]);
}
