import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute("/$projectId/governance/assignments")({
  component: AssignmentsRoute,
});

function AssignmentsRoute() {
  return <PageHeader title="Assignments" description="Bind tested Guardrails to matching traffic." />;
}
