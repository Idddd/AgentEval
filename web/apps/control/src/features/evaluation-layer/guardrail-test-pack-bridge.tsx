import { useEffect, useMemo } from "react";
import { useGuardGovernanceState } from "@/features/guard-governance/mock-provider";
import { guardrailsToEvaluationTestPacks } from "./guardrail-test-pack-sync";
import { useEvaluationLayerStore } from "./mock-provider";

/** Keeps Evaluation's selectable packs aligned with the Guardrails registry. */
export function GuardrailTestPackBridge() {
  const { guardrails, coverageRequirements } = useGuardGovernanceState();
  const evaluationStore = useEvaluationLayerStore();
  const testPacks = useMemo(
    () => guardrailsToEvaluationTestPacks(guardrails, coverageRequirements),
    [coverageRequirements, guardrails],
  );

  useEffect(() => {
    evaluationStore.syncGuardrailTemplates(testPacks);
  }, [evaluationStore, testPacks]);

  return null;
}
