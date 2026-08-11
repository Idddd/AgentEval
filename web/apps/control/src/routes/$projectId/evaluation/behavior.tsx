import { createFileRoute } from "@tanstack/react-router";
import { BehaviorPage } from "@/features/evaluation-layer/overview/behavior-page";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";

export const Route = createFileRoute("/$projectId/evaluation/behavior")({
  component: BehaviorRoute,
});

function BehaviorRoute() {
  return (
    <EvaluationLayerPageFrame title="Behavior" description="Monitor model calls, logs, and policy compliance.">
      <BehaviorPage />
    </EvaluationLayerPageFrame>
  );
}
