import { createFileRoute } from "@tanstack/react-router";
import { MonitorPage } from "@/features/demo-workflow/monitor/monitor-page";

export const monitorDescription =
  "Track live Agent traffic, quality, safety, latency, and cost with configurable evaluator policy.";

export const Route = createFileRoute("/$projectId/evaluation/overview")({
  component: EvaluationOverview,
});

function EvaluationOverview() {
  return <MonitorPage />;
}
