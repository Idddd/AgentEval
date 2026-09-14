import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateMarketplaceSearch } from "@/features/marketplace/catalog";

export const Route = createFileRoute("/templates")({
  validateSearch: validateMarketplaceSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/policies",
      search: search.item ? { item: search.item } : {},
      replace: true,
    });
  },
});
