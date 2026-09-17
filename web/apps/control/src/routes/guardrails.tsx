import { createFileRoute, redirect } from "@tanstack/react-router";
import { BusinessCatalog } from "@/features/business-demo/catalog";

export const Route = createFileRoute("/guardrails")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { item?: string; template?: string } => ({
    ...(typeof search.item === "string" ? { item: search.item } : {}),
  }),
  head: () => ({ meta: [{ title: "Guardrail Profiles · AI Marketplace" }] }),
  beforeLoad: ({ search }) => {
    if (search.item)
      throw redirect({
        to: "/guardrails/$guardrailId",
        params: { guardrailId: search.item },
        replace: true,
      });
  },
  component: GuardrailsRoute,
});

function GuardrailsRoute() {
  const { item } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <BusinessCatalog
      kind="guardrails"
      selectedId={item}
      onSelect={(id) => {
        if (id)
          void navigate({
            to: "/guardrails/$guardrailId",
            params: { guardrailId: id },
          });
      }}
    />
  );
}
