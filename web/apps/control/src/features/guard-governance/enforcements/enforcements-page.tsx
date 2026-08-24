import { LockKeyhole, Route, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useGuardGovernanceState } from "../mock-provider";
import { GovernancePage, GovernanceMetric } from "../shared/governance-page";
import { GovernanceStatusBadge } from "../shared/governance-status";
import { effectiveEnforcements } from "../store";
import { TrafficScopeSummary } from "../traffic-scope/traffic-scope-builder";

export function EnforcementsPage() {
  const state = useGuardGovernanceState();
  const enforcements = effectiveEnforcements(state);
  const baseline = enforcements.find((item) => item.isDefault);
  const custom = enforcements.filter((item) => !item.isDefault);
  const conflicts = custom.filter((item, index) => custom.some((candidate, candidateIndex) => candidateIndex !== index && candidate.priority === item.priority)).length;

  return (
    <GovernancePage title="Enforcements" description="Inspect the immutable unmatched-traffic baseline and derived custom policy order.">
      <div className="grid gap-3 sm:grid-cols-3"><GovernanceMetric label="Custom effective rules" value={custom.length} /><GovernanceMetric label="Priority conflicts" value={conflicts} /><GovernanceMetric label="Default baseline" value={baseline ? "Protected" : "Missing"} /></div>
      {baseline ? <Card className="overflow-hidden"><CardHeader className="flex grid-cols-none flex-row items-start justify-between gap-4 border-b bg-muted/25"><div className="flex gap-3"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><LockKeyhole className="size-5" /></span><div><CardTitle>Default enforcement</CardTitle><CardDescription className="mt-1">Protects requests that do not match a custom Traffic Scope.</CardDescription></div></div><GovernanceStatusBadge status="PROTECTED" /></CardHeader><CardContent className="grid p-0 sm:grid-cols-3"><Fact icon={ShieldCheck} label="Guardrail" value={baseline.guardrailName} detail={`Guardrail Version ${baseline.guardrailVersion}`} /><Fact icon={Route} label="Traffic coverage" value="Unmatched traffic" detail="Runs only after custom scopes do not match." /><Fact icon={LockKeyhole} label="Mode" value="System managed" detail="Enabled and unavailable for direct assignment or pause." /></CardContent></Card> : null}
      <section className="rounded-lg border border-primary/20 bg-primary/5 p-4"><h2 className="text-sm font-medium text-primary">Enforcement boundary</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Custom Assignments are resolved against trusted Integration context. The first matching priority runs before the default system-managed baseline.</p></section>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="size-4 text-primary" />Effective custom order</CardTitle><CardDescription>Derived from enabled Assignments pinned to active tested Guardrail Versions.</CardDescription></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-y bg-muted/35 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Priority</th><th className="px-4 py-3 font-medium">Assignment</th><th className="px-4 py-3 font-medium">Guardrail Version</th><th className="px-4 py-3 font-medium">Traffic Scope</th><th className="px-4 py-3 font-medium">Actions</th></tr></thead><tbody className="divide-y">{custom.map((item) => <tr data-testid="enforcement-row" data-priority={item.priority} key={item.assignmentId}><td className="px-4 py-4 font-mono font-medium">{item.priority}</td><td className="px-4 py-4">{item.assignmentName}</td><td className="px-4 py-4"><p>{item.guardrailName}</p><p className="mt-1 text-xs text-muted-foreground">Version {item.guardrailVersion}</p></td><td className="max-w-md px-4 py-4"><TrafficScopeSummary expression={item.trafficScope} /></td><td className="px-4 py-4 font-mono text-xs">{Array.from(new Set(item.actions)).join(" · ")}</td></tr>)}</tbody></table></div></CardContent>
      </Card>
    </GovernancePage>
  );
}

function Fact({ icon: Icon, label, value, detail }: { icon: typeof ShieldCheck; label: string; value: string; detail: string }) {
  return <div className="border-b p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className="size-4" />{label}</dt><dd className="mt-3 text-sm font-semibold">{value}</dd><dd className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</dd></div>;
}
