import { createFileRoute } from "@tanstack/react-router";
import { ReportDetail } from "@/features/evaluations/reports/report-detail";

export const Route = createFileRoute(
  "/$projectId/evaluations/reports/$reportId",
)({
  component: ReportDetailRoute,
});

function ReportDetailRoute() {
  const { reportId } = Route.useParams();
  return <ReportDetail reportId={reportId} />;
}
