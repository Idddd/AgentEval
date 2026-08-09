import { createFileRoute } from "@tanstack/react-router";
import { EvaluationReportDetail } from "@/features/evaluation-layer/reports/report-page";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";

export const Route = createFileRoute("/$projectId/evaluation/reports/$reportId")({ component: ReportDetailRoute });
function ReportDetailRoute() { const { reportId } = Route.useParams(); return <EvaluationLayerPageFrame title="Report detail" description="Review results, evidence, comparison, cost, and Reflection in AgentEval order."><EvaluationReportDetail reportId={reportId} /></EvaluationLayerPageFrame>; }
