import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Database, FileChartColumn, FlaskConical, Target } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import {
  EvaluationPageFrame,
  type EvaluationView,
} from "@/features/evaluations/evaluation-shell";
import { TargetList } from "@/features/evaluations/targets/target-list";
import { DatasetList } from "@/features/evaluations/datasets/dataset-list";
import { EvaluationList } from "@/features/evaluations/runs/evaluation-list";
import { ReportList } from "@/features/evaluations/reports/report-list";

export const Route = createFileRoute("/$projectId/evaluations/")({
  validateSearch: z.object({
    view: z.enum(["targets", "datasets", "evaluations", "reports"]).optional(),
  }),
  component: EvaluationsIndex,
});

const placeholders: Record<
  EvaluationView,
  { description: string; icon: typeof Target; title: string }
> = {
  targets: {
    icon: Target,
    title: "Targets are ready for configuration",
    description: "Target cards and revision controls are being connected.",
  },
  datasets: {
    icon: Database,
    title: "Datasets are ready for cases",
    description: "Dataset revisions and case editing will appear here.",
  },
  evaluations: {
    icon: FlaskConical,
    title: "Evaluations are ready to run",
    description: "The run workflow and live progress will appear here.",
  },
  reports: {
    icon: FileChartColumn,
    title: "Reports are ready for review",
    description: "Metrics, comparisons, and Reflection will appear here.",
  },
};

function EvaluationsIndex() {
  const view = Route.useSearch().view ?? "targets";
  const placeholder = placeholders[view];
  return (
    <EvaluationPageFrame
      title="Evaluations"
      description="Design, run, and improve repeatable Agent evaluations with local mock data."
    >
      {view === "targets" ? (
        <TargetList />
      ) : view === "datasets" ? (
        <DatasetList />
      ) : view === "evaluations" ? (
        <EvaluationList />
      ) : view === "reports" ? (
        <ReportList />
      ) : (
        <EmptyState {...placeholder} />
      )}
    </EvaluationPageFrame>
  );
}
