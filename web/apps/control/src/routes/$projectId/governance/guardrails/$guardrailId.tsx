import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute(
  "/$projectId/governance/guardrails/$guardrailId",
)({ component: GuardrailDetailRoute });

function GuardrailDetailRoute() {
  const { guardrailId } = Route.useParams();
  return <PageHeader title="Guardrail detail" description={guardrailId} />;
}
