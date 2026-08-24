import { describe, expect, it } from "vitest";
import { cloneGuardGovernanceFixtures } from "@/features/guard-governance/fixtures";
import { guardrailsToEvaluationTestPacks } from "./guardrail-test-pack-sync";

describe("Guardrail Test Pack sync", () => {
  it("derives selectable evaluation packs from Guardrails and their test cases", () => {
    const governance = cloneGuardGovernanceFixtures("individual");
    const packs = guardrailsToEvaluationTestPacks(
      governance.guardrails,
      governance.coverageRequirements,
      governance.versions,
    );

    expect(packs.map((pack) => pack.id)).toEqual([
      "guardrail-template:guardrail-default:R1",
      "guardrail-template:guardrail-production:R2",
    ]);
    expect(packs[0]).toEqual(
      expect.objectContaining({
        sourceGuardrailId: "guardrail-default",
        sourceGuardrailRevisionId: "guardrail-default:R1",
        name: "TaskLattice Default Protection",
        version: "1",
        available: true,
        required: true,
      }),
    );
    expect(packs[0]?.cases).toHaveLength(1);
    expect(packs[1]?.sourcePolicies).toEqual([
      expect.objectContaining({
        id: "policy-prompt-injection",
        version: "1",
        name: "Prompt Injection Protection",
        testCaseCount: 1,
      }),
      expect.objectContaining({
        id: "policy-sensitive-data",
        version: "1",
        name: "Sensitive Data Protection",
        testCaseCount: 1,
      }),
      expect.objectContaining({
        id: "policy-grounded-response",
        version: "1",
        name: "Grounded Response Policy",
        testCaseCount: 1,
      }),
    ]);
    expect(packs[1]?.runtimePosture).toEqual({
      safetyLevel: "strict",
      outputDelivery: "interruptible",
    });
    expect(
      packs.find((pack) => pack.id === "guardrail-template:guardrail-production:R2")?.requiredFor,
    ).toEqual(["agent", "mcp"]);
    expect(packs[0]?.cases[0]).toEqual(
      expect.objectContaining({
        source: "guardrail:guardrail-default",
        expectedOutput: { guardrail_decision: "BLOCK" },
      }),
    );
  });

  it("keeps an immutable Policy snapshot after the live custom Policy changes", () => {
    const governance = cloneGuardGovernanceFixtures("individual");
    const release = governance.versions.find(
      (version) => version.guardrailId === "guardrail-production" && version.active,
    )!;
    governance.policies.find((policy) => policy.id === "policy-sensitive-data")!.name = "Renamed live Policy";

    const [template] = guardrailsToEvaluationTestPacks(
      governance.guardrails.filter((guardrail) => guardrail.id === "guardrail-production"),
      governance.coverageRequirements,
      governance.versions,
    );

    expect(release.policySnapshots.find((policy) => policy.policyId === "policy-sensitive-data")?.name).toBe(
      "Sensitive Data Protection",
    );
    expect(template?.sourcePolicies?.find((policy) => policy.id === "policy-sensitive-data")?.name).toBe(
      "Sensitive Data Protection",
    );
  });

  it("keeps the active release selectable while its next draft waits for re-evaluation", () => {
    const governance = cloneGuardGovernanceFixtures("individual");
    const production = governance.guardrails.find((guardrail) => guardrail.id === "guardrail-production")!;
    production.draftVersion += 1;
    production.testedCurrent = false;
    production.publishedCurrent = false;
    production.status = "NEEDS_TESTING";

    const [template] = guardrailsToEvaluationTestPacks(
      [production],
      governance.coverageRequirements,
      governance.versions,
    );

    expect(template).toEqual(expect.objectContaining({
      id: "guardrail-template:guardrail-production:R2",
      version: "2",
      sourceGuardrailRevisionId: "guardrail-production:R2",
    }));
  });
});
