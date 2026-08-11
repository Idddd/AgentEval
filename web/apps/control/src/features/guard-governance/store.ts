import type {
  CreateAssignmentInput,
  CreateGuardrailInput,
  EffectiveEnforcement,
  EvidenceEvent,
  EvidenceFilters,
  GuardGovernanceState,
  GuardIntegration,
  Guardrail,
  GuardrailTestCase,
  GuardrailTestRun,
  RegisterIntegrationInput,
} from "./model";

type StoreOptions = {
  id?: () => string;
  now?: () => string;
  credential?: () => string;
};

export type GuardGovernanceStore = {
  getState: () => GuardGovernanceState;
  subscribe: (listener: () => void) => () => void;
  createGuardrail: (input: CreateGuardrailInput) => Guardrail;
  updateGuardrail: (
    id: string,
    input: Partial<CreateGuardrailInput>,
  ) => Guardrail;
  addTestCase: (
    guardrailId: string,
    input: Omit<GuardrailTestCase, "id">,
  ) => GuardrailTestCase;
  deleteTestCase: (guardrailId: string, testCaseId: string) => void;
  runGuardrailTest: (guardrailId: string) => GuardrailTestRun;
  createAssignment: (input: CreateAssignmentInput) => string;
  toggleAssignment: (id: string, enabled: boolean) => void;
  registerIntegration: (
    input: RegisterIntegrationInput,
  ) => { integration: GuardIntegration; credential: string };
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

function integrationHint(credential: string) {
  return `…${credential.slice(-4)}`;
}

export function createGuardGovernanceStore(
  initialState: GuardGovernanceState,
  options: StoreOptions = {},
): GuardGovernanceStore {
  let state = structuredClone(initialState);
  const listeners = new Set<() => void>();
  const id = options.id ?? defaultId;
  const now = options.now ?? (() => new Date().toISOString());
  const credential =
    options.credential ?? (() => `tlg_mock_${defaultId().replaceAll("-", "")}`);
  const emit = () => listeners.forEach((listener) => listener());
  const guardrailById = (guardrailId: string) => {
    const guardrail = state.guardrails.find((item) => item.id === guardrailId);
    if (!guardrail) throw new Error("Guardrail not found");
    return guardrail;
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    createGuardrail(input) {
      const created: Guardrail = {
        ...structuredClone(input),
        id: id(),
        projectId: state.projectId,
        name: required(input.name, "Name"),
        purpose: required(input.purpose, "Purpose"),
        status: "NEEDS_TESTING",
        testCases: [],
        updatedAt: now(),
      };
      state = { ...state, guardrails: [created, ...state.guardrails] };
      emit();
      return created;
    },
    updateGuardrail(guardrailId, input) {
      const current = guardrailById(guardrailId);
      const updated: Guardrail = {
        ...current,
        ...structuredClone(input),
        name: input.name === undefined ? current.name : required(input.name, "Name"),
        purpose:
          input.purpose === undefined
            ? current.purpose
            : required(input.purpose, "Purpose"),
        status: "NEEDS_TESTING",
        updatedAt: now(),
      };
      state = {
        ...state,
        guardrails: state.guardrails.map((item) =>
          item.id === guardrailId ? updated : item,
        ),
      };
      emit();
      return updated;
    },
    addTestCase(guardrailId, input) {
      const current = guardrailById(guardrailId);
      const created = { ...structuredClone(input), id: id() };
      state = {
        ...state,
        guardrails: state.guardrails.map((item) =>
          item.id === current.id
            ? {
                ...item,
                status: "NEEDS_TESTING",
                testCases: [...item.testCases, created],
                updatedAt: now(),
              }
            : item,
        ),
      };
      emit();
      return created;
    },
    deleteTestCase(guardrailId, testCaseId) {
      const current = guardrailById(guardrailId);
      if (!current.testCases.some((item) => item.id === testCaseId)) {
        throw new Error("Test Case not found");
      }
      state = {
        ...state,
        guardrails: state.guardrails.map((item) =>
          item.id === current.id
            ? {
                ...item,
                status: "NEEDS_TESTING",
                testCases: item.testCases.filter(
                  (testCase) => testCase.id !== testCaseId,
                ),
                updatedAt: now(),
              }
            : item,
        ),
      };
      emit();
    },
    runGuardrailTest(guardrailId) {
      const current = guardrailById(guardrailId);
      if (!current.testCases.length) {
        throw new Error("Add at least one Test Case before running a test");
      }
      const runId = id();
      const createdAt = now();
      const caseResults = current.testCases.map((testCase) => ({
        testCaseId: testCase.id,
        passed: testCase.expectedDecision === testCase.actualDecision,
        expectedDecision: testCase.expectedDecision,
        actualDecision: testCase.actualDecision,
      }));
      const status = caseResults.every((item) => item.passed)
        ? "PASSED"
        : "FAILED";
      const run: GuardrailTestRun = {
        id: runId,
        guardrailId,
        status,
        createdAt,
        caseResults,
      };
      const generatedEvidence: EvidenceEvent[] = current.testCases.map(
        (testCase, index) => ({
          id: `${id()}-${index}`,
          projectId: state.projectId,
          guardrailId,
          testRunId: runId,
          risk: testCase.risk,
          outcome: testCase.actualDecision,
          input: testCase.content,
          output:
            testCase.actualDecision === "BLOCK"
              ? "Request blocked by simulated Guardrail test."
              : "Simulated Guardrail test completed.",
          matchedControls: current.controls
            .filter((control) => control.enabled && control.risk === testCase.risk)
            .map((control) => `${control.risk}:${control.action}`),
          stage: "test_run",
          reason: caseResults[index]?.passed
            ? "Actual decision matched the expected decision."
            : "Actual decision did not match the expected decision.",
          durationMs: 20 + index * 7,
          trace: [
            {
              id: `${runId}-trace-${index}`,
              stage: "test_run",
              detail: `Evaluated ${testCase.name}.`,
              durationMs: 20 + index * 7,
            },
          ],
          createdAt,
        }),
      );
      state = {
        ...state,
        guardrails: state.guardrails.map((item) =>
          item.id === guardrailId
            ? {
                ...item,
                status: status === "PASSED" ? "READY" : "NEEDS_TESTING",
                latestTestRun: run,
                updatedAt: createdAt,
              }
            : item,
        ),
        evidence: [...generatedEvidence, ...state.evidence],
      };
      emit();
      return run;
    },
    createAssignment(input) {
      const guardrail = guardrailById(input.guardrailId);
      if (guardrail.status !== "READY") {
        throw new Error("Only Ready guardrails can be assigned");
      }
      if (
        !input.trafficScope.rules.length ||
        input.trafficScope.rules.some((rule) => !rule.value.trim())
      ) {
        throw new Error("Traffic scope requires at least one valid rule");
      }
      const assignmentId = id();
      state = {
        ...state,
        assignments: [
          {
            ...structuredClone(input),
            id: assignmentId,
            projectId: state.projectId,
            name: required(input.name, "Name"),
            updatedAt: now(),
          },
          ...state.assignments,
        ],
      };
      emit();
      return assignmentId;
    },
    toggleAssignment(assignmentId, enabled) {
      if (!state.assignments.some((item) => item.id === assignmentId)) {
        throw new Error("Assignment not found");
      }
      state = {
        ...state,
        assignments: state.assignments.map((item) =>
          item.id === assignmentId ? { ...item, enabled, updatedAt: now() } : item,
        ),
      };
      emit();
    },
    registerIntegration(input) {
      if (!(["litellm", "http", "a2a"] as const).includes(input.protocol)) {
        throw new Error("Unsupported integration protocol");
      }
      if (
        !(["production", "staging", "development", "test"] as const).includes(
          input.environment,
        )
      ) {
        throw new Error("Unsupported integration environment");
      }
      const cleartext = credential();
      const integration: GuardIntegration = {
        ...input,
        id: id(),
        projectId: state.projectId,
        name: required(input.name, "Name"),
        enabled: true,
        health: "HEALTHY",
        credentialHint: integrationHint(cleartext),
        updatedAt: now(),
      };
      state = { ...state, integrations: [integration, ...state.integrations] };
      emit();
      return { integration, credential: cleartext };
    },
    toggleIntegration(integrationId, enabled) {
      if (!state.integrations.some((item) => item.id === integrationId)) {
        throw new Error("Integration not found");
      }
      state = {
        ...state,
        integrations: state.integrations.map((item) =>
          item.id === integrationId
            ? {
                ...item,
                enabled,
                health: enabled ? "HEALTHY" : "DISABLED",
                updatedAt: now(),
              }
            : item,
        ),
      };
      emit();
    },
  };
}

export function readyGuardrails(state: GuardGovernanceState) {
  return state.guardrails.filter((item) => item.status === "READY");
}

export function effectiveEnforcements(
  state: GuardGovernanceState,
): EffectiveEnforcement[] {
  return state.assignments
    .filter((assignment) => assignment.enabled)
    .flatMap((assignment) => {
      const guardrail = state.guardrails.find(
        (item) => item.id === assignment.guardrailId,
      );
      if (!guardrail || guardrail.status !== "READY") return [];
      return [
        {
          assignmentId: assignment.id,
          assignmentName: assignment.name,
          guardrailId: guardrail.id,
          guardrailName: guardrail.name,
          priority: assignment.priority,
          trafficScope: assignment.trafficScope,
          actions: guardrail.controls
            .filter((control) => control.enabled)
            .map((control) => control.action),
        },
      ];
    })
    .sort((left, right) => left.priority - right.priority);
}

export function filterEvidence(
  state: GuardGovernanceState,
  filters: EvidenceFilters,
) {
  return state.evidence.filter(
    (item) =>
      (!filters.guardrailId || item.guardrailId === filters.guardrailId) &&
      (!filters.assignmentId ||
        item.assignmentId === filters.assignmentId) &&
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
    evidence: state.evidence.length,
  };
}
