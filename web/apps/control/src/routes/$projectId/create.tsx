import { createFileRoute } from "@tanstack/react-router";
import { BuildWorkspacePage } from "@/features/demo-workflow/build/build-workspace-page";

export const Route = createFileRoute("/$projectId/create")({
  component: BuildWorkspacePage,
});
