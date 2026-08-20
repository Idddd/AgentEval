import { createFileRoute } from "@tanstack/react-router";
import { BusinessEvalPage } from "@/features/demo-workflow/eval/business-eval-page";

export const Route = createFileRoute("/$projectId/evaluation/catalog")({
  component: BusinessEvalPage,
});
