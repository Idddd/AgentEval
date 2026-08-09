import { createFileRoute } from "@tanstack/react-router";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";
import { EvaluationRunList } from "@/features/evaluation-layer/runs/run-pages";

export const Route = createFileRoute("/$projectId/evaluation/runs/")({
  component: EvaluationRuns,
});

function EvaluationRuns() {
  return (
    <EvaluationLayerPageFrame title="Evaluation" description="Run a version-pinned Agent evaluation and review live mock progress.">
      <EvaluationRunList />
    </EvaluationLayerPageFrame>
  );
}
