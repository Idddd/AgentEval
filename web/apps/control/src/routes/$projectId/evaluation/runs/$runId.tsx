import { createFileRoute } from "@tanstack/react-router";
import { EvaluationRunDetail } from "@/features/evaluation-layer/runs/run-pages";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";

export const Route = createFileRoute("/$projectId/evaluation/runs/$runId")({ component: RunDetailRoute });
function RunDetailRoute() { const { runId } = Route.useParams(); return <EvaluationLayerPageFrame title="Evaluation detail" description="Advance one mock Case at a time, then open the immutable Report."><EvaluationRunDetail runId={runId} /></EvaluationLayerPageFrame>; }
