import { createFileRoute } from "@tanstack/react-router";
import { BuildWorkspacePage } from "@/features/demo-workflow/build/build-workspace-page";

function LegacyBuildsRoute() {
  return <BuildWorkspacePage initialTab="builds" />;
}

export const Route = createFileRoute("/$projectId/builds")({
  component: LegacyBuildsRoute,
});
