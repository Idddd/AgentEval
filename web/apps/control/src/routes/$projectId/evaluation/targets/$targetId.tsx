import { createFileRoute } from "@tanstack/react-router";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";
import { EvaluationTargetDetail } from "@/features/evaluation-layer/targets/target-pages";

export const Route = createFileRoute("/$projectId/evaluation/targets/$targetId")({
  component: EvaluationTargetDetailRoute,
});

function EvaluationTargetDetailRoute() {
  const { targetId } = Route.useParams();
  return (
    <EvaluationLayerPageFrame title="Agent detail" description="Inspect immutable Agent revisions, evaluation quality, cost, and Report history.">
      <EvaluationTargetDetail targetId={targetId} />
    </EvaluationLayerPageFrame>
  );
}
