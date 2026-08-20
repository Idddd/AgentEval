import { useMemo } from "react";
import { Activity, BadgeCheck, Boxes, ChartNoAxesCombined, CheckCircle2, CircleDollarSign, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useDemoWorkflowState } from "../provider";
import { selectAdminMonitor } from "../selectors";

export function MonitorPage() {
  const state = useDemoWorkflowState();
  const monitor = useMemo(() => selectAdminMonitor(state), [state]);
  const events = [...monitor.events].reverse();

  return (
    <div className="space-y-7">
      <PageHeader
        title="Monitor"
        description="Track adoption, business outcomes, approvals, and safety signals for this demo session."
        badge={<Badge variant="outline">Admin · Session</Badge>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={BadgeCheck} label="Published Agents" value={`${monitor.publishedAgents} published`} hint="Approved stable versions" />
        <Metric icon={Boxes} label="Active Instances" value={`${monitor.activeInstances} active`} hint={`${monitor.stoppedInstances} stopped`} />
        <Metric icon={ChartNoAxesCombined} label="Task success" value={`${monitor.taskSuccess}%`} hint="Deterministic demo outcome" />
        <Metric icon={CircleDollarSign} label="Estimated Eval cost" value={`$${monitor.estimatedCost.toFixed(2)}`} hint="Current session total" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <HealthCard icon={Users} title="Adoption" value={monitor.adoption} label="Instances applied" progress={Math.min(monitor.adoption * 25, 100)} tone="primary" />
        <HealthCard icon={ShieldCheck} title="Safety" value={monitor.guardrailIncidents} label="Guardrail incidents" progress={monitor.guardrailIncidents ? 35 : 100} tone={monitor.guardrailIncidents ? "warning" : "success"} footer={monitor.guardrailIncidents ? "Review required" : "No incidents in this session"} />
        <HealthCard icon={CheckCircle2} title="Approval coverage" value={monitor.approvalCoverage} label="Percent covered" progress={monitor.approvalCoverage} tone="success" footer={`${monitor.businessFailures} failed business evaluations`} suffix="%" />
      </div>

      <Card>
        <CardHeader className="border-b"><div className="flex items-start justify-between gap-4"><div><CardTitle>Session activity</CardTitle><p className="mt-1 text-sm text-muted-foreground">Business-visible lifecycle events from Eval, approval, and Instance activity.</p></div><Badge variant="outline">{events.length} events</Badge></div></CardHeader>
        <CardContent className="p-0">
          {events.length ? events.map((event) => (
            <article key={event.id} className="flex gap-4 border-b p-5 last:border-b-0">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Activity className="size-4" /></span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{event.label}</strong><Badge variant="outline">{event.outcome.replaceAll("_", " ").toLowerCase()}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{event.entityType.replaceAll("-", " ")} · {new Date(event.createdAt).toLocaleString()}</p></div>
            </article>
          )) : <div className="grid min-h-52 place-items-center p-8 text-center"><div><Activity className="mx-auto size-9 text-muted-foreground" /><h2 className="mt-3 font-semibold">No session activity yet</h2><p className="mt-1 text-sm text-muted-foreground">Business Eval and Instance events will appear here as the workflow progresses.</p></div></div>}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Session isolation is enabled. This dashboard never combines activity from another browser session or user.</p>
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint }: { icon: typeof Boxes; label: string; value: string; hint: string }) { return <Card><CardContent className="p-5"><div className="flex items-start justify-between"><span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span><Icon className="size-5 text-primary" /></div><strong className="mt-3 block text-2xl tabular-nums">{value}</strong><span className="mt-1 block text-xs text-muted-foreground">{hint}</span></CardContent></Card>; }
function HealthCard({ icon: Icon, title, value, suffix = "", label, progress, footer, tone }: { icon: typeof Users; title: string; value: number; suffix?: string; label: string; progress: number; footer?: string; tone: "primary" | "success" | "warning" }) { const color = tone === "success" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-primary"; return <Card><CardContent className="p-5"><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-lg bg-muted ${color}`}><Icon className="size-5" /></span><div><strong>{title}</strong><p className="text-xs text-muted-foreground">{label}</p></div><span className={`ml-auto text-2xl font-semibold tabular-nums ${color}`}>{value}{suffix}</span></div><Progress className="mt-5" value={progress} /><p className="mt-3 text-xs text-muted-foreground">{footer ?? "Current session activity"}</p></CardContent></Card>; }
