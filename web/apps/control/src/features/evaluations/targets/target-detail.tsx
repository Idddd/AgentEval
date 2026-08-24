import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileQuestion, GitBranchPlus, Wrench } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentProjectId } from "@/hooks/use-project";
import { EvaluationPageFrame } from "../evaluation-shell";
import { EvaluationStatusBadge } from "../evaluation-status";
import { useEvaluationState } from "../mock-provider";
import { TargetEditorSheet } from "./target-editor-sheet";
import { targetDetailView } from "./target-view-model";

export function TargetDetail({ targetId }: { targetId: string }) {
  const projectId = useCurrentProjectId();
  const state = useEvaluationState();
  const detail = targetDetailView(state, targetId);
  const [editorOpen, setEditorOpen] = useState(false);
  if (!detail) {
    return <EmptyState icon={FileQuestion} title="Target not found" description="This mock Target does not exist in the current tab." action={<Button asChild variant="outline"><Link to="/$projectId/evaluations" params={{ projectId }}>Back to Evaluations</Link></Button>} />;
  }
  const revision = detail.currentRevision;
  return (
    <EvaluationPageFrame
      title={detail.target.name}
      description={detail.target.description}
      action={<div className="flex gap-2"><Button asChild variant="outline"><Link to="/$projectId/evaluations" params={{ projectId }}><ArrowLeft /> Targets</Link></Button><Button onClick={() => setEditorOpen(true)}><GitBranchPlus /> Create revision</Button></div>}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Current revision" value={`r${revision.revision}`} note={revision.id} />
        <Metric label="Model" value={revision.model.name} note={revision.model.id} />
        <Metric label="Latest quality" value={detail.reports[0] ? `${detail.reports[0].metrics.passRate}%` : "Not run"} note={`${detail.reports.length} Reports`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card><CardHeader><CardTitle>System prompt</CardTitle></CardHeader><CardContent><pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-4 font-mono text-xs leading-6">{revision.systemPrompt}</pre></CardContent></Card>
        <Card><CardHeader><CardTitle>Components</CardTitle></CardHeader><CardContent className="space-y-4"><ComponentList label="Tools" values={revision.tools} /><ComponentList label="MCP Servers" values={revision.mcpServers} /><ComponentList label="Knowledge Bases" values={revision.knowledgeBases} /></CardContent></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TrendCard title="Quality trend" values={detail.qualityTrend.map((item) => ({ label: new Date(item.createdAt).toLocaleDateString(), value: item.passRate, display: `${item.passRate}%` }))} />
        <TrendCard title="Evaluation cost" values={detail.costTrend.map((item) => ({ label: new Date(item.createdAt).toLocaleDateString(), value: item.costUsd * 1000, display: `$${item.costUsd.toFixed(4)}` }))} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Revision history</CardTitle></CardHeader><CardContent className="divide-y">{detail.revisions.map((item) => <div key={item.id} className="flex items-center justify-between py-3"><div><p className="font-medium">Revision {item.revision}</p><p className="text-xs text-muted-foreground">{item.model.name} · {new Date(item.createdAt).toLocaleString()}</p></div>{item.id === revision.id ? <Badge>Current</Badge> : <Badge variant="outline">Immutable</Badge>}</div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Report history</CardTitle></CardHeader><CardContent className="divide-y">{detail.reports.map((item) => <div key={item.id} className="flex items-center justify-between py-3"><div><p className="font-mono text-xs">{item.id}</p><p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p></div><div className="flex items-center gap-3"><span className="font-mono text-sm">{item.metrics.passRate}%</span><EvaluationStatusBadge status={item.status} /></div></div>)}</CardContent></Card>
      </div>
      <TargetEditorSheet targetId={targetId} open={editorOpen} onOpenChange={setEditorOpen} />
    </EvaluationPageFrame>
  );
}

function Metric({ label, note, value }: { label: string; note: string; value: string }) { return <Card><CardContent className="pt-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 truncate font-mono text-xs text-muted-foreground">{note}</p></CardContent></Card>; }
function ComponentList({ label, values }: { label: string; values: string[] }) { return <div><p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><Wrench className="size-3.5" />{label}</p><div className="flex flex-wrap gap-1.5">{values.length ? values.map((value) => <Badge key={value} variant="outline">{value}</Badge>) : <span className="text-xs text-muted-foreground">None</span>}</div></div>; }
function TrendCard({ title, values }: { title: string; values: Array<{ label: string; value: number; display: string }> }) { const max = Math.max(1, ...values.map((item) => item.value)); return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="space-y-3">{values.map((item, index) => <div key={`${item.label}-${index}`} className="grid grid-cols-[5rem_1fr_4rem] items-center gap-3 text-xs"><span className="text-muted-foreground">{item.label}</span><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(item.value / max) * 100}%` }} /></div><span className="text-right font-mono">{item.display}</span></div>)}</CardContent></Card>; }
