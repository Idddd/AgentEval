import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute("/$projectId/governance/integrations")({
  component: IntegrationsRoute,
});

function IntegrationsRoute() {
  return <PageHeader title="Integrations" description="Connect model gateways to Guard Governance." />;
}
