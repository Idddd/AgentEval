import { createFileRoute } from "@tanstack/react-router";
import { BehaviorPage } from "@/features/evaluation-layer/overview/behavior-page";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";

export const Route = createFileRoute("/$projectId/evaluation/behavior")({
  component: BehaviorRoute,
});

function BehaviorRoute() {
  return (
    <EvaluationLayerPageFrame title="Behavior" description="Observe live behavior, emerging risks, alerts, and operating health.">
      <BehaviorPage />
    </EvaluationLayerPageFrame>
  );
}
