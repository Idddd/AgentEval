import { Outlet, createFileRoute } from "@tanstack/react-router";
import { GuardGovernanceErrorBoundary } from "@/features/guard-governance/error-boundary";

export const Route = createFileRoute("/$projectId/governance")({
  component: GuardGovernanceLayout,
});

function GuardGovernanceLayout() {
  return (
    <GuardGovernanceErrorBoundary>
      <Outlet />
    </GuardGovernanceErrorBoundary>
  );
}
