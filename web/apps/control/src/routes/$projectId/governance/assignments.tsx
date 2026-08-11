import { createFileRoute } from "@tanstack/react-router";
import { AssignmentsPage } from "@/features/guard-governance/assignments/assignments-page";

export const Route = createFileRoute("/$projectId/governance/assignments")({
  component: AssignmentsRoute,
});

function AssignmentsRoute() {
  return <AssignmentsPage />;
}
