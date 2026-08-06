import { createFileRoute } from "@tanstack/react-router";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";
import { EvaluationTraceDetail } from "@/features/evaluation-layer/traces/trace-pages";

export const Route = createFileRoute("/$projectId/evaluation/traces/$traceId")({ component: TraceDetailRoute });
function TraceDetailRoute() { const { traceId } = Route.useParams(); return <EvaluationLayerPageFrame title="Trace detail" description="Inspect the selected Trace and its evaluation observations."><EvaluationTraceDetail traceId={traceId} /></EvaluationLayerPageFrame>; }
