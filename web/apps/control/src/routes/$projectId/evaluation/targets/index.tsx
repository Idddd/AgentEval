import { createFileRoute } from "@tanstack/react-router";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";
import { EvaluationTargetList } from "@/features/evaluation-layer/targets/target-pages";

export const Route = createFileRoute("/$projectId/evaluation/targets/")({
  component: EvaluationTargets,
});

function EvaluationTargets() {
  return (
    <EvaluationLayerPageFrame title="Agent" description="Configure the Agent revisions evaluated by this frontend-only demo.">
      <EvaluationTargetList />
    </EvaluationLayerPageFrame>
  );
}
