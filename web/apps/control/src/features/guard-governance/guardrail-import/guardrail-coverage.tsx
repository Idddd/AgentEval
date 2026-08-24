import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Boxes,
  CheckCircle2,
  Database,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  GovernedResourceKind,
  GuardGovernanceState,
} from "../model";
import { useGuardGovernanceState, useGuardGovernanceStore } from "../mock-provider";
import { guardrailCoverageRows } from "../store";
import { EntitySheet } from "./components/entity-sheet";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { cn } from "./lib/utils";

export const resourceKindLabels: Record<GovernedResourceKind, string> = {
  agent: "Agents",
  mcp: "MCP Servers",
  kb: "Knowledge Bases",
  skill: "Skills",
};

const resourceKinds = Object.keys(resourceKindLabels) as GovernedResourceKind[];

export function coverageSummary(state: GuardGovernanceState, guardrailId: string) {
  const rows = guardrailCoverageRows(state, guardrailId);
  const requirements = state.coverageRequirements.filter(
    (item) => item.guardrailId === guardrailId && item.enabled,
  );
  const requiredKinds = [...new Set(requirements.flatMap((item) => item.resourceKinds))];
  return {
    rows,
    applied: rows.filter((row) => row.applied).length,
    gaps: rows.filter((row) => row.required && !row.applied).length,
    requiredKinds,
    requirementLabel: requiredKinds.length
      ? requiredKinds.map((kind) => resourceKindLabels[kind]).join(" · ")
      : "Selected resources only",
  };
}

export function GuardrailScopeBadges({
  state,
  guardrailId,
}: {
  state: GuardGovernanceState;
  guardrailId: string;
}) {
  const summary = coverageSummary(state, guardrailId);
  const hasDirect = summary.rows.some((row) => row.source === "DIRECT");

  return (
    <div className="flex max-w-sm flex-wrap gap-1.5">
      {summary.requiredKinds.map((kind) => (
        <span
          key={kind}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/[0.05] px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary"
        >
          <ResourceKindIcon kind={kind} className="size-3.5" />
          All {resourceKindLabels[kind]}
        </span>
      ))}
      {hasDirect ? (
        <span className="inline-flex items-center rounded-md border bg-muted/40 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Selected targets
        </span>
      ) : null}
      {!summary.requiredKinds.length && !hasDirect ? (
        <span className="inline-flex items-center rounded-md border border-dashed px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          No policy scope
        </span>
      ) : null}
    </div>
  );
}

export function GuardrailImpactSummary({
  state,
  guardrailId,
}: {
  state: GuardGovernanceState;
  guardrailId: string;
}) {
  const summary = coverageSummary(state, guardrailId);
  const counts = resourceKinds
    .map((kind) => ({
      kind,
      count: summary.rows.filter(
        (row) => row.applied && row.resource.kind === kind,
      ).length,
    }))
    .filter((item) => item.count > 0);

  return (
    <div>
      <p className="text-lg font-semibold tabular-nums">
        {summary.applied}{" "}
        <span className="text-sm font-medium">
          target{summary.applied === 1 ? "" : "s"}
        </span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {counts.length
          ? counts
              .map(
                ({ kind, count }) =>
                  `${count} ${resourceKindLabels[kind].replace(/s$/, "")}${count === 1 ? "" : "s"}`,
              )
              .join(" · ")
          : "No current impact"}
      </p>
    </div>
  );
}

export function GuardrailCoveragePanel({
  guardrailId,
  systemManaged,
}: {
  guardrailId: string;
  systemManaged: boolean;
}) {
  const state = useGuardGovernanceState();
  const [manageOpen, setManageOpen] = useState(false);
  const [targetQuery, setTargetQuery] = useState("");
  const [targetKind, setTargetKind] = useState<"all" | GovernedResourceKind>("all");
  const [visibleLimit, setVisibleLimit] = useState(20);
  const summary = coverageSummary(state, guardrailId);
  const firstGap = summary.rows.find((row) => row.required && !row.applied);
  const orderedRows = [...summary.rows].sort(
    (left, right) => Number(right.resource.kind === "agent") - Number(left.resource.kind === "agent"),
  );
  const normalizedQuery = targetQuery.trim().toLowerCase();
  const filteredRows = orderedRows.filter(
    (row) =>
      (targetKind === "all" || row.resource.kind === targetKind) &&
      (!normalizedQuery ||
        `${row.resource.name} ${row.resource.owner}`
          .toLowerCase()
          .includes(normalizedQuery)),
  );
  const visibleRows = filteredRows.slice(0, visibleLimit);

  return (
    <div className="space-y-5">
      <section className="grid overflow-hidden rounded-lg border bg-card md:grid-cols-3">
        <div className="border-b p-4 md:border-b-0 md:border-r">
          <p className="text-xs font-medium text-muted-foreground">Policy scope</p>
          <div className="mt-3">
            <GuardrailScopeBadges state={state} guardrailId={guardrailId} />
          </div>
        </div>
        <div className="border-b p-4 md:border-b-0 md:border-r">
          <p className="text-xs font-medium text-muted-foreground">Current impact</p>
          <div className="mt-2">
            <GuardrailImpactSummary state={state} guardrailId={guardrailId} />
          </div>
        </div>
        <div className={cn("p-4", summary.gaps && "bg-amber-50/60 dark:bg-amber-950/20")}>
          <p className="text-xs font-medium text-muted-foreground">Coverage status</p>
          <p className={cn("mt-2 flex items-center gap-2 text-lg font-semibold", summary.gaps ? "text-amber-700" : "text-emerald-700")}>
            {summary.gaps ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
            {summary.gaps ? `${summary.gaps} missing` : "Complete"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {firstGap ? `${firstGap.resource.name} is not protected` : "Every required target is protected"}
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-medium">Impacted targets</h3>
          <p className="mt-1 text-sm text-muted-foreground">Search the exact Agents and connected resources affected by this Guardrail.</p>
        </div>
        {!systemManaged ? (
          <Button onClick={() => setManageOpen(true)}>
            <ShieldCheck /> Manage policy scope
          </Button>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col gap-3 border-b bg-muted/20 p-3 sm:flex-row sm:items-center">
          <Input
            aria-label="Search impacted targets"
            placeholder="Search Agents or owners"
            value={targetQuery}
            onChange={(event) => {
              setTargetQuery(event.target.value);
              setVisibleLimit(20);
            }}
          />
          <select
            aria-label="Filter impacted target type"
            className="h-10 rounded-md border bg-background px-3 text-sm sm:w-48"
            value={targetKind}
            onChange={(event) => {
              setTargetKind(event.target.value as "all" | GovernedResourceKind);
              setVisibleLimit(20);
            }}
          >
            <option value="all">All target types</option>
            {resourceKinds.map((kind) => (
              <option key={kind} value={kind}>{resourceKindLabels[kind]}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_220px_120px] border-b bg-muted/40 px-4 py-3 text-xs font-medium text-muted-foreground">
          <span>Agent or connected resource</span><span>Relationship</span><span>Status</span>
        </div>
        <div className="divide-y">
          {visibleRows.map((row) => (
            <div key={row.resource.id} className="grid grid-cols-[minmax(0,1fr)_220px_120px] items-center gap-3 px-4 py-3 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border", row.resource.kind === "agent" ? "border-primary/25 bg-primary/5 text-primary" : "bg-muted/35 text-muted-foreground")}>
                  <ResourceKindIcon kind={row.resource.kind} className="size-4" />
                </span>
                <div className="min-w-0"><strong className="block truncate font-medium">{row.resource.name}</strong><p className="mt-0.5 truncate text-xs text-muted-foreground">{resourceKindLabels[row.resource.kind].replace(/s$/, "")} · {row.resource.owner}</p></div>
              </div>
              <span>
                {row.source === "DIRECT" ? (
                  <span className="inline-flex rounded-md border bg-muted/40 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Direct · Selected
                  </span>
                ) : row.required ? (
                  <span className="inline-flex rounded-md border border-primary/20 bg-primary/[0.05] px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    Policy · All {resourceKindLabels[row.resource.kind]}
                  </span>
                ) : "—"}
              </span>
              <span className={row.applied ? "text-emerald-700" : "font-medium text-amber-700"}>{row.applied ? "Protected" : "Fix now"}</span>
            </div>
          ))}
          {!filteredRows.length ? <p className="p-6 text-sm text-muted-foreground">No impacted targets match this view.</p> : null}
        </div>
        {filteredRows.length ? (
          <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            <span>Showing {visibleRows.length} of {filteredRows.length} targets</span>
            {visibleRows.length < filteredRows.length ? (
              <Button size="sm" variant="outline" onClick={() => setVisibleLimit((current) => current + 20)}>
                Show more
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <ManageCoverageSheet
        guardrailId={guardrailId}
        open={manageOpen}
        onOpenChange={setManageOpen}
      />
    </div>
  );
}

function ResourceKindIcon({
  kind,
  className,
}: {
  kind: GovernedResourceKind;
  className?: string;
}) {
  const Icon = kind === "agent"
    ? Bot
    : kind === "mcp"
      ? Boxes
      : kind === "kb"
        ? Database
        : Sparkles;
  return <Icon className={className} />;
}

function ManageCoverageSheet({
  guardrailId,
  open,
  onOpenChange,
}: {
  guardrailId: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const state = useGuardGovernanceState();
  const store = useGuardGovernanceStore();
  const requirement = state.coverageRequirements.find(
    (item) => item.guardrailId === guardrailId && item.enabled,
  );
  const directIds = state.guardrailApplications
    .filter((item) => item.guardrailId === guardrailId && item.source === "DIRECT")
    .map((item) => item.resourceId);
  const [selectedKinds, setSelectedKinds] = useState<GovernedResourceKind[]>([]);
  const [selectedResources, setSelectedResources] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setSelectedKinds(requirement?.resourceKinds ?? []);
    setSelectedResources(directIds);
  }, [open, requirement?.id]);

  const impacted = useMemo(() => new Set(
    state.resources
      .filter((resource) => selectedKinds.includes(resource.kind) || selectedResources.includes(resource.id))
      .map((resource) => resource.id),
  ).size, [selectedKinds, selectedResources, state.resources]);

  const save = () => {
    store.setGuardrailCoverage(guardrailId, {
      resourceKinds: selectedKinds,
      directResourceIds: selectedResources,
    });
    onOpenChange(false);
  };

  return (
    <EntitySheet
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      eyebrow="Guardrail coverage"
      title="Manage coverage"
      description="Choose what must use this Guardrail. Current matches are protected now; future matches inherit it automatically."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save}><ShieldCheck />Save coverage</Button></>}
    >
      <div className="space-y-6">
        <section>
          <h3 className="font-medium">Required for all</h3>
          <p className="mt-1 text-sm text-muted-foreground">Applies to current and future resources of these types.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {resourceKinds.map((kind) => (
              <label key={kind} className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3">
                <input type="checkbox" checked={selectedKinds.includes(kind)} onChange={(event) => setSelectedKinds((current) => event.target.checked ? [...current, kind] : current.filter((item) => item !== kind))} />
                <span className="font-medium">{resourceKindLabels[kind]}</span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-medium">Also apply to selected resources</h3>
          <p className="mt-1 text-sm text-muted-foreground">Use this for exceptions outside the required types.</p>
          <div className="mt-3 max-h-64 divide-y overflow-y-auto rounded-lg border bg-card">
            {state.resources.map((resource) => {
              const coveredByKind = selectedKinds.includes(resource.kind);
              const checked = coveredByKind || selectedResources.includes(resource.id);
              return <label key={resource.id} className={cn("flex items-center gap-3 p-3", coveredByKind ? "opacity-60" : "cursor-pointer")}>
                <input type="checkbox" checked={checked} disabled={coveredByKind} onChange={(event) => setSelectedResources((current) => event.target.checked ? [...current, resource.id] : current.filter((id) => id !== resource.id))} />
                <span className="min-w-0 flex-1"><strong className="block text-sm font-medium">{resource.name}</strong><span className="text-xs text-muted-foreground">{resourceKindLabels[resource.kind].replace(/s$/, "")} · {resource.owner}</span></span>
                {coveredByKind ? <span className="text-xs text-muted-foreground">Required</span> : null}
              </label>;
            })}
          </div>
        </section>

        <section className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <h3 className="font-medium">Impact</h3>
          <p className="mt-1 text-sm text-muted-foreground">Protects {impacted} current resources. Future matching resources will be covered automatically.</p>
        </section>
      </div>
    </EntitySheet>
  );
}
