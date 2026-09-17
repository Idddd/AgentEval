import { createFileRoute } from "@tanstack/react-router";
import { BusinessCatalog } from "@/features/business-demo/catalog";

export const Route = createFileRoute("/policies")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { item?: string; version?: number | string } => ({
    ...(typeof search.item === "string" ? { item: search.item } : {}),
    ...(typeof search.version === "string" && search.version.length > 0
      ? { version: search.version }
      : Number.isInteger(search.version) && Number(search.version) > 0
        ? { version: Number(search.version) }
        : {}),
  }),
  head: () => ({ meta: [{ title: "Policies · AI Marketplace" }] }),
  component: PoliciesRoute,
});

function PoliciesRoute() {
  const { item, version } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <BusinessCatalog
      kind="policies"
      selectedId={item}
      selectedVersion={version}
      onVersionChange={(nextVersion) =>
        void navigate({
          search: { ...(item ? { item } : {}), version: nextVersion },
          resetScroll: false,
        })
      }
      onSelect={(id) => void navigate({ search: id ? { item: id } : {} })}
    />
  );
}
