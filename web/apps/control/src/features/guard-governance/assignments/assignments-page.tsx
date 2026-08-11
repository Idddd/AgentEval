import { useState } from "react";
import { ListFilter, Plus } from "lucide-react";
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
import { TrafficScopeBuilder } from "../traffic-scope/traffic-scope-builder";

const emptyScope: TrafficScopeExpression = {
  combinator: "and",
  rules: [{ field: "environment", operator: "equals", value: "" }],
};

export function AssignmentsPage() {
  const state = useGuardGovernanceState();
  const store = useGuardGovernanceStore();
  const available = readyGuardrails(state);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [guardrailId, setGuardrailId] = useState(available[0]?.id ?? "");
  const [priority, setPriority] = useState(50);
  const [scope, setScope] = useState<TrafficScopeExpression>(emptyScope);
  const [error, setError] = useState("");
  const enabled = state.assignments.filter((item) => item.enabled).length;

  const close = () => {
    setCreateOpen(false);
    setName("");
    setGuardrailId(available[0]?.id ?? "");
    setPriority(50);
    setScope(emptyScope);
    setError("");
  };

  const create = () => {
    try {
      store.createAssignment({
        name,
        guardrailId,
        priority,
        enabled: true,
        trafficScope: scope,
      });
      close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create Assignment");
    }
  };

  return (
    <GovernancePage
      title="Assignments"
      description="Bind a tested Guardrail to a precise slice of model traffic. Lower priorities execute first."
      actions={<Button disabled={!available.length} onClick={() => setCreateOpen(true)}><Plus />Create Assignment</Button>}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <GovernanceMetric label="Assignments" value={state.assignments.length} />
        <GovernanceMetric label="Enabled" value={enabled} />
        <GovernanceMetric label="Ready Guardrails" value={available.length} detail="Eligible for new bindings" />
      </div>
      {!available.length ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800">Run and pass at least one Guardrail test before creating an Assignment.</div> : null}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ListFilter className="size-4 text-primary" />Traffic bindings</CardTitle><CardDescription>Each binding contributes to the derived Enforcement order.</CardDescription></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-y bg-muted/35 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Assignment</th><th className="px-4 py-3 font-medium">Guardrail</th><th className="px-4 py-3 font-medium">Scope</th><th className="px-4 py-3 font-medium">Priority</th><th className="px-4 py-3 text-right font-medium">Enabled</th></tr></thead><tbody className="divide-y">{state.assignments.map((assignment) => { const guardrail = state.guardrails.find((item) => item.id === assignment.guardrailId); return <tr key={assignment.id}><td className="px-4 py-4 font-medium">{assignment.name}</td><td className="px-4 py-4"><p>{guardrail?.name ?? "Missing Guardrail"}</p>{guardrail ? <div className="mt-1"><GovernanceStatusBadge status={guardrail.status} /></div> : null}</td><td className="max-w-sm px-4 py-4 text-xs text-muted-foreground">{scopeSummary(assignment.trafficScope)}</td><td className="px-4 py-4 font-mono text-xs">{assignment.priority}</td><td className="px-4 py-4 text-right"><label className="inline-flex min-h-11 cursor-pointer items-center gap-2"><span className="text-xs text-muted-foreground">{assignment.enabled ? "On" : "Off"}</span><input aria-label={`${assignment.enabled ? "Disable" : "Enable"} ${assignment.name}`} type="checkbox" checked={assignment.enabled} onChange={(event) => store.toggleAssignment(assignment.id, event.target.checked)} /></label></td></tr>; })}</tbody></table></div>
        </CardContent>
      </Card>

      <EntitySheet open={createOpen} onOpenChange={(open) => { if (!open) close(); else setCreateOpen(true); }} width="xl" eyebrow="Guard Governance" title="Create Assignment" description="Match traffic characteristics, select a Ready Guardrail, and choose its execution priority." footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={create}>Create</Button></>}>
        <div className="space-y-7">
          <FormSection number={1} title="Traffic identity" description="Name this binding and define the request characteristics it matches.">
            <Field label="Name"><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <TrafficScopeBuilder value={scope} onChange={setScope} />
          </FormSection>
          <FormSection number={2} title="Apply Guardrail" description="Only Guardrails with a passing latest test are available.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Guardrail"><select className="h-11 rounded-md border bg-background px-3" value={guardrailId} onChange={(event) => setGuardrailId(event.target.value)}>{available.map((guardrail) => <option key={guardrail.id} value={guardrail.id}>{guardrail.name}</option>)}</select></Field>
              <Field label="Priority"><Input min={1} type="number" value={priority} onChange={(event) => setPriority(Number(event.target.value))} /></Field>
            </div>
          </FormSection>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
      </EntitySheet>
    </GovernancePage>
  );
}

export function scopeSummary(scope: TrafficScopeExpression) {
  return scope.rules.map((rule) => `${rule.field} ${rule.operator.replaceAll("_", " ")} “${rule.value}”`).join(` ${scope.combinator.toUpperCase()} `);
}
function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="grid gap-2 text-sm font-medium">{label}{children}</label>; }
