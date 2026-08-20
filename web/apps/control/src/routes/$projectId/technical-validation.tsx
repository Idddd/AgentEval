import { createFileRoute } from "@tanstack/react-router";
import { TechnicalValidationPage } from "@/features/demo-workflow/validation/technical-validation-page";

export const Route = createFileRoute("/$projectId/technical-validation")({
  component: TechnicalValidationPage,
});
