import { createFileRoute } from "@tanstack/react-router";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";
import { EvaluationSettingsPage } from "@/features/evaluation-layer/settings/settings-page";

export const Route = createFileRoute("/$projectId/evaluation/settings")({
  component: EvaluationSettings,
});

function EvaluationSettings() {
  return (
    <EvaluationLayerPageFrame title="Settings" description="Configure the frontend-only judge provider used by this mock demo.">
      <EvaluationSettingsPage />
    </EvaluationLayerPageFrame>
  );
}
