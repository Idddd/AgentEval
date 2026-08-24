import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Bot, FileQuestion, Scale, Wrench } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentProjectId } from "@/hooks/use-project";
import { EvaluationPageFrame } from "../evaluation-shell";
import { EvaluationStatusBadge } from "../evaluation-status";
import { useEvaluationState } from "../mock-provider";
import { ReflectionEditor } from "./reflection-editor";
import { ReportComparison } from "./report-comparison";
import { reportDetailView } from "./report-view-model";

export function ReportDetail({ reportId }: { reportId: string }) {
  const projectId = useCurrentProjectId(); const detail = reportDetailView(useEvaluationState(), reportId);
  if (!detail) return <EmptyState icon={FileQuestion} title="Report not found" description="This immutable mock Report does not exist in the current tab." action={<Button asChild variant="outline"><Link to="/$projectId/evaluations" params={{ projectId }} search={{ view: "reports" }}>Back to Reports</Link></Button>} />;
  return <EvaluationPageFrame title={`Report · ${detail.target?.name ?? reportId}`} description={`${detail.dataset?.name ?? "Dataset"} · ${new Date(detail.report.createdAt).toLocaleString()}`} action={<Button asChild variant="outline"><Link to="/$projectId/evaluations" params={{ projectId }} search={{ view: "reports" }}><ArrowLeft /> Reports</Link></Button>}><ReportContent reportId={reportId} /></EvaluationPageFrame>;
}

export function ReportContent({ reportId }: { reportId: string }) {
  const detail = reportDetailView(useEvaluationState(), reportId);
  if (!detail) return null;
  const failures = detail.caseRows.filter((item) => item.status === "FAIL" || item.status === "BLOCKED");
  return <div className="space-y-6"><div className={detail.status === "PASS" ? "rounded-lg border border-emerald-300 bg-emerald-50/60 p-5" : "rounded-lg border border-rose-300 bg-rose-50/60 p-5"}><div className="flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evaluation status</p><h2 className="mt-1 text-xl font-semibold">{detail.status === "PASS" ? "All required behaviors passed" : `${detail.report.metrics.failed} regression requires review`}</h2></div><EvaluationStatusBadge status={detail.status} /></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Pass rate" value={`${detail.report.metrics.passRate}%`} /><Metric label="Passed" value={String(detail.report.metrics.passed)} /><Metric label="Failed" value={String(detail.report.metrics.failed)} /><Metric label="Blocked" value={String(detail.report.metrics.blocked)} /><Metric label="Total cost" value={`$${detail.report.costs.evaluationTotal.toFixed(4)}`} /></div>
    <Section title="Test Results"><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-b bg-muted/40 text-xs text-muted-foreground"><tr>{['Case', 'Status', 'Expected', 'Actual', 'Duration', 'Tokens', 'Cost', 'Reason'].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead><tbody className="divide-y">{detail.caseRows.map((row) => <tr key={row.caseId}><td className="max-w-xs px-4 py-3"><p className="font-mono text-xs">{row.caseId}</p><p className="mt-1 text-xs text-muted-foreground">{row.query}</p></td><td className="px-4 py-3"><EvaluationStatusBadge status={row.status} /></td><td className="px-4 py-3">{row.expectedOutcome}</td><td className="px-4 py-3">{row.actualOutcome}</td><td className="px-4 py-3 font-mono text-xs">{row.duration}</td><td className="px-4 py-3 font-mono text-xs">{row.tokens}</td><td className="px-4 py-3 font-mono text-xs">{row.cost}</td><td className="max-w-sm px-4 py-3 text-xs">{row.reason}</td></tr>)}</tbody></table></div></Section>
    <Section title="Failure reasons">{failures.length ? <div className="space-y-3">{failures.map((row) => <div key={row.caseId} className="flex gap-3 rounded-md border border-rose-200 bg-rose-50/40 p-4"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" /><div><p className="font-medium">{row.caseId}</p><p className="mt-1 text-sm text-muted-foreground">{row.reason}</p></div></div>)}</div> : <p className="text-sm text-muted-foreground">No failed or blocked Cases.</p>}</Section>
    <Section title="Tool Evidence"><div className="grid gap-3 md:grid-cols-2">{detail.caseRows.map((row) => <Card key={row.caseId}><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Wrench className="size-4" />{row.caseId}</CardTitle></CardHeader><CardContent>{typeof row.toolEvidence === "string" ? <p className="text-sm text-muted-foreground">{row.toolEvidence}</p> : <div className="space-y-2">{row.toolEvidence.map((tool) => <div key={tool.tool} className="flex items-center justify-between text-sm"><span className="font-mono text-xs">{tool.tool}</span><span className="flex gap-1"><Badge variant="outline">{tool.requested ? "Requested" : "Not requested"}</Badge><Badge variant="outline">{tool.called ? "Called" : "Not called"}</Badge><Badge variant="outline">{tool.allowed ? "Allowed" : "Denied"}</Badge></span></div>)}</div>}</CardContent></Card>)}</div></Section>
    <Section title="LLM Judge"><div className="grid gap-3 md:grid-cols-2">{detail.caseRows.map((row) => <Card key={row.caseId}><CardHeader><CardTitle className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Scale className="size-4" />{row.caseId}</span><Badge variant="outline">Score {row.judgeScore}</Badge></CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{row.judge}</p></CardContent></Card>)}</div></Section>
    <ReportComparison reportId={reportId} />
    <Section title="Usage & Cost"><div className="grid gap-3 md:grid-cols-3"><Metric label="Agent" value={`$${detail.report.costs.agent.toFixed(4)}`} /><Metric label="Judge" value={`$${detail.report.costs.judge.toFixed(4)}`} /><Metric label="Evaluation total" value={`$${detail.report.costs.evaluationTotal.toFixed(4)}`} /></div><div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Bot className="size-4" />All usage is deterministic fixture data; no model or tool call was made.</div></Section>
    <ReflectionEditor reportId={reportId} />
  </div>;
}

function Section({ children, title }: { children: ReactNode; title: string }) { return <section className="space-y-3"><h2 className="text-lg font-semibold">{title}</h2>{children}</section>; }
function Metric({ label, value }: { label: string; value: string }) { return <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>; }
