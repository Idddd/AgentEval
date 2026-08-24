import { createFileRoute } from "@tanstack/react-router";
import { AgentWizardEvaluatePage } from "@/features/demo-workflow/evaluate/agent-wizard-evaluate-page";

export const Route = createFileRoute("/$projectId/technical-validation")({
  component: AgentWizardEvaluatePage,
});
