import type {
  AuditEvent,
  CreateAssignmentInput,
  CreateGuardrailInput,
  EffectiveEnforcement,
  EvaluationCaseResult,
  EvidenceEvent,
  EvidenceFilters,
  GuardGovernanceState,
  GuardIntegration,
  Guardrail,
  GuardrailCoverageRow,
  GuardrailAssignment,
  GuardrailTestCase,
  GuardrailTestRun,
  RegisterIntegrationInput,
  SetGuardrailCoverageInput,
  TrafficScopeExpression,
  TrafficScopeRule,
} from "./model";

type StoreOptions = {
  id?: () => string;
  now?: () => string;
  credential?: () => string;
};

export type GuardGovernanceStore = {
  getState: () => GuardGovernanceState;
  subscribe: (listener: () => void) => () => void;
  analyzeIntent: (purpose: string) => {
    summary: string;
    allowedTopics: string[];
    restrictedTopics: string[];
    reviewNotes: string[];
  };
  createGuardrail: (input: CreateGuardrailInput) => Guardrail;
  updateGuardrail: (id: string, input: Partial<CreateGuardrailInput>) => Guardrail;
  addTestCase: (guardrailId: string, input: Omit<GuardrailTestCase, "id">) => GuardrailTestCase;
  deleteTestCase: (guardrailId: string, testCaseId: string) => void;
  runGuardrailTest: (guardrailId: string) => GuardrailTestRun;
  createAssignment: (input: CreateAssignmentInput) => string;
  toggleAssignment: (id: string, enabled: boolean) => void;
  setGuardrailCoverage: (guardrailId: string, input: SetGuardrailCoverageInput) => void;
  registerIntegration: (input: RegisterIntegrationInput) => { integration: GuardIntegration; credential: string };
  toggleIntegration: (id: string, enabled: boolean) => void;
};

function defaultId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function required(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function credentialPrefix(value: string) {
  const namespace = value.includes("_") ? `${value.split("_")[0]}_` : "";
  return `${namespace}…${value.slice(-4)}`;
}

function isExpression(item: TrafficScopeRule | TrafficScopeExpression): item is TrafficScopeExpression {
  return "rules" in item;
}

export function isTrafficScopeValid(expression: TrafficScopeExpression, allowEmpty = false): boolean {
  if (!expression.rules.length) return allowEmpty;
  return expression.rules.every((item) =>
    isExpression(item)
      ? isTrafficScopeValid(item)
      : Boolean(item.field && item.operator && item.value.trim() && (!item.key || item.key.trim())),
  );
}

function resultFor(testCase: GuardrailTestCase, index: number): EvaluationCaseResult {
  const passed = testCase.expectedDecision === testCase.actualDecision;
  const action = testCase.actualDecision === "REDACT"
    ? "redact"
    : testCase.actualDecision === "TRANSFORM"
      ? "rewrite"
      : testCase.actualDecision === "ALLOW"
        ? "pass"
        : "reject";
  const stage = testCase.risk === "prompt_injection" || testCase.risk === "pii"
    ? "deterministic"
    : testCase.risk === "automated_reasoning"
      ? "deep_judge"
      : "fast_semantic";
  const latencyMs = 18 + index * 13;
  return {
    caseId: testCase.id,
    name: testCase.name,
    risk: testCase.risk,
    expectedDecision: testCase.expectedDecision,
    actualDecision: testCase.actualDecision,
    passed,
    stageReached: stage,
    latencyMs,
    reason: passed
      ? "Actual decision matched the reviewed expectation."
      : "Actual decision differed from the reviewed expectation.",
    phase: testCase.phase,
    inputContent: testCase.content,
    action,
    outputContent: testCase.actualDecision === "BLOCK"
      ? "Request blocked before model execution."
      : testCase.actualDecision === "REDACT"
        ? "Sensitive content replaced with [REDACTED]."
        : "Simulated response completed.",
    findings: testCase.actualDecision === "ALLOW" ? [] : [{
      risk: testCase.risk,
      verdict: testCase.actualDecision.toLowerCase(),
      confidence: 0.96,
      evidence: "Deterministic mock evidence matched the configured control.",
      recommendedAction: action,
      replacement: testCase.actualDecision === "REDACT" ? "[REDACTED]" : null,
    }],
    trace: [
      { id: `${testCase.id}-scope`, kind: "routing", name: "Resolve traffic scope", status: "completed", stage: "scope", detail: "Applicable Guardrail draft resolved.", durationMs: 2 },
      { id: `${testCase.id}-evaluation`, kind: "evaluation", name: "Evaluate control", status: "completed", stage, detail: "Mock evaluator produced the recorded decision.", durationMs: latencyMs - 2, verdict: testCase.actualDecision.toLowerCase(), risk: testCase.risk, confidence: 0.96 },
    ],
    trustedInstruction: testCase.trustedInstruction,
    targetSource: testCase.targetSource,
    query: testCase.query,
    groundingSources: testCase.groundingSources,
    expectedReasoningResult: testCase.expectedReasoningResult,
    actualReasoningResult: testCase.expectedReasoningResult,
  };
}

export function createGuardGovernanceStore(
  initialState: GuardGovernanceState,
  options: StoreOptions = {},
): GuardGovernanceStore {
  let state = structuredClone(initialState);
  const listeners = new Set<() => void>();
  const id = options.id ?? defaultId;
  const now = options.now ?? (() => new Date().toISOString());
  const credential = options.credential ?? (() => `tlg_mock_${defaultId().replaceAll("-", "")}`);
  const emit = () => listeners.forEach((listener) => listener());
  const guardrailById = (guardrailId: string) => {
    const guardrail = state.guardrails.find((item) => item.id === guardrailId);
    if (!guardrail) throw new Error("Guardrail not found");
    return guardrail;
  };
  const audit = (
    kind: string,
    detail: string,
    context: Partial<Pick<AuditEvent, "guardrailId" | "assignmentId" | "risk" | "outcome">> = {},
  ): AuditEvent => ({
    id: id(),
    createdAt: now(),
    kind,
    outcome: context.outcome ?? "SUCCESS",
    guardrailId: context.guardrailId ?? null,
    assignmentId: context.assignmentId ?? null,
    risk: context.risk ?? null,
    detail,
  });
  const withSystemStatus = (next: GuardGovernanceState): GuardGovernanceState => ({
    ...next,
    systemStatus: {
      ...next.systemStatus,
      activeAssignments: next.assignments.filter((item) => item.enabled).length,
      onlineIntegrations: next.integrations.filter((item) => item.runtimeStatus === "online").length,
      totalIntegrations: next.integrations.length,
      status: next.integrations.some((item) => item.runtimeStatus === "degraded") ? "degraded" : "healthy",
    },
  });

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setGuardrailCoverage(guardrailId, input) {
      const guardrail = guardrailById(guardrailId);
      if (guardrail.systemManaged) {
        throw new Error("System-managed Guardrail coverage cannot be edited");
      }
      const resourceKinds = [...new Set(input.resourceKinds)];
      const directResourceIds = [...new Set(input.directResourceIds)].filter(
        (resourceId) => state.resources.some((resource) => resource.id === resourceId),
      );
      const updatedAt = now();
      const requirementId = resourceKinds.length ? id() : undefined;
      const nextRequirements = [
        ...state.coverageRequirements.filter((item) => item.guardrailId !== guardrailId),
        ...(requirementId
          ? [{
              id: requirementId,
              projectId: state.projectId,
              guardrailId,
              resourceKinds,
              enabled: true,
              systemManaged: false,
              updatedAt,
            }]
          : []),
      ];
      const requiredResourceIds = new Set(
        state.resources
          .filter((resource) => resourceKinds.includes(resource.kind))
          .map((resource) => resource.id),
      );
      const nextApplications = [
        ...state.guardrailApplications.filter((item) => item.guardrailId !== guardrailId),
        ...[...requiredResourceIds].map((resourceId) => ({
          id: id(),
          projectId: state.projectId,
          guardrailId,
          resourceId,
          source: "REQUIREMENT" as const,
          ...(requirementId ? { requirementId } : {}),
          updatedAt,
        })),
        ...directResourceIds
          .filter((resourceId) => !requiredResourceIds.has(resourceId))
          .map((resourceId) => ({
            id: id(),
            projectId: state.projectId,
            guardrailId,
            resourceId,
            source: "DIRECT" as const,
            updatedAt,
          })),
      ];
      state = {
        ...state,
        coverageRequirements: nextRequirements,
        guardrailApplications: nextApplications,
        auditEvents: [
          audit(
            "guardrail.coverage.updated",
            `${guardrail.name} coverage updated for ${nextApplications.filter((item) => item.guardrailId === guardrailId).length} resources.`,
            { guardrailId },
          ),
          ...state.auditEvents,
        ],
      };
      emit();
    },
    analyzeIntent(purpose) {
      const normalized = required(purpose, "Business purpose");
      const finance = /finance|claim|insurance/i.test(normalized);
      return {
        summary: `Structured intent derived from: ${normalized}`,
        allowedTopics: finance ? ["approved financial analysis", "policy explanation"] : ["approved customer assistance", "product guidance"],
        restrictedTopics: finance ? ["guaranteed outcomes", "unverified financial advice"] : ["credential disclosure", "unsafe instructions"],
        reviewNotes: ["Review the generated topics before creating the Guardrail."],
      };
    },
    createGuardrail(input) {
      const createdAt = now();
      const created: Guardrail = {
        id: id(),
        projectId: state.projectId,
        name: required(input.name, "Name"),
        purpose: required(input.purpose, "Purpose"),
        status: "NEEDS_TESTING",
        safetyLevel: input.safetyLevel,
        outputDelivery: input.outputDelivery,
        allowedTopics: structuredClone(input.allowedTopics),
        restrictedTopics: structuredClone(input.restrictedTopics),
        controls: structuredClone(input.controls),
        testCases: [],
        sourceTemplateId:
          input.sourceTemplateIds?.[0] ?? input.sourceTemplateId ?? null,
        sourceTemplateIds: structuredClone(
          input.sourceTemplateIds ??
            (input.sourceTemplateId ? [input.sourceTemplateId] : []),
        ),
        templateParameters: structuredClone(input.templateParameters ?? {}),
        templateParametersByTemplate: structuredClone(
          input.templateParametersByTemplate ??
            (input.sourceTemplateId
              ? { [input.sourceTemplateId]: input.templateParameters ?? {} }
              : {}),
        ),
        draftVersion: 1,
        activeVersion: null,
        assignmentCount: 0,
        testCaseCount: 0,
        testedCurrent: false,
        isDefault: false,
        systemManaged: false,
        localOnly: false,
        coverage: [],
        updatedAt: createdAt,
      };
      state = {
        ...state,
        guardrails: [created, ...state.guardrails],
        auditEvents: [audit("guardrail.created", `${created.name} created as draft.`, { guardrailId: created.id }), ...state.auditEvents],
      };
      emit();
      return created;
    },
    updateGuardrail(guardrailId, input) {
      const current = guardrailById(guardrailId);
      if (current.systemManaged) throw new Error("System-managed Guardrails cannot be edited");
      const updatedAt = now();
      const updated: Guardrail = {
        ...current,
        ...structuredClone(input),
        name: input.name === undefined ? current.name : required(input.name, "Name"),
        purpose: input.purpose === undefined ? current.purpose : required(input.purpose, "Purpose"),
        draftVersion: current.draftVersion + 1,
        testedCurrent: false,
        status: "NEEDS_TESTING",
        updatedAt,
      };
      state = {
        ...state,
        guardrails: state.guardrails.map((item) => item.id === guardrailId ? updated : item),
        auditEvents: [audit("guardrail.updated", `${updated.name} intent updated; reviewed tests are required.`, { guardrailId }), ...state.auditEvents],
      };
      emit();
      return updated;
    },
    addTestCase(guardrailId, input) {
      const current = guardrailById(guardrailId);
      if (current.systemManaged) throw new Error("System-managed Guardrails cannot be edited");
      const created: GuardrailTestCase = { ...structuredClone(input), id: id(), guardrailId };
      state = {
        ...state,
        guardrails: state.guardrails.map((item) => item.id === guardrailId ? {
          ...item,
          status: "NEEDS_TESTING",
          testedCurrent: false,
          testCases: [...item.testCases, created],
          testCaseCount: item.testCases.length + 1,
          updatedAt: now(),
        } : item),
        auditEvents: [audit("guardrail.test_case.created", `${created.name} added to reviewed cases.`, { guardrailId, risk: created.risk }), ...state.auditEvents],
      };
      emit();
      return created;
    },
    deleteTestCase(guardrailId, testCaseId) {
      const current = guardrailById(guardrailId);
      if (current.systemManaged) throw new Error("System-managed Guardrails cannot be edited");
      const found = current.testCases.find((item) => item.id === testCaseId);
      if (!found) throw new Error("Test Case not found");
      state = {
        ...state,
        guardrails: state.guardrails.map((item) => item.id === guardrailId ? {
          ...item,
          status: "NEEDS_TESTING",
          testedCurrent: false,
          testCases: item.testCases.filter((testCase) => testCase.id !== testCaseId),
          testCaseCount: Math.max(0, item.testCases.length - 1),
          updatedAt: now(),
        } : item),
        auditEvents: [audit("guardrail.test_case.deleted", `${found.name} removed from reviewed cases.`, { guardrailId, risk: found.risk }), ...state.auditEvents],
      };
      emit();
    },
    runGuardrailTest(guardrailId) {
      const current = guardrailById(guardrailId);
      if (current.systemManaged) throw new Error("Built-in Guardrails are verified by the product");
      if (!current.testCases.length) throw new Error("Add at least one Test Case before running a test");
      const createdAt = now();
      const results = current.testCases.map(resultFor);
      const passed = results.filter((item) => item.passed).length;
      const status = passed === results.length ? "PASSED" : "FAILED";
      const nextVersion = status === "PASSED"
        ? Math.max(0, ...state.versions.filter((item) => item.guardrailId === guardrailId).map((item) => item.version)) + 1
        : null;
      const runId = id();
      const run: GuardrailTestRun = {
        id: runId,
        guardrailId,
        guardrailVersion: nextVersion,
        sourceDraftVersion: current.draftVersion,
        status,
        metrics: {
          total: results.length,
          passed,
          complianceRate: Math.round((passed / results.length) * 100),
          falsePositiveRate: 0,
          falseNegativeRate: status === "PASSED" ? 0 : Math.round(((results.length - passed) / results.length) * 1000) / 10,
          deepEscalationRate: Math.round((results.filter((item) => item.stageReached === "deep_judge").length / results.length) * 1000) / 10,
          p95LatencyMs: Math.max(...results.map((item) => item.latencyMs)),
        },
        results,
        createdAt,
        caseResults: results.map((item) => ({ testCaseId: item.caseId, passed: item.passed, expectedDecision: item.expectedDecision, actualDecision: item.actualDecision })),
      };
      const generatedEvidence: EvidenceEvent[] = results.map((result, index) => ({
        id: `${id()}-${index}`,
        projectId: state.projectId,
        guardrailId,
        testRunId: runId,
        risk: result.risk,
        outcome: result.actualDecision,
        input: result.inputContent,
        output: result.outputContent,
        matchedControls: current.controls.filter((control) => control.enabled && control.risk === result.risk).map((control) => `${control.risk}:${control.action}`),
        stage: result.stageReached,
        reason: result.reason,
        durationMs: result.latencyMs,
        trace: result.trace,
        createdAt,
      }));
      const newVersion = nextVersion === null ? null : {
        guardrailId,
        version: nextVersion,
        sourceDraftVersion: current.draftVersion,
        compilerVersion: "guard-compiler/mock-2.0",
        planChecksum: `sha256:mock-${guardrailId}-${nextVersion}`,
        createdAt,
        active: true,
      };
      const coverage = current.controls.map((control) => {
        const matching = results.filter((item) => item.risk === control.risk);
        const matchingPassed = matching.filter((item) => item.passed).length;
        return { risk: control.risk, passed: matchingPassed, total: matching.length, score: matching.length ? Math.round((matchingPassed / matching.length) * 100) : null };
      });
      const testAudit = audit("guardrail.test.completed", `${current.name} tests ${status === "PASSED" ? "passed" : "failed"} at ${run.metrics.complianceRate}% compliance.`, { guardrailId, outcome: status === "PASSED" ? "SUCCESS" : "FAILED" });
      const versionAudit = newVersion ? audit("guardrail.version.created", `Guardrail Version ${newVersion.version} compiled and activated.`, { guardrailId }) : null;
      state = {
        ...state,
        guardrails: state.guardrails.map((item) => item.id === guardrailId ? {
          ...item,
          status: status === "PASSED" ? (item.assignmentCount ? "PROTECTED" : "READY") : "NEEDS_TESTING",
          latestTestRun: run,
          activeVersion: nextVersion ?? item.activeVersion,
          testedCurrent: status === "PASSED",
          coverage,
          updatedAt: createdAt,
        } : item),
        versions: newVersion
          ? [...state.versions.map((item) => item.guardrailId === guardrailId ? { ...item, active: false } : item), newVersion]
          : state.versions,
        auditEvents: [...(versionAudit ? [versionAudit] : []), testAudit, ...state.auditEvents],
        decisionEvidence: [...generatedEvidence, ...state.decisionEvidence],
        evidence: [...generatedEvidence, ...state.evidence],
      };
      emit();
      return run;
    },
    createAssignment(input) {
      const guardrail = guardrailById(input.guardrailId);
      if (!guardrail.testedCurrent || guardrail.activeVersion === null || guardrail.systemManaged) {
        throw new Error("Only tested Guardrails with an active version can be assigned");
      }
      if (!isTrafficScopeValid(input.trafficScope)) throw new Error("Traffic scope requires at least one valid rule");
      const assignmentId = id();
      const created: GuardrailAssignment = {
        ...structuredClone(input),
        id: assignmentId,
        projectId: state.projectId,
        name: required(input.name, "Name"),
        guardrailVersion: guardrail.activeVersion,
        isDefault: false,
        systemManaged: false,
        updatedAt: now(),
      };
      state = withSystemStatus({
        ...state,
        assignments: [created, ...state.assignments],
        guardrails: state.guardrails.map((item) => item.id === guardrail.id ? { ...item, assignmentCount: item.assignmentCount + 1, status: "PROTECTED" } : item),
        auditEvents: [audit("assignment.created", `${created.name} pinned to Guardrail Version ${created.guardrailVersion}.`, { guardrailId: guardrail.id, assignmentId }), ...state.auditEvents],
      });
      emit();
      return assignmentId;
    },
    toggleAssignment(assignmentId, enabled) {
      const current = state.assignments.find((item) => item.id === assignmentId);
      if (!current) throw new Error("Assignment not found");
      if (current.systemManaged) throw new Error("System-managed Assignments cannot be paused");
      state = withSystemStatus({
        ...state,
        assignments: state.assignments.map((item) => item.id === assignmentId ? { ...item, enabled, updatedAt: now() } : item),
        auditEvents: [audit("assignment.updated", `${current.name} ${enabled ? "enabled" : "paused"}.`, { guardrailId: current.guardrailId, assignmentId }), ...state.auditEvents],
      });
      emit();
    },
    registerIntegration(input) {
      if (!( ["litellm", "http", "a2a"] as const).includes(input.protocol)) throw new Error("Unsupported integration protocol");
      if (!( ["production", "staging", "development", "test"] as const).includes(input.environment)) throw new Error("Unsupported integration environment");
      const cleartext = credential();
      const integration: GuardIntegration = {
        id: id(),
        projectId: state.projectId,
        name: required(input.name, "Name"),
        description: input.description?.trim() || "Registered model gateway.",
        protocol: input.protocol,
        environment: input.environment,
        enabled: true,
        credentialPrefix: credentialPrefix(cleartext),
        verificationStatus: "waiting",
        runtimeStatus: "waiting",
        lastSeenAt: null,
        requestCount: 0,
        errorCount: 0,
        createdAt: now(),
        updatedAt: now(),
        health: "HEALTHY",
        credentialHint: credentialPrefix(cleartext),
      };
      state = withSystemStatus({
        ...state,
        integrations: [integration, ...state.integrations],
        auditEvents: [audit("integration.registered", `${integration.name} registered for ${integration.environment}.`), ...state.auditEvents],
      });
      emit();
      return { integration, credential: cleartext };
    },
    toggleIntegration(integrationId, enabled) {
      const current = state.integrations.find((item) => item.id === integrationId);
      if (!current) throw new Error("Integration not found");
      state = withSystemStatus({
        ...state,
        integrations: state.integrations.map((item) => item.id === integrationId ? {
          ...item,
          enabled,
          runtimeStatus: enabled ? "waiting" : "disabled",
          health: enabled ? "HEALTHY" : "DISABLED",
          updatedAt: now(),
        } : item),
      });
      emit();
    },
  };
}

export function readyGuardrails(state: GuardGovernanceState) {
  return state.guardrails.filter((item) => item.testedCurrent && item.activeVersion !== null && !item.systemManaged);
}

export function guardrailCoverageRows(
  state: GuardGovernanceState,
  guardrailId: string,
): GuardrailCoverageRow[] {
  const requirements = state.coverageRequirements.filter(
    (item) => item.guardrailId === guardrailId && item.enabled,
  );
  const applications = state.guardrailApplications.filter(
    (item) => item.guardrailId === guardrailId,
  );
  return state.resources.flatMap((resource) => {
    const required = requirements.some((requirement) =>
      requirement.resourceKinds.includes(resource.kind),
    );
    const application = applications.find(
      (item) => item.resourceId === resource.id,
    );
    if (!required && !application) return [];
    return [{
      resource,
      required,
      applied: Boolean(application),
      source: application?.source ?? "MISSING",
    }];
  });
}

export function effectiveEnforcements(state: GuardGovernanceState): EffectiveEnforcement[] {
  return state.assignments
    .filter((assignment) => assignment.enabled)
    .flatMap((assignment) => {
      const guardrail = state.guardrails.find((item) => item.id === assignment.guardrailId);
      if (!guardrail || !guardrail.testedCurrent || guardrail.activeVersion === null) return [];
      return [{
        assignmentId: assignment.id,
        assignmentName: assignment.name,
        guardrailId: guardrail.id,
        guardrailName: guardrail.name,
        guardrailVersion: assignment.guardrailVersion,
        priority: assignment.priority,
        trafficScope: assignment.trafficScope,
        actions: guardrail.controls.filter((control) => control.enabled).map((control) => control.action),
        isDefault: assignment.isDefault,
      }];
    })
    .sort((left, right) => left.priority - right.priority);
}

export function filterEvidence(state: GuardGovernanceState, filters: EvidenceFilters) {
  return state.decisionEvidence.filter((item) =>
    (!filters.guardrailId || item.guardrailId === filters.guardrailId) &&
    (!filters.assignmentId || item.assignmentId === filters.assignmentId) &&
    (!filters.outcome || item.outcome === filters.outcome) &&
    (!filters.risk || item.risk === filters.risk),
  );
}

export function governanceCounts(state: GuardGovernanceState) {
  return {
    guardrails: state.guardrails.length,
    assignments: state.assignments.length,
    enforcements: effectiveEnforcements(state).length,
    integrations: state.integrations.length,
    evidence: state.auditEvents.length + state.decisionEvidence.length,
  };
}
