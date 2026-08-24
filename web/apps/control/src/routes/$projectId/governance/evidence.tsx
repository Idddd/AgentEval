import { createFileRoute } from "@tanstack/react-router";
import { EvidencePage } from "@/features/guard-governance/evidence/evidence-page";

export const Route = createFileRoute("/$projectId/governance/evidence")({
  component: EvidenceRoute,
});

function EvidenceRoute() {
  return <EvidencePage />;
}
