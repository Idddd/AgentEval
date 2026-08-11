import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute(
  "/$projectId/governance/guardrails/",
)({ component: GuardrailsRoute });

function GuardrailsRoute() {
  return <PageHeader title="Guardrails" description="Define and test model I/O safety controls." />;
}
