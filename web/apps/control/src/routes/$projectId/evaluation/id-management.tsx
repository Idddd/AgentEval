import { createFileRoute } from "@tanstack/react-router";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";
import { IdManagementPage } from "@/features/evaluation-layer/targets/id-management-page";

export const Route = createFileRoute("/$projectId/evaluation/id-management")({
  component: IdManagementRoute,
});

function IdManagementRoute() {
  return (
    <EvaluationLayerPageFrame title="ID Management" description="Track target identities, ownership, submitters, and version history.">
      <IdManagementPage />
    </EvaluationLayerPageFrame>
  );
}
