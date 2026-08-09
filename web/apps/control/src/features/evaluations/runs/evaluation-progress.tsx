import { useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useEvaluationStore } from "../mock-provider";
import type { EvaluationRun } from "../model";
import { scheduleEvaluationRun } from "../scenario-engine";
import { EvaluationStatusBadge } from "../evaluation-status";
import { runProgressView } from "./run-view-model";

export function EvaluationProgress({ run }: { run: EvaluationRun }) {
  const store = useEvaluationStore(); const progress = runProgressView(run);
  useEffect(() => run.status === "RUNNING" ? scheduleEvaluationRun(store, run.id) : undefined, [run.id, run.status, store]);
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-4"><Metric label="Progress" value={`${progress.percent}%`} /><Metric label="Completed" value={`${progress.completed}/${progress.total}`} /><Metric label="Passed" value={String(progress.passed)} /><Metric label="Failed" value={String(progress.failed)} /></div><Card><CardHeader><CardTitle className="flex items-center justify-between">Live execution {run.status === "RUNNING" ? <LoaderCircle className="size-4 animate-spin text-primary" /> : <EvaluationStatusBadge status={run.status} />}</CardTitle></CardHeader><CardContent className="space-y-3"><Progress value={progress.percent} /><div className="flex justify-between text-xs text-muted-foreground"><span>{progress.currentCaseId ? `Current: ${progress.currentCaseId}` : "All Cases completed"}</span><span>{progress.percent}%</span></div></CardContent></Card><div className="overflow-hidden rounded-lg border"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Recent Case</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">Judge</th><th className="px-4 py-3 text-right">Duration</th></tr></thead><tbody className="divide-y">{progress.recentResults.map((result) => <tr key={result.caseId}><td className="px-4 py-3 font-mono text-xs">{result.caseId}</td><td className="px-4 py-3"><EvaluationStatusBadge status={result.status} /></td><td className="px-4 py-3"><Badge variant="outline">{result.judge?.score ?? "—"}</Badge></td><td className="px-4 py-3 text-right font-mono">{result.durationMs ?? 0}ms</td></tr>)}</tbody></table></div></div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>; }
