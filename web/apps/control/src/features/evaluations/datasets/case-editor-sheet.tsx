import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useEvaluationState, useEvaluationStore } from "../mock-provider";

export function CaseEditorSheet({ caseId, datasetId, onOpenChange, open }: { caseId?: string | undefined; datasetId: string; onOpenChange: (open: boolean) => void; open: boolean }) {
  const store = useEvaluationStore();
  const state = useEvaluationState();
  const item = state.datasets.find((entry) => entry.id === datasetId)?.draftCases.find((entry) => entry.id === caseId);
  const [query, setQuery] = useState("");
  const [headers, setHeaders] = useState("{}");
  const [outcome, setOutcome] = useState<"ALLOW" | "DENY">("DENY");
  const [tool, setTool] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setQuery(item?.input.query ?? "");
    setHeaders(JSON.stringify(item?.input.headers ?? {}, null, 2));
    setOutcome(item?.expected.outcome ?? "DENY");
    setTool(item?.expected.tool ?? "");
    setReason(item?.expected.reason ?? "");
    setError("");
  }, [item, open]);
  function submit(event: FormEvent) {
    event.preventDefault();
    let parsedHeaders: Record<string, string>;
    try {
      parsedHeaders = JSON.parse(headers) as Record<string, string>;
      if (!parsedHeaders || Array.isArray(parsedHeaders) || typeof parsedHeaders !== "object") throw new Error();
    } catch {
      setError("Headers must be a valid JSON object.");
      return;
    }
    const expected = { outcome, reason, ...(tool.trim() ? { tool: tool.trim() } : {}) };
    const input = { input: { query: query.trim(), headers: parsedHeaders }, expected, source: item?.source ?? "MANUAL" as const };
    const result = item ? store.updateCase(datasetId, item.id, input) : store.createCase(datasetId, input);
    if (!result.ok) { setError(result.error); return; }
    onOpenChange(false);
  }
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>{item ? "Edit Case" : "Add Case"}</SheetTitle><SheetDescription>Define one input and its expected Agent behavior.</SheetDescription></SheetHeader><form onSubmit={submit} className="flex flex-1 flex-col"><div className="space-y-4 px-4"><Field label="Input query" id="case-query"><Textarea id="case-query" value={query} onChange={(event) => setQuery(event.target.value)} rows={4} required /></Field><Field label="Headers (JSON)" id="case-headers"><Textarea id="case-headers" value={headers} onChange={(event) => setHeaders(event.target.value)} rows={4} className="font-mono text-xs" /></Field><Field label="Expected outcome" id="case-outcome"><select id="case-outcome" value={outcome} onChange={(event) => setOutcome(event.target.value as "ALLOW" | "DENY")} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="ALLOW">ALLOW</option><option value="DENY">DENY</option></select></Field><Field label="Expected tool (optional)" id="case-tool"><Input id="case-tool" value={tool} onChange={(event) => setTool(event.target.value)} /></Field><Field label="Reason" id="case-reason"><Textarea id="case-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} required /></Field>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}</div><SheetFooter className="mt-auto flex-row justify-end border-t"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit">Save Case</Button></SheetFooter></form></SheetContent></Sheet>;
}

function Field({ children, id, label }: { children: ReactNode; id: string; label: string }) { return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>; }
