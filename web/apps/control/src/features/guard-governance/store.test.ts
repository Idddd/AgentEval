import { describe, expect, it } from "vitest";
import { cloneGuardGovernanceFixtures } from "./fixtures";
import {
  createGuardGovernanceStore,
  effectiveEnforcements,
  filterEvidence,
} from "./store";

describe("Guard Governance store", () => {
  it("rejects an assignment until its Guardrail has a passing test", () => {
    const store = createGuardGovernanceStore(
      cloneGuardGovernanceFixtures("individual"),
    );

    expect(() =>
      store.createAssignment({
        name: "Finance traffic",
        guardrailId: "guardrail-draft",
        priority: 20,
        enabled: true,
        trafficScope: {
          combinator: "and",
          rules: [
            {
              field: "environment",
              operator: "equals",
              value: "production",
            },
          ],
        },
      }),
    ).toThrow("Only Ready guardrails can be assigned");
  });

  it("marks a Guardrail Ready and appends Evidence after a passing run", () => {
    const store = createGuardGovernanceStore(
      cloneGuardGovernanceFixtures("individual"),
      {
        id: () => "generated-id",
        now: () => "2026-08-11T08:00:00.000Z",
      },
    );
    const before = store.getState().evidence.length;

    const result = store.runGuardrailTest("guardrail-draft");

    expect(result.status).toBe("PASSED");
    expect(
      store
        .getState()
        .guardrails.find((item) => item.id === "guardrail-draft")?.status,
    ).toBe("READY");
    expect(store.getState().evidence).toHaveLength(
      before + result.caseResults.length,
    );
  });

  it("derives enabled Enforcements in ascending priority order", () => {
    const store = createGuardGovernanceStore(
      cloneGuardGovernanceFixtures("individual"),
    );

    expect(
      effectiveEnforcements(store.getState()).map(
        (item) => item.assignmentId,
      ),
    ).toEqual(["assignment-production", "assignment-support"]);
  });

  it("returns a registration Credential without retaining its cleartext value", () => {
    const store = createGuardGovernanceStore(
      cloneGuardGovernanceFixtures("individual"),
      {
        id: () => "integration-new",
        credential: () => "tlg_mock_secret",
      },
    );

    const result = store.registerIntegration({
      name: "Gateway",
      protocol: "litellm",
      environment: "staging",
    });

    expect(result.credential).toBe("tlg_mock_secret");
    expect(
      store
        .getState()
        .integrations.find((item) => item.id === "integration-new")
        ?.credentialHint,
    ).toBe("…cret");
    expect(JSON.stringify(store.getState())).not.toContain("tlg_mock_secret");
  });

  it("filters Evidence by every supported dimension", () => {
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
