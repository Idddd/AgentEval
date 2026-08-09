import { createFileRoute } from "@tanstack/react-router";
import { EvaluationCatalogPage } from "@/features/evaluation-layer/catalog/catalog-page";

export const Route = createFileRoute("/$projectId/evaluation/catalog")({
  component: EvaluationCatalogPage,
});
