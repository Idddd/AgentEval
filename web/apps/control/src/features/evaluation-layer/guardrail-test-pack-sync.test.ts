import { describe, expect, it } from "vitest";
import { cloneGuardGovernanceFixtures } from "@/features/guard-governance/fixtures";
import { guardrailsToEvaluationTestPacks } from "./guardrail-test-pack-sync";

describe("Guardrail Test Pack sync", () => {
  it("derives selectable evaluation packs from Guardrails and their test cases", () => {
    const governance = cloneGuardGovernanceFixtures("individual");
    const packs = guardrailsToEvaluationTestPacks(
      governance.guardrails,
      governance.coverageRequirements,
    );

    expect(packs.map((pack) => pack.id)).toEqual([
      "guardrail-template:guardrail-default:R1",
      "guardrail-template:guardrail-production:R2",
      "guardrail-template:guardrail-draft:R2",
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
});
