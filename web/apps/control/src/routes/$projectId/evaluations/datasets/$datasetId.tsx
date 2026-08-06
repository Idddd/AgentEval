import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DatasetDetail } from "@/features/evaluations/datasets/dataset-detail";

export const Route = createFileRoute(
  "/$projectId/evaluations/datasets/$datasetId",
)({
  validateSearch: z.object({
    tab: z.enum(["cases", "schema", "history", "evaluations"]).optional(),
  }),
  component: DatasetDetailRoute,
});

function DatasetDetailRoute() {
  const { datasetId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <DatasetDetail datasetId={datasetId} tab={tab} />;
}
