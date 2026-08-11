import { AlertTriangle, LockKeyhole, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useGuardGovernanceState } from "../mock-provider";
import { GovernancePage, GovernanceMetric } from "../shared/governance-page";
import { effectiveEnforcements } from "../store";
import { scopeSummary } from "../assignments/assignments-page";

export function EnforcementsPage() {
  const state = useGuardGovernanceState();
  const enforcements = effectiveEnforcements(state);
  const conflicts = enforcements.filter((item, index) => enforcements.some((candidate, candidateIndex) => candidateIndex !== index && candidate.priority === item.priority)).length;

  return (
    <GovernancePage title="Enforcements" description="Inspect the read-only policy order derived from enabled Assignments and Ready Guardrails.">
      <div className="grid gap-3 sm:grid-cols-3"><GovernanceMetric label="Effective rules" value={enforcements.length} /><GovernanceMetric label="Priority conflicts" value={conflicts} /><GovernanceMetric label="Inactive bindings" value={state.assignments.length - enforcements.length} /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"><p className="flex items-center gap-2 font-medium text-amber-800"><AlertTriangle className="size-4" />Uncovered traffic remains</p><p className="mt-1 text-sm text-muted-foreground">No catch-all Assignment exists. Traffic outside the listed scopes continues without a Guard Governance binding.</p></div>
        <div className="rounded-lg border border-primary/20 bg-primary/[0.035] p-4"><p className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-primary" />Enforcement boundary</p><p className="mt-1 text-sm text-muted-foreground">The first matching priority runs before model execution; additional matches remain visible for audit.</p></div>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="size-4 text-primary" />Effective order</CardTitle><CardDescription>Computed from current mock state; this list is not stored separately.</CardDescription></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-y bg-muted/35 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Priority</th><th className="px-4 py-3 font-medium">Assignment</th><th className="px-4 py-3 font-medium">Guardrail</th><th className="px-4 py-3 font-medium">Traffic scope</th><th className="px-4 py-3 font-medium">Actions</th></tr></thead><tbody className="divide-y">{enforcements.map((item) => <tr data-testid="enforcement-row" data-priority={item.priority} key={item.assignmentId}><td className="px-4 py-4 font-mono font-medium">{item.priority}</td><td className="px-4 py-4">{item.assignmentName}</td><td className="px-4 py-4">{item.guardrailName}</td><td className="max-w-md px-4 py-4 text-xs text-muted-foreground">{scopeSummary(item.trafficScope)}</td><td className="px-4 py-4 font-mono text-xs">{Array.from(new Set(item.actions)).join(" · ")}</td></tr>)}</tbody></table></div></CardContent>
      </Card>
    </GovernancePage>
  );
}
