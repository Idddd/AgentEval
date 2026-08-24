import { Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentProjectId } from "@/hooks/use-project";
import { EvaluationPageFrame } from "../evaluation-shell";
import { useEvaluationState } from "../mock-provider";
import type { WorkflowStage } from "../model";
import { EvaluationProgress } from "./evaluation-progress";
import { EvaluationStepper } from "./evaluation-stepper";
import { workflowStages } from "./run-view-model";
import { ReportContent } from "../reports/report-detail";
import { ReflectionEditor } from "../reports/reflection-editor";

export function EvaluationRunDetail({ activeStage, onStageChange, runId }: { activeStage?: WorkflowStage | undefined; onStageChange: (stage: WorkflowStage) => void; runId: string }) {
  const projectId = useCurrentProjectId(); const state = useEvaluationState(); const run = state.runs.find((item) => item.id === runId);
  if (!run) return <EmptyState icon={FileQuestion} title="Evaluation not found" description="This mock Run does not exist in the current tab." action={<Button asChild variant="outline"><Link to="/$projectId/evaluations" params={{ projectId }} search={{ view: "evaluations" }}>Back to Evaluations</Link></Button>} />;
  const stages = workflowStages(run); const requested = stages.find((item) => item.id === activeStage); const active = requested?.enabled ? requested.id : run.stage;
  const target = state.targets.find((item) => item.id === run.targetId); const targetRevision = state.targetRevisions.find((item) => item.id === run.targetRevisionId); const datasetRevision = state.datasetRevisions.find((item) => item.id === run.datasetRevisionId); const dataset = state.datasets.find((item) => item.id === datasetRevision?.datasetId); const report = state.reports.find((item) => item.id === run.reportId);
  return <EvaluationPageFrame title={`Evaluation · ${target?.name ?? run.id}`} description={`${target?.name ?? "Target"} r${targetRevision?.revision ?? "?"} against ${dataset?.name ?? "Dataset"} r${datasetRevision?.revision ?? "?"}`} action={<Button asChild variant="outline"><Link to="/$projectId/evaluations" params={{ projectId }} search={{ view: "evaluations" }}><ArrowLeft /> Evaluations</Link></Button>}><EvaluationStepper active={active} stages={stages} onStageChange={onStageChange} />
    {active === "evaluate" ? <EvaluationProgress run={run} /> : null}
    {active === "setup" ? <Card><CardHeader><CardTitle>Locked setup</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Summary label="Target Revision" value={`${target?.name ?? "—"} · r${targetRevision?.revision ?? "?"}`} /><Summary label="Dataset Revision" value={`${dataset?.name ?? "—"} · r${datasetRevision?.revision ?? "?"}`} /><Summary label="Model" value={targetRevision?.model.name ?? "—"} /><Summary label="Cases" value={String(datasetRevision?.cases.length ?? 0)} /></CardContent></Card> : null}
    {active === "report" ? report ? <ReportContent reportId={report.id} /> : null : null}
    {active === "reflect" ? report ? <ReflectionEditor reportId={report.id} /> : null : null}
    {active === "complete" ? <EmptyState icon={CheckCircle2} title="Evaluation workflow complete" description="The Report is immutable and any accepted Reflection changes were saved as a new Target Revision." /> : null}
  </EvaluationPageFrame>;
}
function Summary({ label, value }: { label: string; value: string }) { return <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
