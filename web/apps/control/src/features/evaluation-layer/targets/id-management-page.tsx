import { useMemo, useState } from "react";
import { FileClock, Fingerprint, Search, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEvaluationLayerState } from "../mock-provider";
import type { EvaluationLayerTargetKind, EvaluationLayerTargetRevision } from "../model";
import { EvaluationLayerStatusBadge } from "../shared/evaluation-status";
import { EvaluationMetric, EvaluationSection, EvaluationTable } from "../shared/evaluation-ui";

const OWNERSHIP: Record<EvaluationLayerTargetKind, { team: string; manager: string }> = {
  agent: { team: "Agent Platform", manager: "Maya Chen" },
  skill: { team: "AI Enablement", manager: "Jordan Lee" },
  mcp: { team: "Platform Integrations", manager: "Sam Rivera" },
  kb: { team: "Knowledge Operations", manager: "Priya Shah" },
  guardrail: { team: "Security Governance", manager: "Elena Park" },
};

function submitterFor(revision: EvaluationLayerTargetRevision) {
  if (revision.revision === 1) return "Demo Bootstrap";
  if (revision.kind === "guardrail") return "Security Administrator";
  if (revision.kind === "skill") return "AI Enablement";
  if (revision.kind === "mcp") return "Platform Engineer";
  if (revision.kind === "kb") return "Knowledge Curator";
  return revision.revision % 2 === 0 ? "Alex Morgan" : "Agent Platform";
}

function revisionSummary(revision: EvaluationLayerTargetRevision) {
  if (revision.kind === "agent") return revision.revision === 1
    ? "Registered the target identity and initial model configuration."
    : "Updated model instructions, connected tools, and evaluation configuration.";
  if (revision.kind === "guardrail") return "Updated policy coverage and enforcement stages.";
  if (revision.kind === "skill") return "Updated skill behavior, version metadata, and tool requirements.";
  if (revision.kind === "mcp") return "Updated server endpoint and verified tool connections.";
  return "Updated knowledge sources and connection status.";
}

export function IdManagementPage() {
  const state = useEvaluationLayerState();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"ALL" | EvaluationLayerTargetKind>("ALL");
  const [selectedTargetId, setSelectedTargetId] = useState(state.targets[0]?.id ?? "");
  const revisionsByTarget = useMemo(() => {
    const result = new Map<string, EvaluationLayerTargetRevision[]>();
    for (const revision of state.targetRevisions) result.set(revision.targetId, [...(result.get(revision.targetId) ?? []), revision]);
    for (const revisions of result.values()) revisions.sort((a, b) => b.revision - a.revision);
    return result;
  }, [state.targetRevisions]);
  const filteredTargets = state.targets.filter((target) => {
    const owner = OWNERSHIP[target.kind];
    const text = `${target.name} ${target.id} ${owner.team} ${owner.manager}`.toLowerCase();
    return (kind === "ALL" || target.kind === kind) && (!query || text.includes(query.toLowerCase()));
  });
  const selectedTarget = state.targets.find((target) => target.id === selectedTargetId) ?? filteredTargets[0] ?? state.targets[0];
  const selectedRevisions = selectedTarget ? revisionsByTarget.get(selectedTarget.id) ?? [] : [];
  const currentRevision = selectedRevisions.find((revision) => revision.id === selectedTarget?.currentRevisionId) ?? selectedRevisions[0];
  const ownerCount = new Set(state.targets.map((target) => OWNERSHIP[target.kind].team)).size;
  const recentCutoff = Date.now() - 1000 * 60 * 60 * 24 * 30;
  const recentUpdates = state.targetRevisions.filter((revision) => new Date(revision.createdAt).getTime() >= recentCutoff).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <EvaluationMetric compact label="Registered targets" value={state.targets.length} detail="Stable identities across all types" />
        <EvaluationMetric compact label="Version records" value={state.targetRevisions.length} detail="Immutable revision history" />
        <EvaluationMetric compact label="Managing teams" value={ownerCount} detail="Clear operational ownership" />
        <EvaluationMetric compact label="Recent updates" value={recentUpdates} detail="Submitted in the last 30 days" />
      </div>
      <EvaluationSection title="Target registry" description="See each target's stable identity, current version, submitter, and owner." action={(
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Search target identities" className="h-9 w-60 pl-8" placeholder="Search targets or owners" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <select aria-label="Target type" className="h-9 rounded-md border bg-background px-3 text-sm" value={kind} onChange={(event) => setKind(event.target.value as "ALL" | EvaluationLayerTargetKind)}>
            <option value="ALL">All target types</option><option value="agent">Agents</option><option value="skill">Skills</option><option value="mcp">MCP servers</option><option value="kb">Knowledge bases</option><option value="guardrail">Guardrails</option>
          </select>
        </div>
      )}>
        <EvaluationTable density="compact">
          <thead><tr><th>Target</th><th>Type</th><th>Current</th><th>Versions</th><th>Managed by</th><th>Last submitted by</th><th>Updated</th><th /></tr></thead>
          <tbody>{filteredTargets.map((target) => {
            const revisions = revisionsByTarget.get(target.id) ?? [];
            const latest = revisions[0];
            const owner = OWNERSHIP[target.kind];
            return <tr key={target.id} className={selectedTarget?.id === target.id ? "bg-cyan-500/5" : undefined}>
              <td><p className="font-medium">{target.name}</p><p className="max-w-52 truncate text-[11px] text-muted-foreground" title={target.id}>{target.id}</p></td>
              <td className="capitalize">{target.kind === "kb" ? "Knowledge base" : target.kind}</td><td>R{latest?.revision ?? 1}</td><td>{revisions.length}</td>
              <td><p className="font-medium">{owner.team}</p><p className="text-[11px] text-muted-foreground">{owner.manager}</p></td><td>{latest ? submitterFor(latest) : "Demo Bootstrap"}</td><td>{new Date(latest?.createdAt ?? target.createdAt).toLocaleDateString()}</td>
              <td><Button size="sm" variant={selectedTarget?.id === target.id ? "secondary" : "outline"} onClick={() => setSelectedTargetId(target.id)}>View history</Button></td>
            </tr>;
          })}</tbody>
        </EvaluationTable>
        {!filteredTargets.length ? <p className="py-8 text-center text-sm text-muted-foreground">No target identities match these filters.</p> : null}
      </EvaluationSection>
      {selectedTarget ? <div className="grid items-start gap-4 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <EvaluationSection title="Identity record" description="Stable across every version of this target."><div className="space-y-3">
          <div className="flex items-start gap-3"><div className="rounded-md border bg-cyan-500/10 p-2 text-cyan-700"><Fingerprint className="size-5" /></div><div className="min-w-0"><p className="font-semibold">{selectedTarget.name}</p><p className="break-all text-xs text-muted-foreground">{selectedTarget.id}</p></div></div>
          <div className="grid grid-cols-2 overflow-hidden rounded-md border text-sm">
            <div className="border-b border-r p-2.5"><p className="text-xs text-muted-foreground">Current version</p><p className="mt-0.5 font-semibold">R{currentRevision?.revision ?? 1}</p></div>
            <div className="border-b p-2.5"><p className="text-xs text-muted-foreground">Status</p><div className="mt-1"><EvaluationLayerStatusBadge status={selectedTarget.liveStatus} /></div></div>
            <div className="col-span-2 border-b p-2.5"><p className="text-xs text-muted-foreground">Managed by</p><p className="mt-0.5 font-semibold">{OWNERSHIP[selectedTarget.kind].team}</p><p className="text-xs text-muted-foreground">{OWNERSHIP[selectedTarget.kind].manager}</p></div>
            <div className="col-span-2 p-2.5"><p className="text-xs text-muted-foreground">Created</p><p className="mt-0.5 font-medium">{new Date(selectedTarget.createdAt).toLocaleString()}</p></div>
          </div>
        </div></EvaluationSection>
        <EvaluationSection title="Version history" description="Who submitted each immutable version and what changed."><div className="divide-y rounded-md border">
          {selectedRevisions.map((revision, index) => <div key={revision.id} className="grid gap-3 p-3 sm:grid-cols-[5rem_minmax(0,1fr)_13rem]">
            <div><p className="text-base font-semibold">R{revision.revision}</p><Badge variant="outline" className={index === 0 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "text-muted-foreground"}>{index === 0 ? "Current" : "Superseded"}</Badge></div>
            <div><p className="font-medium">{revisionSummary(revision)}</p><p className="mt-1 text-xs text-muted-foreground">Version ID: {revision.id}</p></div>
            <div className="text-sm"><p className="flex items-center gap-1.5 font-medium"><UserRound className="size-3.5" />{submitterFor(revision)}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><FileClock className="size-3.5" />{new Date(revision.createdAt).toLocaleString()}</p></div>
          </div>)}
          {!selectedRevisions.length ? <p className="p-6 text-center text-sm text-muted-foreground">No version records are available.</p> : null}
        </div></EvaluationSection>
      </div> : null}
    </div>
  );
}
