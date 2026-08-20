import { describe, expect, it } from "vitest";
import { cloneGuardGovernanceFixtures } from "./fixtures";
import {
  createGuardGovernanceStore,
  effectiveEnforcements,
  filterEvidence,
  guardrailCoverageRows,
} from "./store";

describe("Guard Governance store", () => {
  it("shows coverage gaps and applies type requirements to current resources", () => {
    const store = createGuardGovernanceStore(
      cloneGuardGovernanceFixtures("individual"),
      { id: (() => { let value = 0; return () => `coverage-${value++}`; })() },
    );

    expect(
      guardrailCoverageRows(store.getState(), "guardrail-production")
        .filter((row) => !row.applied)
        .map((row) => row.resource.name),
    ).toEqual(["Customer Service"]);

    store.setGuardrailCoverage("guardrail-production", {
      resourceKinds: ["agent", "mcp"],
      directResourceIds: ["demo-policy-kb"],
    });

    const rows = guardrailCoverageRows(store.getState(), "guardrail-production");
    expect(rows.filter((row) => !row.applied)).toEqual([]);
    expect(rows.find((row) => row.resource.id === "demo-policy-kb")?.source).toBe("DIRECT");
  });

  it("rejects an assignment until its Guardrail has an active tested version", () => {
    const store = createGuardGovernanceStore(cloneGuardGovernanceFixtures("individual"));

    expect(() =>
      store.createAssignment({
        name: "Finance traffic",
        guardrailId: "guardrail-draft",
        priority: 20,
        enabled: true,
        trafficScope: {
          combinator: "and",
          rules: [{ field: "environment", operator: "equals", value: "production" }],
        },
      }),
    ).toThrow("Only tested Guardrails with an active version can be assigned");
  });

  it("creates an immutable version and audit events after a passing run", () => {
    const store = createGuardGovernanceStore(
      cloneGuardGovernanceFixtures("individual"),
      { id: () => "generated-id", now: () => "2026-08-11T08:00:00.000Z" },
    );
    const beforeVersions = store.getState().versions.length;
    const beforeAudit = store.getState().auditEvents.length;

    const result = store.runGuardrailTest("guardrail-production");

    expect(result.status).toBe("PASSED");
    expect(result.metrics).toMatchObject({ total: 5, passed: 5, complianceRate: 100 });
    expect(store.getState().versions).toHaveLength(beforeVersions + 1);
    expect(store.getState().auditEvents).toHaveLength(beforeAudit + 2);
    expect(store.getState().auditEvents[0]?.kind).toBe("guardrail.version.created");
    expect(
      store.getState().guardrails.find((item) => item.id === "guardrail-production")
        ?.activeVersion,
    ).toBe(3);
  });

  it("increments the draft and invalidates readiness after an edit", () => {
    const store = createGuardGovernanceStore(cloneGuardGovernanceFixtures("individual"));

    store.updateGuardrail("guardrail-production", { purpose: "Updated reviewed purpose" });

    const guardrail = store.getState().guardrails.find((item) => item.id === "guardrail-production");
    expect(guardrail).toMatchObject({ draftVersion: 3, testedCurrent: false, status: "NEEDS_TESTING" });
    expect(store.getState().auditEvents[0]?.kind).toBe("guardrail.updated");
  });

  it("rejects changes to system-managed baselines", () => {
    const store = createGuardGovernanceStore(cloneGuardGovernanceFixtures("individual"));

    expect(() => store.updateGuardrail("guardrail-default", { name: "Changed" })).toThrow(
      "System-managed Guardrails cannot be edited",
    );
    expect(() => store.toggleAssignment("assignment-default", false)).toThrow(
      "System-managed Assignments cannot be paused",
    );
  });

  it("derives enabled Enforcements in ascending priority order", () => {
    const store = createGuardGovernanceStore(cloneGuardGovernanceFixtures("individual"));

    expect(effectiveEnforcements(store.getState()).map((item) => item.assignmentId)).toEqual([
      "assignment-production",
      "assignment-support",
      "assignment-default",
    ]);
  });

  it("returns a one-time Credential without retaining its cleartext value", () => {
    const store = createGuardGovernanceStore(
      cloneGuardGovernanceFixtures("individual"),
      { id: () => "integration-new", credential: () => "tlg_mock_secret" },
    );

    const result = store.registerIntegration({
      name: "Gateway",
      protocol: "litellm",
      environment: "staging",
    });

    expect(result.credential).toBe("tlg_mock_secret");
    expect(
      store.getState().integrations.find((item) => item.id === "integration-new")
        ?.credentialPrefix,
    ).toBe("tlg_…cret");
    expect(JSON.stringify(store.getState())).not.toContain("tlg_mock_secret");
    expect(store.getState().auditEvents[0]?.kind).toBe("integration.registered");
  });

  it("filters Decision Evidence by every supported dimension", () => {
    const state = cloneGuardGovernanceFixtures("individual");

    expect(
      filterEvidence(state, {
        guardrailId: "guardrail-production",
        assignmentId: "assignment-production",
        outcome: "BLOCK",
        risk: "prompt_injection",
      }).map((item) => item.id),
    ).toEqual(["evidence-prompt-injection"]);
  });
});
