import { createFileRoute } from "@tanstack/react-router";
import { EnforcementsPage } from "@/features/guard-governance/enforcements/enforcements-page";

export const Route = createFileRoute("/$projectId/governance/enforcements")({
  component: EnforcementsRoute,
});

function EnforcementsRoute() {
  return <EnforcementsPage />;
}
