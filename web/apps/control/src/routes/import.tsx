import { createFileRoute } from "@tanstack/react-router";
import { ConfigurationImportPage } from "@/features/nmgr/configuration-import-page";

export const Route = createFileRoute("/import")({
  head: () => ({ meta: [{ title: "NMGR · Configuration import" }] }),
  component: ConfigurationImportPage,
});
