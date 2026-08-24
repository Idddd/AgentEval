import { createFileRoute } from "@tanstack/react-router";
import { BusinessEvalPage } from "@/features/demo-workflow/eval/business-eval-page";
import { AgentWizardEvaluatePage } from "@/features/demo-workflow/evaluate/agent-wizard-evaluate-page";
import { useDemoRole } from "@/hooks/use-demo-role";

function EvaluationCatalogRoutePage() {
  const { persona } = useDemoRole();
  return persona === "agent-wizard"
    ? <AgentWizardEvaluatePage />
    : <BusinessEvalPage />;
}

export const Route = createFileRoute("/$projectId/evaluation/catalog")({
  component: EvaluationCatalogRoutePage,
});
