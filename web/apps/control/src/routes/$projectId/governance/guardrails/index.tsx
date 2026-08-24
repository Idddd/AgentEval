import { createFileRoute } from "@tanstack/react-router";
import { GuardrailImportProvider } from "@/features/guard-governance/guardrail-import/guardrail-import-provider";
import { GuardrailsPage } from "@/features/guard-governance/guardrail-import/guardrails-main";

export const Route = createFileRoute("/$projectId/governance/guardrails/")({
  component: GuardrailsRoute,
});

function GuardrailsRoute() {
  const { projectId } = Route.useParams();
  return (
    <GuardrailImportProvider projectId={projectId}>
      <GuardrailsPage projectId={projectId} />
    </GuardrailImportProvider>
  );
}
