import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$projectId/evaluation/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$projectId/evaluation/targets",
      params: { projectId: params.projectId },
    });
  },
});
