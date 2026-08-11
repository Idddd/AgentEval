import { useMemo, useState } from "react";
import { ListFilter, Plus, ShieldCheck } from "lucide-react";
import { EntitySheet } from "@/components/shared/entity-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useGuardGovernanceState, useGuardGovernanceStore } from "../mock-provider";
import type { TrafficScopeExpression } from "../model";
import { GovernancePage, GovernanceMetric } from "../shared/governance-page";
import { GovernanceStatusBadge } from "../shared/governance-status";
import { FormSection } from "../shared/form-section";
import { readyGuardrails } from "../store";
import { TrafficScopeBuilder, TrafficScopeSummary } from "../traffic-scope/traffic-scope-builder";

const emptyScope: TrafficScopeExpression = {
  combinator: "and",
  rules: [{ field: "environment", operator: "equals", value: "" }],
};

export function AssignmentsPage() {
  const state = useGuardGovernanceState();
  const store = useGuardGovernanceStore();
  const available = readyGuardrails(state);
  const ordered = useMemo(() => [...state.assignments].sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.priority - right.priority), [state.assignments]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [guardrailId, setGuardrailId] = useState(available[0]?.id ?? "");
  const [priority, setPriority] = useState(50);
  const [scope, setScope] = useState<TrafficScopeExpression>(emptyScope);
  const [error, setError] = useState("");
  const selected = available.find((item) => item.id === guardrailId);
  const close = () => { setCreateOpen(false); setName(""); setGuardrailId(available[0]?.id ?? ""); setPriority(50); setScope(emptyScope); setError(""); };
  const create = () => {
    try { store.createAssignment({ name, guardrailId, priority, enabled: true, trafficScope: scope }); close(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create Assignment"); }
  };

  return (
    <GovernancePage title="Assignments" description="Bind reviewed traffic characteristics to an immutable tested Guardrail Version." actions={<Button disabled={!available.length} onClick={() => setCreateOpen(true)}><Plus />Create Assignment</Button>}>
      <div className="grid gap-3 sm:grid-cols-3"><GovernanceMetric label="Assignments" value={state.assignments.length} /><GovernanceMetric label="Protected" value={state.assignments.filter((item) => item.enabled).length} /><GovernanceMetric label="Tested Guardrails" value={available.length} detail="Eligible for new bindings" /></div>
      <section className="flex items-start gap-3 rounded-lg border bg-card p-4"><ListFilter className="mt-0.5 size-4 text-primary" /><div><h2 className="text-sm font-medium">Precedence and baseline</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Specific Traffic Scopes are evaluated in priority order. The system-managed baseline protects traffic that does not match a custom Assignment.</p></div></section>
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20"><CardTitle className="flex items-center gap-2"><ListFilter className="size-4 text-primary" />Traffic bindings</CardTitle><CardDescription>Each Assignment is pinned to the version that passed reviewed tests.</CardDescription></CardHeader>
        <CardContent className="p-0"><div className="hidden grid-cols-[minmax(210px,1.1fr)_minmax(320px,1.8fr)_minmax(180px,.8fr)_140px] border-b bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid"><span>Assignment</span><span>Traffic Scope</span><span>Guardrail Version</span><span>Status</span></div><div className="divide-y">{ordered.map((assignment) => { const guardrail = state.guardrails.find((item) => item.id === assignment.guardrailId); return <article key={assignment.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(210px,1.1fr)_minmax(320px,1.8fr)_minmax(180px,.8fr)_140px] lg:items-center"><div><div className="flex items-center gap-2"><ListFilter className="size-4 text-primary" /><strong>{assignment.name}</strong>{assignment.isDefault ? <span className="rounded-md border bg-muted px-2 py-0.5 text-[10px]">Default</span> : null}</div><p className="mt-2 text-xs text-muted-foreground">{assignment.isDefault ? "System-managed unmatched-traffic protection" : `${countRules(assignment.trafficScope)} conditions · Priority ${assignment.priority}`}</p></div><TrafficScopeSummary expression={assignment.trafficScope} /><div><p className="text-sm font-medium">{guardrail?.name ?? assignment.guardrailId}</p><p className="mt-1 text-xs text-muted-foreground">Guardrail Version {assignment.guardrailVersion}</p></div><div className="flex items-center justify-between gap-3"><GovernanceStatusBadge status={assignment.enabled ? "PROTECTED" : "PAUSED"} />{assignment.systemManaged ? <span className="text-xs font-medium text-muted-foreground">Baseline</span> : <input aria-label={`${assignment.enabled ? "Pause" : "Enable"} ${assignment.name}`} type="checkbox" checked={assignment.enabled} onChange={(event) => store.toggleAssignment(assignment.id, event.target.checked)} />}</div></article>; })}</div></CardContent>
      </Card>

      <EntitySheet open={createOpen} onOpenChange={(open) => { if (!open) close(); else setCreateOpen(true); }} width="xl" eyebrow="Guardrail / assignment" title="Create Assignment" description="Match trusted traffic characteristics and pin a tested Guardrail Version." footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button disabled={!name.trim() || !guardrailId} onClick={create}><ShieldCheck />Create</Button></>}>
        {!available.length ? <section className="rounded-lg border p-6 text-center"><h3 className="font-medium">No tested Guardrails</h3><p className="mt-2 text-sm text-muted-foreground">Run reviewed test cases and activate a version before creating an Assignment.</p></section> : <div className="space-y-7"><FormSection number={1} title="Traffic characteristics" description="Name this binding and define trusted request metadata. Header and JWT values are accepted only after the Integration verifies them."><Field label="Assignment name"><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field><TrafficScopeBuilder definitions={state.trafficScopeFields} value={scope} onChange={setScope} /><section className="rounded-lg border border-primary/20 bg-primary/5 p-4"><h3 className="text-sm font-medium text-primary">Trusted Traffic Scope</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Only normalized adapter fields, verified headers, and verified JWT claims participate in matching.</p></section></FormSection><FormSection number={2} title="Apply Guardrail" description="The active tested version is pinned when the Assignment is created."><div className="grid gap-4 sm:grid-cols-2"><Field label="Guardrail"><select className="h-11 rounded-md border bg-background px-3" value={guardrailId} onChange={(event) => setGuardrailId(event.target.value)}>{available.map((guardrail) => <option key={guardrail.id} value={guardrail.id}>{guardrail.name}</option>)}</select></Field><Field label="Priority"><Input min={1} type="number" value={priority} onChange={(event) => setPriority(Number(event.target.value))} /></Field></div>{selected ? <div className="grid gap-3 rounded-lg border bg-muted/25 p-4 sm:grid-cols-3"><Fact label="Selected Guardrail" value={selected.name} /><Fact label="Controls" value={`${selected.controls.length} reviewed`} /><Fact label="Test evidence" value={`${selected.testCaseCount} cases · Version ${selected.activeVersion}`} /></div> : null}</FormSection>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}</div>}
      </EntitySheet>
    </GovernancePage>
  );
}

export function scopeSummary(scope: TrafficScopeExpression): string {
  if (!scope.rules.length) return "Unmatched traffic";
  return scope.rules.map((rule) => "rules" in rule ? `(${scopeSummary(rule)})` : `${rule.field}${rule.key ? `:${rule.key}` : ""} ${rule.operator.replaceAll("_", " ")} “${rule.value}”`).join(` ${scope.combinator.toUpperCase()} `);
}
function countRules(scope: TrafficScopeExpression): number { return scope.rules.reduce((total, item) => total + ("rules" in item ? countRules(item) : 1), 0); }
function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="grid gap-2 text-sm font-medium">{label}{children}</label>; }
function Fact({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>; }
