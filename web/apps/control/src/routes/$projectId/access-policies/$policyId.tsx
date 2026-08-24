import { createFileRoute } from "@tanstack/react-router";

import { AccessPolicyDetail } from "@/components/access/access-policy-detail";

export const Route = createFileRoute(
  "/$projectId/access-policies/$policyId",
)({
  component: AccessPolicyDetailRoute,
});

function AccessPolicyDetailRoute() {
  const { policyId, projectId } = Route.useParams();
  return (
    <AccessPolicyDetail
      policyId={policyId}
      projectId={projectId}
    />
  );
}
