import { createFileRoute } from "@tanstack/react-router";
import { PolicyLibraryPage } from "@/features/guard-governance/guardrail-import/policy-library";
import { validateMarketplaceSearch } from "@/features/marketplace/catalog";

export const Route = createFileRoute("/templates")({
  validateSearch: validateMarketplaceSearch,
  head: () => ({ meta: [{ title: "Templates · AI Marketplace" }] }),
  component: () => <PolicyLibraryPage title="Templates" />,
});
