import { createFileRoute } from "@tanstack/react-router";
import { GuardrailImportProvider } from "@/features/guard-governance/guardrail-import/guardrail-import-provider";
import { GuardrailDetailPage } from "@/features/guard-governance/guardrail-import/guardrails-main";

export const Route = createFileRoute(
  "/$projectId/governance/guardrails/$guardrailId",
)({ component: GuardrailDetailRoute });

function GuardrailDetailRoute() {
  const { guardrailId, projectId } = Route.useParams();
  return (
    <GuardrailImportProvider projectId={projectId}>
      <GuardrailDetailPage guardrailId={guardrailId} projectId={projectId} />
    </GuardrailImportProvider>
  );
}
