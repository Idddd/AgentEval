import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute("/$projectId/governance/evidence")({
  component: EvidenceRoute,
});

function EvidenceRoute() {
  return <PageHeader title="Evidence" description="Audit decisions, matched controls, and execution traces." />;
}
