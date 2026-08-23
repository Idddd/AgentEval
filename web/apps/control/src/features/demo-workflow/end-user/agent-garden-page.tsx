import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { AgentGardenIcon } from "@/components/agent-garden/agent-garden-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDemoWorkflowActions, useDemoWorkflowState } from "../provider";
import { selectEndUserGarden, type EndUserAgentCardView } from "../selectors";

export function EndUserAgentGardenPage({ initialQuery = "", onInstanceProvisioned }: { initialQuery?: string; onInstanceProvisioned?: (instanceId: string) => void }) {
  const state = useDemoWorkflowState();
  const actions = useDemoWorkflowActions();
  const agents = useMemo(() => selectEndUserGarden(state), [state]);
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState<EndUserAgentCardView>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", team: "Customer Service Operations", intendedUse: "Resolve customer cases using approved policy guidance." });
  const visibleAgents = agents.filter((agent) => `${agent.name} ${agent.description} ${agent.businessOutcome} ${agent.targetUsers} ${agent.typicalScenarios.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));

  const openApply = (agent: EndUserAgentCardView) => {
    setSelected(agent);
    setError("");
    setForm({
      name: `${agent.name.replace(/\s+Assistant$/, "")} Pilot`,
      team: "Customer Service Operations",
      intendedUse: "Resolve customer cases using approved policy guidance.",
    });
  };

  const apply = () => {
    if (!selected) return;
    const agent = state.agents.find((item) => item.id === selected.agentId);
    if (!agent?.currentApprovedRevisionId) return;
    try {
      const instance = actions.provisionInstance({
        agentId: agent.id,
        revisionId: agent.currentApprovedRevisionId,
        name: form.name,
        team: form.team,
        intendedUse: form.intendedUse,
      });
      setSelected(undefined);
      setNotice("Instance request submitted");
      setError("");
      onInstanceProvisioned?.(instance.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to apply Instance");
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader title="Agent Garden" description="Choose an approved business capability and apply an Instance—no technical setup required." badge={<Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Approved catalog</Badge>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric icon={Sparkles} label="Available Agents" value={agents.length} />
        <Metric icon={ShieldCheck} label="Business approved" value={agents.length} />
        <Metric icon={Users} label="My Instances" value={state.instances.length} />
      </div>
      {notice ? <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="size-4" />{notice}</p> : null}
      <label className="relative block max-w-xl">
        <span className="sr-only">Search approved Agents</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-11 pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search business outcomes or scenarios…" />
      </label>
      {visibleAgents.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleAgents.map((agent) => (
            <article key={agent.agentId} className="flex min-h-[340px] flex-col rounded-xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                {agent.runtimeType === "openclaw" ? (
                  <AgentGardenIcon type="openclaw" className="rounded-xl" />
                ) : (
                  <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="size-5" /></span>
                )}
                <div className="flex gap-2"><Badge variant="outline">Stable R{agent.revisionNumber}</Badge><Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{agent.availability}</Badge></div>
              </div>
              <h2 className="mt-5 text-lg font-semibold">{agent.name}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{agent.description}</p>
              <div className="mt-4 rounded-lg border bg-muted/20 p-3"><span className="text-xs text-muted-foreground">Business outcome</span><strong className="mt-1 block text-sm">{agent.businessOutcome}</strong></div>
              <div className="mt-3 flex flex-wrap gap-2">{agent.typicalScenarios.map((scenario) => <Badge key={scenario} variant="secondary" className="font-normal">{scenario}</Badge>)}</div>
              <div className="mt-auto pt-5"><div className="mb-3 flex items-center justify-between text-xs text-muted-foreground"><span>For {agent.targetUsers}</span><span>{agent.businessEvalSummary}</span></div><Button className="w-full" onClick={() => openApply(agent)}>Apply Instance <ArrowRight /></Button></div>
            </article>
          ))}
        </div>
      ) : <Card className="border-dashed"><CardContent className="grid min-h-56 place-items-center p-8 text-center"><div><Search className="mx-auto size-9 text-muted-foreground" /><h2 className="mt-3 font-semibold">No approved Agent matches</h2><p className="mt-1 text-sm text-muted-foreground">Clear the search to see the complete approved catalog.</p></div></CardContent></Card>}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(undefined); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply {selected?.name}</DialogTitle><DialogDescription>Create a personal business Instance from the latest approved stable version.</DialogDescription></DialogHeader>
          <div className="grid gap-4 px-6 py-5">
            {error ? <p role="alert" className="rounded-md bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
            <Field label="Instance name"><Input aria-label="Instance name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
            <Field label="Team"><Input aria-label="Team" value={form.team} onChange={(event) => setForm((current) => ({ ...current, team: event.target.value }))} /></Field>
            <Field label="Intended use"><Textarea aria-label="Intended use" rows={4} value={form.intendedUse} onChange={(event) => setForm((current) => ({ ...current, intendedUse: event.target.value }))} /></Field>
            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground"><strong className="text-foreground">Session demo</strong><p className="mt-1">This Instance is visible only in the current browser session and disappears after refresh.</p></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSelected(undefined)}>Cancel</Button><Button disabled={!form.name.trim() || !form.team.trim() || !form.intendedUse.trim()} onClick={apply}>Apply Instance</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-sm font-medium">{label}{children}</label>; }
function Metric({ icon: Icon, label, value }: { icon: typeof Sparkles; label: string; value: number }) { return <Card><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span><div><span className="text-xs text-muted-foreground">{label}</span><strong className="block text-2xl tabular-nums">{value}</strong></div></CardContent></Card>; }
