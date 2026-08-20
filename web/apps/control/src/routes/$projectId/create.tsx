import { createFileRoute } from "@tanstack/react-router";
import { CreatePage } from "@/features/demo-workflow/create/create-page";

export const Route = createFileRoute("/$projectId/create")({
  component: CreatePage,
});
