import { createFileRoute } from "@tanstack/react-router";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";
import { EvaluationDatasetList } from "@/features/evaluation-layer/datasets/dataset-pages";

export const Route = createFileRoute("/$projectId/evaluation/datasets/")({
  component: EvaluationDatasets,
});

function EvaluationDatasets() {
  return (
    <EvaluationLayerPageFrame title="Test Case" description="Build versioned evaluation cases with deterministic mock data.">
      <EvaluationDatasetList />
    </EvaluationLayerPageFrame>
  );
}
