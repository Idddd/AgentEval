import { createFileRoute } from "@tanstack/react-router";
import { GuardrailDetailPage } from "@/features/guard-governance/guardrails/guardrail-detail-page";

export const Route = createFileRoute(
  "/$projectId/governance/guardrails/$guardrailId",
)({ component: GuardrailDetailRoute });

function GuardrailDetailRoute() {
  const { guardrailId, projectId } = Route.useParams();
  return <GuardrailDetailPage guardrailId={guardrailId} projectId={projectId} />;
}
