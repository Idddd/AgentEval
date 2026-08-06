import { createFileRoute } from "@tanstack/react-router";
import { EvaluationDatasetDetail } from "@/features/evaluation-layer/datasets/dataset-pages";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";

export const Route = createFileRoute("/$projectId/evaluation/datasets/$datasetId")({ component: DatasetDetailRoute });

function DatasetDetailRoute() {
  const { datasetId } = Route.useParams();
  return <EvaluationLayerPageFrame title="Test Case detail" description="Manage draft Cases, schema, immutable revisions, and Evaluation history."><EvaluationDatasetDetail datasetId={datasetId} /></EvaluationLayerPageFrame>;
}
