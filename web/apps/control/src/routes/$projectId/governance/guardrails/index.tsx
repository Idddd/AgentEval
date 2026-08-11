import { createFileRoute } from "@tanstack/react-router";
import { GuardrailsPage } from "@/features/guard-governance/guardrails/guardrails-page";

export const Route = createFileRoute(
  "/$projectId/governance/guardrails/",
)({ component: GuardrailsRoute });

function GuardrailsRoute() {
  const { projectId } = Route.useParams();
  return <GuardrailsPage projectId={projectId} />;
}
