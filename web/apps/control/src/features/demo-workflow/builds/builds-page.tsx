import { useEffect, useMemo, useState } from "react";
import { Boxes, CheckCircle2, Clock3, GitBranch, Pencil, Plus, ServerCog } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDemoWorkflowState, useDemoWorkflowStore } from "../provider";
import { selectAgentWizardBuilds } from "../selectors";
import type { DemoAgentRevisionInput, DemoRevisionStatus } from "../model";
import { RevisionDiff } from "./revision-diff";

const statusLabel: Record<DemoRevisionStatus, string> = {
  DRAFT: "Draft",
  READY_FOR_VALIDATION: "Ready for validation",
  VALIDATING: "Validating",
  VALIDATION_FAILED: "Validation failed",
  VALIDATED: "Validated",
  RELEASE_CANDIDATE: "Release Candidate",
  PENDING_EVAL: "Pending Business Eval",
  BUSINESS_EVALUATING: "Business Eval running",
  BUSINESS_EVAL_FAILED: "Business Eval failed",
  READY_FOR_APPROVAL: "Ready for approval",
  PENDING_APPROVAL: "Pending approval",
  REJECTED: "Rejected",
  APPROVED: "Approved",
  PUBLISHED: "Published",
};

export function BuildsPage() {
  const state = useDemoWorkflowState();
  const store = useDemoWorkflowStore();
  const builds = useMemo(() => selectAgentWizardBuilds(state), [state]);
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (selectedId && builds.some((build) => build.revisionId === selectedId)) return;
    setSelectedId(builds.find((build) => build.isActiveDraft)?.revisionId ?? builds[0]?.revisionId ?? "");
  }, [builds, selectedId]);

  const selected = builds.find((build) => build.revisionId === selectedId) ?? builds[0];
  const revision = state.agentRevisions.find((item) => item.id === selected?.revisionId);
  const agent = state.agents.find((item) => item.id === selected?.agentId);
  const baseRevision = revision?.basedOnRevisionId
    ? state.agentRevisions.find((item) => item.id === revision.basedOnRevisionId)
    : undefined;
  const grouped = state.agents.map((item) => ({
    agent: item,
    builds: builds.filter((build) => build.agentId === item.id),
  }));

  const createRevision = () => {
    if (!agent) return;
    try {
      const created = store.createAgentRevision(agent.id, "agent-wizard");
      setSelectedId(created.id);
      setNotice(`R${created.revision} draft created from the latest approved revision.`);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create revision");
    }
  };

  const markReady = () => {
    if (!revision) return;
    try {
      store.markReadyForTechnicalValidation(revision.id, "agent-wizard");
      setNotice(`R${revision.revision} is ready for Technical Validation.`);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to prepare revision");
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        title="My Builds"
        description="Manage immutable Agent revisions, technical dependencies, and the handoff into validation."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Summary icon={Boxes} label="Agents" value={state.agents.length} />
        <Summary icon={GitBranch} label="Revisions" value={state.agentRevisions.length} />
        <Summary icon={Clock3} label="Active drafts" value={state.agents.filter((item) => item.activeDraftRevisionId).length} />
      </div>
      {notice ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-3 self-start xl:sticky xl:top-24">
          <h2 className="text-sm font-semibold">Build portfolio</h2>
          {grouped.map(({ agent: item, builds: revisions }) => (
            <Card key={item.id} className="overflow-hidden">
              <CardHeader className="border-b bg-muted/20 p-4"><CardTitle className="text-sm">{item.name}</CardTitle><p className="text-xs text-muted-foreground">{item.owner}</p></CardHeader>
              <CardContent className="space-y-1 p-2">
                {revisions.map((build) => <button key={build.revisionId} type="button" onClick={() => setSelectedId(build.revisionId)} className={`flex min-h-12 w-full items-center justify-between rounded-md px-3 text-left text-sm ${selected?.revisionId === build.revisionId ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}><span>R{build.revision}</span><span className="text-xs">{statusLabel[build.status]}</span></button>)}
              </CardContent>
            </Card>
          ))}
        </aside>

        {selected && revision && agent ? (
          <main className="space-y-5">
            <Card>
              <CardHeader className="border-b">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div><div className="flex items-center gap-2"><CardTitle>{agent.name} · R{revision.revision}</CardTitle><StatusBadge status={revision.status} /></div><p className="mt-2 text-sm text-muted-foreground">{agent.description}</p></div>
                  <div className="flex flex-wrap gap-2">
                    {!agent.activeDraftRevisionId && agent.currentApprovedRevisionId ? <Button variant="outline" onClick={createRevision}><Plus />Create New Revision</Button> : null}
                    {agent.activeDraftRevisionId === revision.id && ["DRAFT", "READY_FOR_VALIDATION", "VALIDATION_FAILED"].includes(revision.status) ? <Button variant="outline" aria-label={`Edit R${revision.revision}`} onClick={() => setEditing(true)}><Pencil />Edit R{revision.revision}</Button> : null}
                    {revision.status === "DRAFT" || revision.status === "VALIDATION_FAILED" ? <Button onClick={markReady}><CheckCircle2 />Mark ready for validation</Button> : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
                <Technical label="Runtime" value={revision.runtimeType} />
                <Technical label="Model" value={revision.model} />
                <Technical label="Endpoint" value={revision.endpoint} />
                <Technical label="MCP Servers" value={selected.mcpNames.join(", ") || "None"} />
                <Technical label="Skills" value={selected.skillNames.join(", ") || "None"} />
                <Technical label="Knowledge Bases" value={selected.knowledgeBaseNames.join(", ") || "None"} />
              </CardContent>
            </Card>
            <section className="space-y-3"><div><h2 className="text-lg font-semibold">Revision comparison</h2><p className="text-sm text-muted-foreground">Field-level change review against the approved base revision.</p></div><RevisionDiff base={baseRevision} revision={revision} /></section>
            <section className="space-y-3"><div><h2 className="text-lg font-semibold">Technical diagnostics</h2><p className="text-sm text-muted-foreground">Validation evidence remains visible to Agent Wizard only.</p></div>{revision.technicalResult ? <div className="grid gap-3 sm:grid-cols-2">{revision.technicalResult.checks.map((check) => <Card key={check.id}><CardContent className="flex gap-3 p-4"><CheckCircle2 className="mt-0.5 size-5 text-emerald-600" /><div><strong className="text-sm">{check.label} {check.status.toLowerCase()}</strong><p className="mt-1 text-xs text-muted-foreground">{check.detail}</p></div></CardContent></Card>)}</div> : <Card className="border-dashed"><CardContent className="flex min-h-28 items-center gap-3 p-5 text-sm text-muted-foreground"><ServerCog className="size-6" />Run Technical Validation to generate diagnostics.</CardContent></Card>}</section>
          </main>
        ) : null}
      </div>
      {editing && revision ? <EditRevisionDialog revision={revision} open onOpenChange={setEditing} onSave={(input) => { store.updateAgentDraft(revision.id, input, "agent-wizard"); setEditing(false); setNotice(`R${revision.revision} draft saved.`); }} /> : null}
    </div>
  );
}

function EditRevisionDialog({ revision, open, onOpenChange, onSave }: { revision: { runtimeType: string; model: string; endpoint: string; mcpIds: string[]; skillIds: string[]; knowledgeBaseIds: string[]; revision: number }; open: boolean; onOpenChange(open: boolean): void; onSave(input: DemoAgentRevisionInput): void }) {
  const [input, setInput] = useState<DemoAgentRevisionInput>({ runtimeType: revision.runtimeType, model: revision.model, endpoint: revision.endpoint, mcpIds: [...revision.mcpIds], skillIds: [...revision.skillIds], knowledgeBaseIds: [...revision.knowledgeBaseIds] });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Edit R{revision.revision}</DialogTitle><DialogDescription>Changing a validated draft clears later evidence and returns it to validation.</DialogDescription></DialogHeader><div className="space-y-4 px-6 py-5"><label className="space-y-2"><span className="text-sm font-medium">Runtime type</span><Input aria-label="Runtime type" value={input.runtimeType} onChange={(event) => setInput({ ...input, runtimeType: event.target.value })} /></label><label className="space-y-2"><span className="text-sm font-medium">Model</span><Input aria-label="Model" value={input.model} onChange={(event) => setInput({ ...input, model: event.target.value })} /></label><label className="space-y-2"><span className="text-sm font-medium">Endpoint</span><Input aria-label="Endpoint" value={input.endpoint} onChange={(event) => setInput({ ...input, endpoint: event.target.value })} /></label></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => onSave(input)}>Save draft</Button></DialogFooter></DialogContent></Dialog>;
}

function Summary({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: number }) { return <Card><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span><div><span className="text-xs text-muted-foreground">{label}</span><strong className="block text-2xl tabular-nums">{value}</strong></div></CardContent></Card>; }
function Technical({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-lg border bg-muted/20 p-3"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block break-all font-mono text-xs">{value}</strong></div>; }
function StatusBadge({ status }: { status: DemoRevisionStatus }) { const active = ["PUBLISHED", "VALIDATED", "READY_FOR_VALIDATION"].includes(status); return <Badge variant="outline" className={active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>{statusLabel[status]}</Badge>; }
