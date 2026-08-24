import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Search, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentProjectId } from "@/hooks/use-project";
import { EvaluationStatusBadge } from "../evaluation-status";
import { useEvaluationState } from "../mock-provider";
import { TargetEditorSheet } from "./target-editor-sheet";
import { targetListRows } from "./target-view-model";

export function TargetList() {
  const projectId = useCurrentProjectId();
  const state = useEvaluationState();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [editorOpen, setEditorOpen] = useState(false);
  const rows = useMemo(
    () =>
      targetListRows(state).filter(
        (item) =>
          item.name.toLowerCase().includes(query.toLowerCase()) &&
          (status === "ALL" || item.lastStatus === status),
      ),
    [query, state, status],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Targets" className="pl-9" />
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="ALL">All statuses</option>
          <option value="PASS">Pass</option>
          <option value="FAIL">Fail</option>
          <option value="NOT_RUN">Not run</option>
        </select>
        <Button onClick={() => setEditorOpen(true)} className="sm:ml-auto"><Plus /> New Target</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              {['Target', 'Model', 'Revision', 'Components', 'Last result', 'Pass rate', 'Updated', ''].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/20">
                <td className="px-4 py-3"><span className="flex items-center gap-2 font-medium"><Target className="size-4 text-primary" />{row.name}</span></td>
                <td className="px-4 py-3">{row.model}</td>
                <td className="px-4 py-3 font-mono">r{row.revision}</td>
                <td className="px-4 py-3"><span className="flex gap-1"><Badge variant="outline">{row.tools} tools</Badge><Badge variant="outline">{row.mcpServers} MCP</Badge><Badge variant="outline">{row.knowledgeBases} KB</Badge></span></td>
                <td className="px-4 py-3">{row.lastStatus === "NOT_RUN" ? <Badge variant="outline">NOT RUN</Badge> : <EvaluationStatusBadge status={row.lastStatus} />}</td>
                <td className="px-4 py-3 font-mono">{row.passRate === undefined ? "—" : `${row.passRate}%`}</td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(row.updatedAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right"><Button asChild variant="ghost" size="sm"><Link to="/$projectId/evaluations/targets/$targetId" params={{ projectId, targetId: row.id }}>View</Link></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="px-4 py-12 text-center text-sm text-muted-foreground">No Targets match these filters.</p> : null}
      </div>
      <TargetEditorSheet open={editorOpen} onOpenChange={setEditorOpen} />
    </div>
  );
}
