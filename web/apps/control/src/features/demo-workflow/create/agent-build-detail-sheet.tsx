import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  GitBranch,
  Pencil,
  Plus,
  ServerCog,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useEvaluationLayerState } from "@/features/evaluation-layer/mock-provider";
import type { DemoAgentRevisionInput, DemoRevisionStatus } from "../model";
import { useDemoWorkflowState, useDemoWorkflowStore } from "../provider";
import { selectAgentWizardBuilds } from "../selectors";
import { RevisionDiff } from "../builds/revision-diff";

export type AgentBuildSelection =
  | { kind: "evaluation"; targetId: string }
  | { kind: "workflow"; agentId: string };

const statusLabel: Record<DemoRevisionStatus, string> = {
  DRAFT: "Draft",
  READY_FOR_VALIDATION: "Ready for validation",
  VALIDATING: "Evaluating",
  VALIDATION_FAILED: "Evaluation failed",
  VALIDATED: "Evaluated",
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

export function AgentBuildDetailSheet({
  selection,
  onOpenChange,
}: {
  selection: AgentBuildSelection | null;
  onOpenChange(open: boolean): void;
}) {
  return (
    <Sheet open={selection !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(96vw,48rem)] overflow-y-auto p-0 sm:max-w-[48rem]">
        {selection?.kind === "evaluation" ? (
          <EvaluationBuildDetail targetId={selection.targetId} />
        ) : selection?.kind === "workflow" ? (
          <WorkflowBuildDetail agentId={selection.agentId} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function EvaluationBuildDetail({ targetId }: { targetId: string }) {
  const state = useEvaluationLayerState();
  const target = state.targets.find((item) => item.id === targetId);
  const revision = state.targetRevisions.find(
    (item) => item.id === target?.currentRevisionId,
  );
  const latestRun = useMemo(
    () =>
      [...state.runs]
        .filter((run) => run.targetRevisionId === revision?.id)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0],
    [revision?.id, state.runs],
  );

  if (!target || !revision) return null;

  const passed = latestRun?.results.filter((result) => result.status === "PASS").length ?? 0;
  const total = latestRun?.results.length ?? 0;

  return (
    <>
      <SheetHeader className="border-b bg-muted/20 px-6 py-5 pr-14">
        <div className="flex flex-wrap items-center gap-2">
          <SheetTitle className="text-xl">{target.name}</SheetTitle>
          <Badge variant="outline">DEMO</Badge>
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
            {target.liveStatus}
          </Badge>
        </div>
        <SheetDescription className="mt-2 max-w-2xl">{target.description}</SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-6 py-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Summary label="Build" value={`Revision R${revision.revision}`} />
          <Summary label="Evaluate status" value={formatEvaluationStatus(latestRun?.status)} />
          <Summary label="Latest result" value={total ? `${passed}/${total} passed` : "No results yet"} />
        </div>

        <DetailSection
          icon={GitBranch}
          title="Technical configuration"
          description="The immutable runtime snapshot selected for evaluation."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Technical label="Runtime" value={revision.adapter ?? "Managed Agent"} />
            <Technical label="Model" value={revision.model ?? "Not specified"} />
            <Technical label="Endpoint" value={revision.endpoint ?? "Managed internally"} />
            <Technical label="Tools" value={`${revision.tools.length} configured`} />
          </div>
        </DetailSection>

        <DetailSection
          icon={Wrench}
          title="Connected resources"
          description="Tools and approved sources attached to this build."
        >
          <ResourceList
            empty="No tools attached"
            items={revision.tools.map((tool) => tool.name)}
          />
          <ResourceList
            empty="No knowledge sources attached"
            items={(revision.sources ?? []).map((source) => source.name)}
          />
        </DetailSection>

        <DetailSection
          icon={CheckCircle2}
          title="Evaluation snapshot"
          description="Latest evidence generated for this exact revision."
        >
          <Card className="border-dashed shadow-none">
            <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-3">
              <TextDetail label="Status" value={formatEvaluationStatus(latestRun?.status)} />
              <TextDetail label="Cases" value={total ? String(total) : "Not run"} />
              <TextDetail label="Started" value={latestRun ? formatDate(latestRun.startedAt) : "—"} />
            </CardContent>
          </Card>
        </DetailSection>
      </div>
    </>
  );
}

function WorkflowBuildDetail({ agentId }: { agentId: string }) {
  const state = useDemoWorkflowState();
  const store = useDemoWorkflowStore();
  const builds = useMemo(
    () => selectAgentWizardBuilds(state).filter((item) => item.agentId === agentId),
    [agentId, state],
  );
  const agent = state.agents.find((item) => item.id === agentId);
  const [selectedRevisionId, setSelectedRevisionId] = useState("");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const preferred =
      agent?.activeDraftRevisionId ?? agent?.currentApprovedRevisionId ?? builds[0]?.revisionId ?? "";
    setSelectedRevisionId((current) =>
      builds.some((build) => build.revisionId === current) ? current : preferred,
    );
  }, [agent?.activeDraftRevisionId, agent?.currentApprovedRevisionId, builds]);

  const selected = builds.find((item) => item.revisionId === selectedRevisionId) ?? builds[0];
  const revision = state.agentRevisions.find((item) => item.id === selected?.revisionId);
  const baseRevision = revision?.basedOnRevisionId
    ? state.agentRevisions.find((item) => item.id === revision.basedOnRevisionId)
    : undefined;

  if (!agent || !selected || !revision) return null;

  const createRevision = () => {
    try {
      const created = store.createAgentRevision(agent.id, "agent-wizard");
      setSelectedRevisionId(created.id);
      setNotice(`R${created.revision} draft created from the latest approved revision.`);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create revision");
    }
  };

  const markReady = () => {
    try {
      store.markReadyForTechnicalValidation(revision.id, "agent-wizard");
      setNotice(`R${revision.revision} is ready for Evaluate.`);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to prepare revision");
    }
  };

  return (
    <>
      <SheetHeader className="border-b bg-muted/20 px-6 py-5 pr-14">
        <div className="flex flex-wrap items-center gap-2">
          <SheetTitle className="text-xl">{agent.name}</SheetTitle>
          <StatusBadge status={revision.status} />
          <Badge variant="outline" className="border-primary/30 text-primary">SESSION</Badge>
        </div>
        <SheetDescription className="mt-2 max-w-2xl">{agent.description}</SheetDescription>
      </SheetHeader>

      <div className="space-y-6 px-6 py-6">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Revision</span>
            <select
              aria-label="Revision"
              className="h-9 min-w-44 rounded-md border bg-background px-3 text-sm"
              value={revision.id}
              onChange={(event) => setSelectedRevisionId(event.target.value)}
            >
              {builds.map((build) => (
                <option key={build.revisionId} value={build.revisionId}>
                  R{build.revision} · {statusLabel[build.status]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            {!agent.activeDraftRevisionId && agent.currentApprovedRevisionId ? (
              <Button variant="outline" onClick={createRevision}><Plus />Create New Revision</Button>
            ) : null}
            {agent.activeDraftRevisionId === revision.id && ["DRAFT", "READY_FOR_VALIDATION", "VALIDATION_FAILED"].includes(revision.status) ? (
              <Button variant="outline" aria-label={`Edit R${revision.revision}`} onClick={() => setEditing(true)}><Pencil />Edit R{revision.revision}</Button>
            ) : null}
            {revision.status === "DRAFT" || revision.status === "VALIDATION_FAILED" ? (
              <Button onClick={markReady}><CheckCircle2 />Mark ready for Evaluate</Button>
            ) : null}
          </div>
        </div>

        {notice ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}
        {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

        <DetailSection
          icon={GitBranch}
          title={`Revision R${revision.revision}`}
          description="Runtime and dependency snapshot for this immutable build."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Technical label="Runtime" value={revision.runtimeType} />
            <Technical label="Model" value={revision.model} />
            <Technical label="Endpoint" value={revision.endpoint} />
            <Technical label="MCP Servers" value={selected.mcpNames.join(", ") || "None"} />
            <Technical label="Skills" value={selected.skillNames.join(", ") || "None"} />
            <Technical label="Knowledge Bases" value={selected.knowledgeBaseNames.join(", ") || "None"} />
          </div>
        </DetailSection>

        <DetailSection
          icon={GitBranch}
          title="Revision comparison"
          description="Field-level changes against the approved base revision."
        >
          <RevisionDiff base={baseRevision} revision={revision} />
        </DetailSection>

        <DetailSection
          icon={ServerCog}
          title="Technical diagnostics"
          description="Evidence generated by Evaluate for this exact revision."
        >
          {revision.technicalResult ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {revision.technicalResult.checks.map((check) => (
                <Card key={check.id} className="shadow-none">
                  <CardContent className="flex gap-3 p-4">
                    <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
                    <div><strong className="text-sm">{check.label}</strong><p className="mt-1 text-xs text-muted-foreground">{check.detail}</p></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed shadow-none">
              <CardContent className="flex min-h-28 items-center gap-3 p-5 text-sm text-muted-foreground"><ServerCog className="size-6" />Run Evaluate to generate diagnostics.</CardContent>
            </Card>
          )}
        </DetailSection>
      </div>

      {editing ? (
        <EditRevisionDialog
          revision={revision}
          open
          onOpenChange={setEditing}
          onSave={(input) => {
            store.updateAgentDraft(revision.id, input, "agent-wizard");
            setEditing(false);
            setNotice(`R${revision.revision} draft saved. Run Evaluate again to refresh evidence.`);
          }}
        />
      ) : null}
    </>
  );
}

function EditRevisionDialog({ revision, open, onOpenChange, onSave }: { revision: { runtimeType: string; model: string; endpoint: string; mcpIds: string[]; skillIds: string[]; knowledgeBaseIds: string[]; revision: number }; open: boolean; onOpenChange(open: boolean): void; onSave(input: DemoAgentRevisionInput): void }) {
  const [input, setInput] = useState<DemoAgentRevisionInput>({ runtimeType: revision.runtimeType, model: revision.model, endpoint: revision.endpoint, mcpIds: [...revision.mcpIds], skillIds: [...revision.skillIds], knowledgeBaseIds: [...revision.knowledgeBaseIds] });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Edit R{revision.revision}</DialogTitle><DialogDescription>Updating a validated revision clears its evidence so it can run through Evaluate again.</DialogDescription></DialogHeader><div className="space-y-4 px-6 py-5"><label className="space-y-2"><span className="text-sm font-medium">Runtime type</span><Input aria-label="Runtime type" value={input.runtimeType} onChange={(event) => setInput({ ...input, runtimeType: event.target.value })} /></label><label className="space-y-2"><span className="text-sm font-medium">Model</span><Input aria-label="Model" value={input.model} onChange={(event) => setInput({ ...input, model: event.target.value })} /></label><label className="space-y-2"><span className="text-sm font-medium">Endpoint</span><Input aria-label="Endpoint" value={input.endpoint} onChange={(event) => setInput({ ...input, endpoint: event.target.value })} /></label></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => onSave(input)}>Save draft</Button></DialogFooter></DialogContent></Dialog>;
}

function DetailSection({ icon: Icon, title, description, children }: { icon: typeof GitBranch; title: string; description: string; children: React.ReactNode }) { return <section className="space-y-3"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span><div><h2 className="font-semibold">{title}</h2><p className="mt-0.5 text-sm text-muted-foreground">{description}</p></div></div>{children}</section>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border bg-card p-4"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-base">{value}</strong></div>; }
function Technical({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-lg border bg-muted/20 p-3"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block break-all font-mono text-xs">{value}</strong></div>; }
function TextDetail({ label, value }: { label: string; value: string }) { return <div><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-sm">{value}</strong></div>; }
function ResourceList({ items, empty }: { items: string[]; empty: string }) { return items.length ? <div className="flex flex-wrap gap-2">{items.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}</div> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{empty}</p>; }
function StatusBadge({ status }: { status: DemoRevisionStatus }) { const active = ["PUBLISHED", "VALIDATED", "READY_FOR_VALIDATION"].includes(status); return <Badge variant="outline" className={active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>{statusLabel[status]}</Badge>; }
function formatEvaluationStatus(status?: string) { return status ? status.charAt(0) + status.slice(1).toLowerCase() : "Not evaluated"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
