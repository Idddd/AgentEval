import { useMemo, useState } from "react";
import { Boxes, CheckCircle2, CircleStop, ExternalLink, LoaderCircle, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { AgentGardenIcon } from "@/components/agent-garden/agent-garden-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDemoWorkflowActions, useDemoWorkflowState } from "../provider";
import { selectEndUserInstances } from "../selectors";
import type { DemoInstanceStatus } from "../model";

type StatusFilter = "ALL" | DemoInstanceStatus;

export function EndUserInstancesPage({ onOpenInstance }: { onOpenInstance?: (instanceId: string) => void }) {
  const state = useDemoWorkflowState();
  const actions = useDemoWorkflowActions();
  const instances = useMemo(() => selectEndUserInstances(state), [state]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const visible = instances.filter((instance) => {
    const matchesQuery = `${instance.name} ${instance.agentName} ${instance.team} ${instance.intendedUse}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (status === "ALL" || instance.status === status);
  });

  const stop = (instanceId: string) => {
    try {
      actions.stopInstance(instanceId);
      setNotice("Stop request submitted");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to stop Instance");
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader title="My Instances" description="Continue approved work and manage the Instances created in this browser session." badge={<Badge variant="outline">End User</Badge>} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Metric label="Total" value={instances.length} />
        <Metric label="Creating" value={instances.filter((item) => item.status === "PROVISIONING").length} />
        <Metric label="Ready" value={instances.filter((item) => item.status === "READY").length} />
        <Metric label="Stopped" value={instances.filter((item) => item.status === "STOPPED").length} />
      </div>
      {notice ? <p role="status" className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm"><CheckCircle2 className="size-4 text-primary" />{notice}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}
      <Card>
        <CardHeader className="border-b"><div className="flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><span className="sr-only">Search Instances</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-11 pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Instances…" /></label><Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}><SelectTrigger aria-label="Instance status" className="h-11 sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All statuses</SelectItem><SelectItem value="PROVISIONING">Creating</SelectItem><SelectItem value="READY">Ready</SelectItem><SelectItem value="STOPPING">Stopping</SelectItem><SelectItem value="STOPPED">Stopped</SelectItem></SelectContent></Select></div></CardHeader>
        <CardContent className="p-0">
          {visible.length ? visible.map((instance) => (
            <article key={instance.id} className="group relative grid gap-4 border-b p-5 last:border-b-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_17rem] lg:items-center">
              {onOpenInstance ? <button type="button" aria-label={`View details for ${instance.name}`} className="absolute inset-0 z-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-[-2px]" onClick={() => onOpenInstance(instance.id)} /> : null}
              <div className="pointer-events-none relative z-10 flex min-w-0 gap-3">{instance.runtimeType === "openclaw" ? <AgentGardenIcon type="openclaw" className="rounded-xl transition group-hover:border-primary/30" /> : <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Boxes className="size-5" /></span>}<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><button type="button" className="pointer-events-auto font-semibold hover:text-primary hover:underline" onClick={() => onOpenInstance?.(instance.id)}>{instance.name}</button><InstanceStatus status={instance.status} /></div><p className="mt-1 text-sm text-muted-foreground">{instance.agentName} · {instance.versionLabel}</p></div></div>
              <div className="pointer-events-none relative z-10 grid gap-1 text-sm"><span><span className="text-muted-foreground">Team · </span>{instance.team}</span><span className="line-clamp-2"><span className="text-muted-foreground">Use · </span>{instance.intendedUse}</span></div>
              <div data-slot="instance-actions" className="relative z-20 flex min-h-9 flex-wrap items-center justify-end gap-2">{instance.canWork ? <Button variant="outline" onClick={() => setNotice(`${instance.name} workspace opened in demo mode`)}>Open Workspace <ExternalLink /></Button> : null}{instance.canStop ? <Button variant="outline" onClick={() => stop(instance.id)}><CircleStop />Stop Instance</Button> : null}</div>
            </article>
          )) : <div className="grid min-h-60 place-items-center p-8 text-center"><div><Boxes className="mx-auto size-10 text-muted-foreground" /><h2 className="mt-3 font-semibold">No session Instances</h2><p className="mt-1 text-sm text-muted-foreground">Apply an approved Agent from Agent Garden to get started.</p></div></div>}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Session demo · these Instances are isolated to this browser session and disappear after refresh.</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <Card><CardContent className="p-5"><span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span><strong className="mt-2 block text-3xl tabular-nums">{value}</strong></CardContent></Card>; }
function InstanceStatus({ status }: { status: DemoInstanceStatus }) { const label = status === "PROVISIONING" ? "Creating" : status === "READY" ? "Ready" : status === "STOPPING" ? "Stopping" : "Stopped"; const active = ["PROVISIONING", "STOPPING"].includes(status); const ready = status === "READY"; return <Badge variant="outline" className={ready ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>{active ? <LoaderCircle className="animate-spin" /> : null}{label}</Badge>; }
