import type {
  Guardrail,
  GuardrailCoverageRequirement,
} from "@/features/guard-governance/model";
import type {
  EvaluationLayerGuardrailTemplate,
  EvaluationLayerTargetKind,
} from "./model";

const ALL_TARGET_KINDS: EvaluationLayerTargetKind[] = [
  "agent",
  "mcp",
  "kb",
  "skill",
  "guardrail",
];

export function guardrailsToEvaluationTestPacks(
  guardrails: Guardrail[],
  requirements: GuardrailCoverageRequirement[] = [],
): EvaluationLayerGuardrailTemplate[] {
  return guardrails
    .filter(
      (guardrail) =>
        guardrail.status !== "DISABLED" && guardrail.testCases.length > 0,
    )
    .map((guardrail) => {
      const requiredFor: EvaluationLayerTargetKind[] = requirements
        .filter(
          (requirement) =>
            requirement.guardrailId === guardrail.id && requirement.enabled,
        )
        .flatMap((requirement) => requirement.resourceKinds);
      return {
        id: guardrail.id,
        sourceGuardrailId: guardrail.id,
        name: guardrail.name,
        description: guardrail.purpose,
        version: String(guardrail.activeVersion ?? guardrail.draftVersion),
        applicableTargetKinds: [...ALL_TARGET_KINDS],
        defaultFor:
          guardrail.isDefault || guardrail.status === "PROTECTED"
            ? [...ALL_TARGET_KINDS]
            : [],
        required: guardrail.isDefault,
        requiredFor: [...new Set(requiredFor)],
        available: true,
        cases: guardrail.testCases.map((testCase) => ({
          id: `${guardrail.id}:${testCase.id}`,
          input: {
            prompt: testCase.content,
            phase: testCase.phase,
            target_source: testCase.targetSource,
            trusted_instruction: testCase.trustedInstruction,
            query: testCase.query,
            grounding_sources: testCase.groundingSources,
          },
          expectedOutput: {
            guardrail_decision: testCase.expectedDecision,
          },
          tags: [
            "guardrail-test-pack",
            testCase.risk,
            testCase.phase,
            testCase.origin,
          ],
          source: `guardrail:${guardrail.id}`,
          metadata: {
            sourceGuardrailId: guardrail.id,
            sourceTestCaseId: testCase.id,
            actualDecision: testCase.actualDecision,
          },
        })),
      };
    });
}
