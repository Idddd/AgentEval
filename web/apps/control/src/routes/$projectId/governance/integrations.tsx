import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPage } from "@/features/guard-governance/integrations/integrations-page";

export const Route = createFileRoute("/$projectId/governance/integrations")({
  component: IntegrationsRoute,
});

function IntegrationsRoute() {
  return <IntegrationsPage />;
}
