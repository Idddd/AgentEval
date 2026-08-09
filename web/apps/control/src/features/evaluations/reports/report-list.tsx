import { Link } from "@tanstack/react-router";
import { FileChartColumn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentProjectId } from "@/hooks/use-project";
import { EvaluationStatusBadge } from "../evaluation-status";
import { useEvaluationState } from "../mock-provider";
import { reportListRows } from "./report-view-model";

export function ReportList() {
  const projectId = useCurrentProjectId(); const rows = reportListRows(useEvaluationState());
  return <div className="space-y-4"><div><h2 className="font-medium">Immutable Reports</h2><p className="text-sm text-muted-foreground">Review evidence, compare baselines, and create Target improvements.</p></div><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b bg-muted/40 text-xs text-muted-foreground"><tr>{['Created', 'Target', 'Dataset', 'Status', 'Pass rate', 'Failures', 'Cost', ''].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row.id} className="hover:bg-muted/20"><td className="px-4 py-3 text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</td><td className="px-4 py-3"><p className="font-medium">{row.targetName}</p><span className="font-mono text-xs text-muted-foreground">r{row.targetRevision}</span></td><td className="px-4 py-3"><p>{row.datasetName}</p><span className="font-mono text-xs text-muted-foreground">r{row.datasetRevision}</span></td><td className="px-4 py-3"><EvaluationStatusBadge status={row.status} /></td><td className="px-4 py-3 font-mono">{row.passRate}%</td><td className="px-4 py-3 font-mono">{row.failed}</td><td className="px-4 py-3 font-mono">${row.costUsd.toFixed(4)}</td><td className="px-4 py-3 text-right"><Button asChild size="sm" variant="ghost"><Link to="/$projectId/evaluations/reports/$reportId" params={{ projectId, reportId: row.id }}>View</Link></Button></td></tr>)}</tbody></table>{!rows.length ? <div className="grid place-items-center py-14"><FileChartColumn className="mb-3 size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">No Reports yet.</p></div> : null}</div></div>;
}
