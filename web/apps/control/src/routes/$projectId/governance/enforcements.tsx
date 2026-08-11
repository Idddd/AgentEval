import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute("/$projectId/governance/enforcements")({
  component: EnforcementsRoute,
});

function EnforcementsRoute() {
  return <PageHeader title="Enforcements" description="Review the effective policy execution order." />;
}
