import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { EvaluationRunDetail } from "@/features/evaluations/runs/evaluation-run-detail";

export const Route = createFileRoute(
  "/$projectId/evaluations/runs/$runId",
)({
  validateSearch: z.object({
    stage: z.enum(["setup", "evaluate", "report", "reflect", "complete"]).optional(),
  }),
  component: EvaluationRunRoute,
});

function EvaluationRunRoute() {
  const params = Route.useParams(); const { stage } = Route.useSearch(); const navigate = useNavigate();
  return <EvaluationRunDetail runId={params.runId} activeStage={stage} onStageChange={(next) => void navigate({ to: "/$projectId/evaluations/runs/$runId", params, search: { stage: next }, replace: true })} />;
}
