import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$projectId/guardrails")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$projectId/governance/guardrails",
      params: { projectId: params.projectId },
      replace: true,
    });
  },
});
