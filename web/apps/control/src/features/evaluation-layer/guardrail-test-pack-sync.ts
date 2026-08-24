import type {
  Guardrail,
  GuardrailCoverageRequirement,
  GuardrailVersion,
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

export function guardrailTemplateRevisionId(guardrail: Guardrail) {
  return `${guardrail.id}:R${guardrail.activeVersion ?? guardrail.draftVersion}`;
}

export function guardrailTemplateId(guardrail: Guardrail) {
  return `guardrail-template:${guardrailTemplateRevisionId(guardrail)}`;
}

export function guardrailsToEvaluationTestPacks(
  guardrails: Guardrail[],
  requirements: GuardrailCoverageRequirement[] = [],
  versions: GuardrailVersion[] = [],
): EvaluationLayerGuardrailTemplate[] {
  return guardrails
    .filter(
      (guardrail) =>
        guardrail.status !== "DISABLED" &&
        guardrail.activeVersion !== null &&
        versions.some(
          (version) =>
            version.guardrailId === guardrail.id &&
            version.version === guardrail.activeVersion &&
            version.active,
        ),
    )
    .map((guardrail) => {
      const release = versions.find(
        (version) =>
          version.guardrailId === guardrail.id &&
          version.version === guardrail.activeVersion &&
          version.active,
      )!;
      const revisionId = `${guardrail.id}:R${release.version}`;
      const templateId = `guardrail-template:${revisionId}`;
      const requiredFor: EvaluationLayerTargetKind[] = requirements
        .filter(
          (requirement) =>
            requirement.guardrailId === guardrail.id && requirement.enabled,
        )
        .flatMap((requirement) => requirement.resourceKinds);
      return {
        id: templateId,
        sourceGuardrailId: guardrail.id,
        sourceGuardrailRevisionId: revisionId,
        name: guardrail.name,
        description: guardrail.purpose,
        version: String(release.version),
        sourcePolicies: release.policySnapshots.map((policy) => ({
          id: policy.policyId,
          version: policy.policyVersion,
          name: policy.name,
          description: policy.description,
          ruleCount: policy.ruleCount,
          testCaseCount: policy.testCaseCount,
        })),
        runtimePosture: {
          safetyLevel: release.safetyLevel,
          outputDelivery: release.outputDelivery,
        },
        applicableTargetKinds: [...ALL_TARGET_KINDS],
        defaultFor:
          guardrail.isDefault || guardrail.status === "PROTECTED"
            ? [...ALL_TARGET_KINDS]
            : [],
        required: guardrail.isDefault,
        requiredFor: [...new Set(requiredFor)],
        available: true,
        cases: release.testCases.map((testCase) => ({
          id: `${templateId}:${testCase.id}`,
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
            sourceGuardrailRevisionId: revisionId,
            sourceTestCaseId: testCase.id,
            sourcePolicyId: testCase.sourcePolicyId,
            sourcePolicyVersion: testCase.sourcePolicyVersion,
            actualDecision: testCase.actualDecision,
          },
        })),
      };
    });
}
