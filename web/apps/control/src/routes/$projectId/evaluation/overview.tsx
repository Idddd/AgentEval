import { createFileRoute } from "@tanstack/react-router";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";
import { EvaluationOverviewPage } from "@/features/evaluation-layer/overview/overview-page";

export const productionMonitoringDescription =
  "Track live traffic telemetry to detect response quality and alert.";

export const Route = createFileRoute("/$projectId/evaluation/overview")({
  component: EvaluationOverview,
});

function EvaluationOverview() {
  return (
    <EvaluationLayerPageFrame title="Production Monitoring" description={productionMonitoringDescription}>
      <EvaluationOverviewPage />
    </EvaluationLayerPageFrame>
  );
}
