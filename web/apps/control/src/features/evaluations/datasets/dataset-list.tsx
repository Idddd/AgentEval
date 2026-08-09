import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Database, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentProjectId } from "@/hooks/use-project";
import { useEvaluationState, useEvaluationStore } from "../mock-provider";
import { datasetListRows } from "./dataset-view-model";

export function DatasetList() {
  const projectId = useCurrentProjectId();
  const state = useEvaluationState();
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => datasetListRows(state).filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) && (targetId === "ALL" || item.targetId === targetId) && (status === "ALL" || item.status === status)), [query, state, status, targetId]);
  return <div className="space-y-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="relative max-w-sm flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Datasets" className="pl-9" /></div><Filter value={targetId} onChange={setTargetId}><option value="ALL">All Targets</option>{state.targets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Filter><Filter value={status} onChange={setStatus}><option value="ALL">All statuses</option><option value="PUBLISHED">Published</option><option value="DRAFT">Draft</option></Filter><Button onClick={() => setOpen(true)} className="lg:ml-auto"><Plus /> New Dataset</Button></div><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b bg-muted/40 text-xs text-muted-foreground"><tr>{['Dataset', 'Target', 'Revision', 'Cases', 'Status', 'Updated', ''].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row.id} className="hover:bg-muted/20"><td className="px-4 py-3"><span className="flex items-center gap-2 font-medium"><Database className="size-4 text-primary" />{row.name}</span></td><td className="px-4 py-3">{row.targetName}</td><td className="px-4 py-3 font-mono">{row.revision ? `r${row.revision}` : "—"}</td><td className="px-4 py-3 font-mono">{row.cases}</td><td className="px-4 py-3"><span className="flex gap-1"><Badge variant={row.status === "PUBLISHED" ? "secondary" : "outline"}>{row.status}</Badge>{row.hasUnpublishedChanges ? <Badge variant="outline">Changes</Badge> : null}</span></td><td className="px-4 py-3 text-muted-foreground">{new Date(row.updatedAt).toLocaleDateString()}</td><td className="px-4 py-3 text-right"><Button asChild size="sm" variant="ghost"><Link to="/$projectId/evaluations/datasets/$datasetId" params={{ projectId, datasetId: row.id }}>View</Link></Button></td></tr>)}</tbody></table></div><NewDatasetSheet open={open} onOpenChange={setOpen} /></div>;
}

function Filter({ children, onChange, value }: { children: ReactNode; onChange: (value: string) => void; value: string }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">{children}</select>; }

function NewDatasetSheet({ onOpenChange, open }: { onOpenChange: (open: boolean) => void; open: boolean }) {
  const store = useEvaluationStore(); const state = useEvaluationState();
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [targetId, setTargetId] = useState(state.targets[0]?.id ?? ""); const [error, setError] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); const result = store.createDataset({ name, description, targetId }); if (!result.ok) { setError(result.error); return; } onOpenChange(false); setName(""); setDescription(""); }
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent><SheetHeader><SheetTitle>New Dataset</SheetTitle><SheetDescription>Create a draft collection of repeatable evaluation Cases.</SheetDescription></SheetHeader><form onSubmit={submit} className="flex flex-1 flex-col"><div className="space-y-4 px-4"><div className="space-y-2"><Label htmlFor="dataset-name">Name</Label><Input id="dataset-name" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="dataset-target">Target</Label><select id="dataset-target" value={targetId} onChange={(event) => setTargetId(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">{state.targets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="dataset-description">Description</Label><Textarea id="dataset-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} /></div>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}</div><SheetFooter className="mt-auto flex-row justify-end border-t"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit">Create Dataset</Button></SheetFooter></form></SheetContent></Sheet>;
}
