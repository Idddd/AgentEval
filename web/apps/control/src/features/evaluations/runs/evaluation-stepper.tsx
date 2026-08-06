import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowStage } from "../model";

const labels: Record<WorkflowStage, string> = {
  setup: "Setup",
  evaluate: "Evaluate",
  report: "Report",
  reflect: "Reflect",
  complete: "Complete",
};

export function EvaluationStepper({ active, onStageChange, stages }: { active: WorkflowStage; onStageChange: (stage: WorkflowStage) => void; stages: Array<{ id: WorkflowStage; enabled: boolean; complete: boolean }> }) {
  return <ol className="grid grid-cols-5 overflow-hidden rounded-lg border bg-muted/20" aria-label="Evaluation workflow">{stages.map((stage, index) => <li key={stage.id} className="relative"><button type="button" aria-label={labels[stage.id]} disabled={!stage.enabled} aria-current={active === stage.id ? "step" : undefined} onClick={() => onStageChange(stage.id)} className={cn("flex w-full items-center justify-center gap-2 px-2 py-3 text-xs font-medium transition-colors sm:text-sm", active === stage.id && "bg-background text-primary shadow-sm", stage.complete && "text-emerald-700", !stage.enabled && "cursor-not-allowed text-muted-foreground/45")}><span className={cn("grid size-5 place-items-center rounded-full border text-[10px]", stage.complete && "border-emerald-600 bg-emerald-600 text-white", active === stage.id && !stage.complete && "border-primary")}>{stage.complete ? <Check className="size-3" /> : index + 1}</span>{labels[stage.id]}</button></li>)}</ol>;
}
