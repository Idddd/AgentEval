import { createFileRoute } from "@tanstack/react-router";
import { GuardrailDetails } from "@/features/business-demo/guardrail-detail";

export const Route = createFileRoute("/guardrails_/$guardrailId")({
  head: () => ({ meta: [{ title: "Profile detail" }] }),
  component: GuardrailDetailRoute,
});

function GuardrailDetailRoute() {
  const { guardrailId } = Route.useParams();
  return <GuardrailDetails id={guardrailId} />;
}
