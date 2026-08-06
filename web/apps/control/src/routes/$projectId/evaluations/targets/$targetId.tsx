import { createFileRoute } from "@tanstack/react-router";
import { TargetDetail } from "@/features/evaluations/targets/target-detail";

export const Route = createFileRoute(
  "/$projectId/evaluations/targets/$targetId",
)({
  component: TargetDetailRoute,
});

function TargetDetailRoute() {
  const { targetId } = Route.useParams();
  return <TargetDetail targetId={targetId} />;
}
