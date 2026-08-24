import { describe, expect, it } from "vitest";

import { cloneGuardGovernanceFixtures } from "./fixtures";

describe("complete Guard Governance fixtures", () => {
  it("provides the linked reference scenarios used by the full UI", () => {
    const state = cloneGuardGovernanceFixtures("project-1") as unknown as Record<
      string,
      unknown
    >;

    expect(state).toHaveProperty("templates");
    expect(state).toHaveProperty("controlDefinitions");
    expect(state).toHaveProperty("versions");
    expect(state).toHaveProperty("trafficScopeFields");
    expect(state).toHaveProperty("systemStatus");
    expect(state).toHaveProperty("auditEvents");
    expect(state).toHaveProperty("decisionEvidence");
  });

  it("includes default, tested, versioned, and degraded states", () => {
    const state = cloneGuardGovernanceFixtures("project-1") as any;

    expect(
      state.guardrails.some(
        (item: any) => item.isDefault && item.systemManaged,
      ),
    ).toBe(true);
    expect(
      state.guardrails.some(
        (item: any) =>
          item.testedCurrent && item.latestTestRun?.metrics.total > 0,
      ),
    ).toBe(true);
    expect(state.versions.length).toBeGreaterThan(1);
    expect(
      state.assignments.some((item: any) => item.guardrailVersion > 0),
    ).toBe(true);
    expect(
      state.integrations.some(
        (item: any) => item.runtimeStatus === "degraded",
      ),
    ).toBe(true);
    expect(
      state.auditEvents.some(
        (item: any) => item.kind === "guardrail.version.created",
      ),
    ).toBe(true);
  });

  it("provides recursive traffic fields and both evidence concepts", () => {
    const state = cloneGuardGovernanceFixtures("project-1") as any;

    expect(
      state.trafficScopeFields.some(
        (item: any) => item.source === "jwt_claim",
      ),
    ).toBe(true);
    expect(
      state.assignments.some((item: any) =>
        item.trafficScope.rules.some((rule: any) => "rules" in rule),
      ),
    ).toBe(true);
    expect(state.auditEvents.length).toBeGreaterThan(5);
    expect(state.decisionEvidence.length).toBeGreaterThan(3);
  });
});
