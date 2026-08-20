import { createFileRoute } from "@tanstack/react-router";
import { BuildsPage } from "@/features/demo-workflow/builds/builds-page";

export const Route = createFileRoute("/$projectId/builds")({
  component: BuildsPage,
});
