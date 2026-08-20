import { EvaluationCatalogPage } from "@/features/evaluation-layer/catalog/catalog-page";
import { useBuildEvaluationBridge } from "../provider";

export function AgentWizardEvaluatePage() {
  const bridge = useBuildEvaluationBridge();

  return (
    <EvaluationCatalogPage
      isAdminEvalEligible={(targetRevisionId) => bridge.isAdminEvalEligible(targetRevisionId)}
      onSubmitToAdminEval={(targetRevisionId) => bridge.submitToAdminEval(targetRevisionId)}
    />
  );
}
