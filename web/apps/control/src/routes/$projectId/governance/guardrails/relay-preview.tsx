import { createFileRoute } from "@tanstack/react-router";

import { GuardrailImportProvider } from "@/features/guard-governance/guardrail-import/guardrail-import-provider";
import { RelayGuardrailPreviewPage } from "@/features/guard-governance/relay-runtime/relay-guardrail-preview";

export const Route = createFileRoute(
  "/$projectId/governance/guardrails/relay-preview",
)({
  component: RelayGuardrailPreviewRoute,
});

function RelayGuardrailPreviewRoute() {
  const { projectId } = Route.useParams();
  return (
    <GuardrailImportProvider projectId={projectId}>
      <RelayGuardrailPreviewPage projectId={projectId} />
    </GuardrailImportProvider>
  );
}
