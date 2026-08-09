import { createFileRoute, redirect } from "@tanstack/react-router";

// The standalone Trace list merged into the Overview page; keep the old URL alive.
export const Route = createFileRoute("/$projectId/evaluation/traces/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$projectId/evaluation/overview",
      params: { projectId: params.projectId },
    });
  },
});
