import { Outlet, createFileRoute } from "@tanstack/react-router";
import { EvaluationLayerErrorBoundary } from "@/features/evaluation-layer/evaluation-layer-error-boundary";

export const Route = createFileRoute("/$projectId/evaluation")({
  component: EvaluationLayerLayout,
});

function EvaluationLayerLayout() {
  return (
    <EvaluationLayerErrorBoundary>
      <Outlet />
    </EvaluationLayerErrorBoundary>
  );
}
