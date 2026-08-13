import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useGuardGovernanceStore } from "../../mock-provider";
import type {
  EvaluationCaseResult as ModelCaseResult,
  EvaluationFinding as ModelFinding,
  EvidenceTraceStep as ModelTraceStep,
  Guardrail as ModelGuardrail,
  GuardrailControl as ModelControl,
  GuardrailTestCase as ModelTestCase,
  GuardrailTestRun as ModelTestRun,
  TrafficScopeExpression as ModelTrafficScopeExpression,
} from "../../model";
import type { GuardGovernanceStore } from "../../store";
import type {
  AutomatedReasoningFinding,
  Collection,
  ControlDefinition,
  CreateAssignmentInput,
  CreateGuardrailInput,
  CreateTestCaseInput,
  EvaluationCaseResult,
  EvaluationFinding,
  EvaluationTraceStep,
  Guardrail,
  GuardrailAssignment,
  GuardrailControl,
  GuardrailTemplate,
  GuardrailVersion,
  IntentAnalysis,
  IntentAnalysisStatus,
  TestCase,
  TestRun,
  TrafficScopeExpression,
  TrafficScopeField,
  UpdateGuardrailInput,
} from "./contracts";

export type MockScenario = "populated" | "loading" | "empty" | "error";

export type GuardrailApi = {
  getGuardrails(): Promise<Collection<Guardrail>>;
  getGuardrail(id: string): Promise<Guardrail>;
  getGuardrailTemplates(): Promise<Collection<GuardrailTemplate>>;
  getControlDefinitions(): Promise<Collection<ControlDefinition>>;
  getIntentAnalysisStatus(): Promise<IntentAnalysisStatus>;
  analyzeGuardrailIntent(input: {
    purpose: string;
    language: "en" | "zh-CN";
  }): Promise<IntentAnalysis>;
  createGuardrail(input: CreateGuardrailInput): Promise<Guardrail>;
  updateGuardrail(id: string, input: UpdateGuardrailInput): Promise<Guardrail>;
  getTestCases(guardrailId: string): Promise<Collection<TestCase>>;
  createTestCase(
    guardrailId: string,
    input: CreateTestCaseInput,
  ): Promise<TestCase>;
  deleteTestCase(id: string): Promise<void>;
  createTestRun(guardrailId: string): Promise<TestRun>;
  getGuardrailVersions(
    guardrailId: string,
  ): Promise<Collection<GuardrailVersion>>;
  getAssignments(): Promise<Collection<GuardrailAssignment>>;
  createAssignment(input: CreateAssignmentInput): Promise<GuardrailAssignment>;
  getTrafficScopeFields(): Promise<Collection<TrafficScopeField>>;
};

function control(item: ModelControl): GuardrailControl {
  return {
    risk: item.risk,
    action: item.action,
    reasoning_policy: item.reasoningPolicy
      ? {
          policy_id: item.reasoningPolicy.policyId,
          policy_version: item.reasoningPolicy.policyVersion,
          confidence_threshold: item.reasoningPolicy.confidenceThreshold,
        }
      : null,
  };
}

function modelControl(item: ModelControl | GuardrailControl): ModelControl {
  if ("enabled" in item) return item;
  return {
    risk: item.risk as ModelControl["risk"],
    action: item.action as ModelControl["action"],
    enabled: true,
    reasoningPolicy: item.reasoning_policy
      ? {
          policyId: item.reasoning_policy.policy_id,
          policyVersion: item.reasoning_policy.policy_version,
          confidenceThreshold: item.reasoning_policy.confidence_threshold,
        }
      : null,
  };
}

function trace(item: ModelTraceStep): EvaluationTraceStep {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name ?? item.stage,
    status: item.status ?? "completed",
    detail: item.detail,
    duration_ms: item.durationMs,
    stage: item.stage,
    verdict: item.verdict,
    route: item.route,
    risk: item.risk,
    confidence: item.confidence,
  };
}

function finding(item: ModelFinding): EvaluationFinding {
  const reasoning: AutomatedReasoningFinding[] | undefined =
    item.reasoning?.map((entry) => ({
      id: entry.id,
      result: entry.result,
      confidence: entry.confidence,
      translation: entry.translation,
      supporting_rules: entry.supportingRules,
      contradicting_rules: entry.contradictingRules,
      claims_true_scenario: entry.claimsTrueScenario,
      claims_false_scenario: entry.claimsFalseScenario,
      message: entry.message,
    }));
  return {
    risk: item.risk,
    verdict: item.verdict,
    confidence: item.confidence,
    evidence: item.evidence,
    recommended_action: item.recommendedAction,
    replacement: item.replacement,
    grounding: item.grounding,
    claims: item.claims?.map((claim) => ({
      id: claim.id,
      claim: claim.claim,
      support: claim.support,
      confidence: claim.confidence,
      source_block_ids: claim.sourceBlockIds,
      rationale: claim.rationale,
    })),
    reasoning,
  };
}

function caseResult(item: ModelCaseResult): EvaluationCaseResult {
  return {
    case_id: item.caseId,
    name: item.name,
    risk: item.risk,
    expected_decision: item.expectedDecision.toLowerCase(),
    actual_decision: item.actualDecision.toLowerCase(),
    passed: item.passed,
    stage_reached: item.stageReached,
    latency_ms: item.latencyMs,
    reason: item.reason,
    phase: item.phase,
    input_content: item.inputContent,
    action: item.action,
    output_content: item.outputContent,
    findings: item.findings.map(finding),
    trace: item.trace.map(trace),
    trusted_instruction: item.trustedInstruction,
    target_source: item.targetSource,
    query: item.query,
    grounding_sources: item.groundingSources,
    expected_reasoning_result: item.expectedReasoningResult,
    actual_reasoning_result: item.actualReasoningResult,
  };
}

function testRun(item: ModelTestRun): TestRun {
  return {
    id: item.id,
    guardrail_id: item.guardrailId,
    guardrail_version: item.guardrailVersion,
    source_draft_version: item.sourceDraftVersion,
    status: item.status.toLowerCase() as TestRun["status"],
    metrics: {
      total: item.metrics.total,
      passed: item.metrics.passed,
      compliance_rate: item.metrics.complianceRate,
      false_positive_rate: item.metrics.falsePositiveRate,
      false_negative_rate: item.metrics.falseNegativeRate,
      deep_escalation_rate: item.metrics.deepEscalationRate,
      p95_latency_ms: item.metrics.p95LatencyMs,
    },
    results: item.results.map(caseResult),
    created_at: item.createdAt,
  };
}

function testCase(item: ModelTestCase, guardrailId: string): TestCase {
  const expected =
    item.expectedDecision === "REDACT"
      ? "intervene"
      : item.expectedDecision.toLowerCase();
  return {
    id: item.id,
    guardrail_id: item.guardrailId ?? guardrailId,
    name: item.name,
    risk: item.risk,
    phase: item.phase,
    content: item.content,
    expected_decision: expected as TestCase["expected_decision"],
    origin: item.origin,
    updated_at: item.updatedAt,
    trusted_instruction: item.trustedInstruction,
    target_source: item.targetSource,
    query: item.query,
    grounding_sources: item.groundingSources,
    expected_reasoning_result: item.expectedReasoningResult,
  };
}

function guardrail(item: ModelGuardrail): Guardrail {
  return {
    id: item.id,
    name: item.name,
    purpose: item.purpose,
    allowed_topics: item.allowedTopics,
    restricted_topics: item.restrictedTopics,
    controls: item.controls.filter((entry) => entry.enabled).map(control),
    safety_level:
      item.safetyLevel === "strict" || item.safetyLevel === "maximum"
        ? "strict"
        : "balanced",
    output_delivery:
      item.outputDelivery === "windowed"
        ? "window_buffered"
        : item.outputDelivery,
    source_template_id: item.sourceTemplateId,
    template_parameters: item.templateParameters,
    updated_at: item.updatedAt,
    status:
      item.status === "PROTECTED"
        ? "protected"
        : item.status === "READY"
          ? "ready"
          : "needs_testing",
    latest_test_run: item.latestTestRun ? testRun(item.latestTestRun) : null,
    assignment_count: item.assignmentCount,
    test_case_count: item.testCaseCount,
    tested_current: item.testedCurrent,
    is_default: item.isDefault,
    system_managed: item.systemManaged,
    local_only: item.localOnly,
    coverage: item.coverage,
  };
}

function collection<T>(items: T[]): Collection<T> {
  return { items, count: items.length };
}

function toModelScope(
  input: TrafficScopeExpression,
): ModelTrafficScopeExpression {
  return input as ModelTrafficScopeExpression;
}

function modelDecision(value: TestCase["expected_decision"]) {
  return value === "allow"
    ? ("ALLOW" as const)
    : value === "block"
      ? ("BLOCK" as const)
      : value === "transform"
        ? ("TRANSFORM" as const)
        : ("REDACT" as const);
}

function createGuardrailApi(
  store: GuardGovernanceStore,
  scenario: MockScenario,
): GuardrailApi {
  const wait = async <T,>(operation: () => T): Promise<T> => {
    if (scenario === "loading") return new Promise<T>(() => undefined);
    if (scenario === "error") throw new Error("Mock Guardrail request failed");
    return operation();
  };
  const empty = <T,>(items: T[]) => (scenario === "empty" ? [] : items);

  return {
    getGuardrails: () =>
      wait(() => collection(empty(store.getState().guardrails).map(guardrail))),
    getGuardrail: (id) =>
      wait(() => {
        const item = store
          .getState()
          .guardrails.find((entry) => entry.id === id);
        if (!item) throw new Error("Guardrail not found");
        return guardrail(item);
      }),
    getGuardrailTemplates: () =>
      wait(() =>
        collection(
          empty(store.getState().templates).map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            purpose: item.purpose,
            allowed_topics: item.allowedTopics,
            restricted_topics: item.restrictedTopics,
            default_controls: item.defaultControls.map(control),
            safety_level: item.safetyLevel === "strict" ? "strict" : "balanced",
            output_delivery:
              item.outputDelivery === "windowed"
                ? "window_buffered"
                : item.outputDelivery,
            source: item.source,
            version: item.version,
            domain: item.domain,
            collections: item.collections,
            tags: item.tags,
            limitations: item.limitations,
            controls: item.controls,
            parameters: item.parameters,
          })),
        ),
      ),
    getControlDefinitions: () =>
      wait(() =>
        collection(
          empty(store.getState().controlDefinitions).map((item) => ({
            id: item.id,
            display_name: item.displayName,
            description: item.description,
            domain: item.domain,
            default_phases: item.defaultPhases,
            default_action: item.defaultAction,
            allowed_actions: item.allowedActions,
            available_stages: item.availableStages,
            limitations: item.limitations,
          })),
        ),
      ),
    getIntentAnalysisStatus: () =>
      wait(() => ({
        available: true,
        provider: "mock",
        model: "deterministic",
      })),
    analyzeGuardrailIntent: ({ purpose }) =>
      wait(() => {
        const result = store.analyzeIntent(purpose);
        return {
          summary: result.summary,
          allowed_topics: result.allowedTopics,
          restricted_topics: result.restrictedTopics,
          review_notes: result.reviewNotes,
        };
      }),
    createGuardrail: (input) =>
      wait(() => {
        const template = input.template_id
          ? store
              .getState()
              .templates.find((item) => item.id === input.template_id)
          : undefined;
        return guardrail(
          store.createGuardrail({
            name: input.name,
            purpose: input.purpose ?? template?.purpose ?? input.name,
            safetyLevel:
              input.safety_level ?? template?.safetyLevel ?? "balanced",
            outputDelivery:
              input.output_delivery ??
              template?.outputDelivery ??
              "interruptible",
            allowedTopics:
              input.allowed_topics ?? template?.allowedTopics ?? [],
            restrictedTopics:
              input.restricted_topics ?? template?.restrictedTopics ?? [],
            controls: (input.controls ?? template?.defaultControls ?? []).map(
              modelControl,
            ),
            sourceTemplateId: input.template_id ?? null,
            templateParameters: input.template_parameters ?? {},
          }),
        );
      }),
    updateGuardrail: (id, input) =>
      wait(() =>
        guardrail(
          store.updateGuardrail(id, {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
            ...(input.allowed_topics === undefined
              ? {}
              : { allowedTopics: input.allowed_topics }),
            ...(input.restricted_topics === undefined
              ? {}
              : { restrictedTopics: input.restricted_topics }),
            ...(input.safety_level === undefined
              ? {}
              : { safetyLevel: input.safety_level }),
            ...(input.output_delivery === undefined
              ? {}
              : { outputDelivery: input.output_delivery }),
            ...(input.controls === undefined
              ? {}
              : { controls: input.controls.map(modelControl) }),
          }),
        ),
      ),
    getTestCases: (guardrailId) =>
      wait(() => {
        const item = store
          .getState()
          .guardrails.find((entry) => entry.id === guardrailId);
        if (!item) throw new Error("Guardrail not found");
        return collection(
          empty(item.testCases).map((entry) => testCase(entry, guardrailId)),
        );
      }),
    createTestCase: (guardrailId, input) =>
      wait(() => {
        const decision = modelDecision(input.expected_decision);
        return testCase(
          store.addTestCase(guardrailId, {
            guardrailId,
            name: input.name,
            risk: input.risk as ModelTestCase["risk"],
            phase: input.phase,
            content: input.content,
            expectedDecision: decision,
            actualDecision: decision,
            origin: "custom",
            updatedAt: new Date().toISOString(),
            trustedInstruction: input.trusted_instruction,
            targetSource: input.target_source,
            query: input.query,
            groundingSources: input.grounding_sources,
            expectedReasoningResult: input.expected_reasoning_result,
          }),
          guardrailId,
        );
      }),
    deleteTestCase: (id) =>
      wait(() => {
        const owner = store
          .getState()
          .guardrails.find((item) =>
            item.testCases.some((entry) => entry.id === id),
          );
        if (!owner) throw new Error("Test Case not found");
        store.deleteTestCase(owner.id, id);
      }),
    createTestRun: (guardrailId) =>
      wait(() => testRun(store.runGuardrailTest(guardrailId))),
    getGuardrailVersions: (guardrailId) =>
      wait(() =>
        collection(
          empty(
            store
              .getState()
              .versions.filter((item) => item.guardrailId === guardrailId),
          )
            .sort((left, right) => right.version - left.version)
            .map((item) => ({
              guardrail_id: item.guardrailId,
              version: item.version,
              source_draft_version: item.sourceDraftVersion,
              compiler_version: item.compilerVersion,
              plan_checksum: item.planChecksum,
              created_at: item.createdAt,
              active: item.active,
            })),
        ),
      ),
    getAssignments: () =>
      wait(() =>
        collection(
          empty(store.getState().assignments).map((item) => ({
            id: item.id,
            name: item.name,
            guardrail_id: item.guardrailId,
            guardrail_version: item.guardrailVersion,
            traffic_scope: item.trafficScope as TrafficScopeExpression,
            enabled: item.enabled,
            is_default: item.isDefault,
            system_managed: item.systemManaged,
            updated_at: item.updatedAt,
          })),
        ),
      ),
    createAssignment: (input) =>
      wait(() => {
        const id = store.createAssignment({
          name: input.name,
          guardrailId: input.guardrail_id,
          priority: 100,
          enabled: input.enabled,
          trafficScope: toModelScope(input.traffic_scope),
        });
        const item = store
          .getState()
          .assignments.find((entry) => entry.id === id);
        if (!item) throw new Error("Assignment not found");
        return {
          id: item.id,
          name: item.name,
          guardrail_id: item.guardrailId,
          guardrail_version: item.guardrailVersion,
          traffic_scope: item.trafficScope as TrafficScopeExpression,
          enabled: item.enabled,
          is_default: item.isDefault,
          system_managed: item.systemManaged,
          updated_at: item.updatedAt,
        };
      }),
    getTrafficScopeFields: () =>
      wait(() =>
        collection(
          empty(store.getState().trafficScopeFields).map((item) => ({
            id: item.id,
            group: item.group,
            source: item.source,
            key: item.key,
            operators: item.operators,
            values: item.values,
            custom_key: item.customKey,
          })),
        ),
      ),
  };
}

const GuardrailApiContext = createContext<GuardrailApi | null>(null);

export function GuardrailMockApiProvider({
  children,
  scenario = "populated",
}: {
  children: ReactNode;
  scenario?: MockScenario;
}) {
  const store = useGuardGovernanceStore();
  const api = useMemo(
    () => createGuardrailApi(store, scenario),
    [store, scenario],
  );
  return (
    <GuardrailApiContext.Provider value={api}>
      {children}
    </GuardrailApiContext.Provider>
  );
}

export function useGuardrailApi() {
  const api = useContext(GuardrailApiContext);
  if (!api)
    throw new Error("useGuardrailApi requires GuardrailMockApiProvider");
  return api;
}
