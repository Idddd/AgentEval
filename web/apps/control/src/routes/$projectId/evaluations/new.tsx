import { createFileRoute } from "@tanstack/react-router";
import { EvaluationSetup } from "@/features/evaluations/runs/evaluation-setup";

export const Route = createFileRoute("/$projectId/evaluations/new")({
  component: EvaluationSetup,
});
