import { createFileRoute } from "@tanstack/react-router";
import { GuardrailImportProvider } from "@/features/guard-governance/guardrail-import/guardrail-import-provider";
import { PolicyLibraryPage } from "@/features/guard-governance/guardrail-import/policy-library";

export const Route = createFileRoute(
  "/$projectId/governance/policy-library",
)({
  component: PolicyLibraryRoute,
});

function PolicyLibraryRoute() {
  const { projectId } = Route.useParams();
  return (
    <GuardrailImportProvider projectId={projectId}>
      <PolicyLibraryPage />
    </GuardrailImportProvider>
  );
}
