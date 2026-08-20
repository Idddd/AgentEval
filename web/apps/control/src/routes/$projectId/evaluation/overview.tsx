import { createFileRoute } from "@tanstack/react-router";
import { MonitorPage } from "@/features/demo-workflow/monitor/monitor-page";

export const monitorDescription =
  "Track adoption, business outcomes, approvals, and safety signals for this demo session.";

export const Route = createFileRoute("/$projectId/evaluation/overview")({
  component: EvaluationOverview,
});

function EvaluationOverview() {
  return <MonitorPage />;
}
