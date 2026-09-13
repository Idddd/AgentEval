import { createFileRoute } from "@tanstack/react-router";
import {
  GuardrailsPage,
  GuardrailDetailPage,
} from "@/features/guard-governance/guardrail-import/guardrails-main";

export const Route = createFileRoute("/guardrails")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { item?: string; template?: string } => ({
    ...(typeof search.item === "string" ? { item: search.item } : {}),
  }),
  head: () => ({ meta: [{ title: "Guardrails · AI Marketplace" }] }),
  component: GuardrailsRoute,
});

function GuardrailsRoute() {
  const { item } = Route.useSearch();
  return item ? (
    <GuardrailDetailPage projectId="individual" guardrailId={item} />
  ) : (
    <GuardrailsPage projectId="individual" />
  );
}
