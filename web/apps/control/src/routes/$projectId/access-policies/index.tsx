import { createFileRoute } from "@tanstack/react-router";

import { AccessPolicies } from "@/components/access/access-policies";

export const Route = createFileRoute("/$projectId/access-policies/")({
  component: AccessPoliciesRoute,
});

function AccessPoliciesRoute() {
  const { projectId } = Route.useParams();
  return <AccessPolicies projectId={projectId} />;
}
