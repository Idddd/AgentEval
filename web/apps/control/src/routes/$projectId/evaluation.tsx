import { Outlet, createFileRoute } from "@tanstack/react-router";
import { EvaluationLayerErrorBoundary } from "@/features/evaluation-layer/evaluation-layer-error-boundary";
import { GuardrailTestPackBridge } from "@/features/evaluation-layer/guardrail-test-pack-bridge";
import { EvaluationLayerProvider } from "@/features/evaluation-layer/mock-provider";

export const Route = createFileRoute("/$projectId/evaluation")({
  component: EvaluationLayerLayout,
});

function EvaluationLayerLayout() {
  const { projectId } = Route.useParams();
  return (
    <EvaluationLayerProvider projectId={projectId}>
      <GuardrailTestPackBridge />
      <EvaluationLayerErrorBoundary>
        <Outlet />
      </EvaluationLayerErrorBoundary>
    </EvaluationLayerProvider>
  );
}
