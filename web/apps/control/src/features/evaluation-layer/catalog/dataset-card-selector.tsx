import { CircleCheck, CircleDot, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  EvaluationLayerDataset,
  EvaluationLayerDatasetRevision,
} from "../model";

export type DatasetCardSummary = {
  revisionLabel: string;
  statusLabel: string;
  caseLabel: string;
};

export function datasetCardSummary(
  dataset: EvaluationLayerDataset,
  revisions: EvaluationLayerDatasetRevision[],
): DatasetCardSummary {
  const candidates = revisions.filter((item) => item.datasetId === dataset.id);
  const revision = candidates.find((item) => item.id === dataset.currentRevisionId)
    ?? [...candidates].sort((left, right) => right.revision - left.revision)[0];

  if (!revision) {
    return {
      revisionLabel: "No revisions",
      statusLabel: "",
      caseLabel: "0 cases",
    };
  }

  return {
    revisionLabel: `R${revision.revision}`,
    statusLabel: revision.status === "PUBLISHED" ? "Published" : "Draft",
    caseLabel: `${revision.cases.length} case${revision.cases.length === 1 ? "" : "s"}`,
  };
}

export type DatasetCardSelectorProps = {
  datasets: EvaluationLayerDataset[];
  revisions: EvaluationLayerDatasetRevision[];
  selectedDatasetId: string;
  onSelect(datasetId: string): void;
  onCreate(): void;
};

export function DatasetCardSelector({
  datasets,
  revisions,
  selectedDatasetId,
  onSelect,
  onCreate,
}: DatasetCardSelectorProps) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-xs font-medium text-muted-foreground">Dataset</legend>
      <div role="radiogroup" aria-label="Dataset" className="grid gap-3 md:grid-cols-2">
        {datasets.map((dataset) => {
          const selected = dataset.id === selectedDatasetId;
          const summary = datasetCardSummary(dataset, revisions);
          return (
            <label
              key={dataset.id}
              className={cn(
                "relative min-h-32 cursor-pointer rounded-lg border bg-background p-4 transition-colors hover:border-cyan-500/60 hover:bg-cyan-500/[0.03] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
                selected && "border-cyan-500 bg-cyan-500/[0.06] ring-1 ring-cyan-500/25",
              )}
            >
              <input
                className="peer sr-only"
                type="radio"
                name="evaluation-dataset"
                value={dataset.id}
                checked={selected}
                onChange={() => onSelect(dataset.id)}
              />
              <span className="flex items-start justify-between gap-3">
                <strong className="text-sm font-medium text-foreground">{dataset.name}</strong>
                {selected
                  ? <CircleCheck className="size-4 shrink-0 text-cyan-600" aria-hidden="true" />
                  : <CircleDot className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
              </span>
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                {dataset.description.trim() || "No description"}
              </span>
              <span className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-md border bg-muted/30 px-1.5 py-0.5">{summary.revisionLabel}</span>
                {summary.statusLabel ? <span>{summary.statusLabel}</span> : null}
                <span>{summary.caseLabel}</span>
              </span>
            </label>
          );
        })}
        <button
          type="button"
          aria-label="New Dataset"
          className="min-h-32 rounded-lg border border-dashed bg-muted/10 p-4 text-left transition-colors hover:border-cyan-500 hover:bg-cyan-500/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={onCreate}
        >
          <Plus className="size-5 text-cyan-600" aria-hidden="true" />
          <strong className="mt-3 block text-sm font-medium text-foreground">New Dataset</strong>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            Create a Dataset for this evaluation target.
          </span>
        </button>
      </div>
    </fieldset>
  );
}
