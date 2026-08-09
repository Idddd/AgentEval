import { createFileRoute } from "@tanstack/react-router";
import { GuardrailsPage } from "@/features/guardrails/guardrails-page";

export const Route = createFileRoute("/$projectId/guardrails")({
  component: GuardrailsPage,
});
