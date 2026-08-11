import { Outlet, createFileRoute } from "@tanstack/react-router";
import { GuardGovernanceErrorBoundary } from "@/features/guard-governance/error-boundary";
import { GuardGovernanceProvider } from "@/features/guard-governance/mock-provider";

export const Route = createFileRoute("/$projectId/governance")({
  component: GuardGovernanceLayout,
});

function GuardGovernanceLayout() {
  const { projectId } = Route.useParams();
  return (
    <GuardGovernanceProvider projectId={projectId}>
      <GuardGovernanceErrorBoundary>
        <Outlet />
      </GuardGovernanceErrorBoundary>
    </GuardGovernanceProvider>
  );
}
