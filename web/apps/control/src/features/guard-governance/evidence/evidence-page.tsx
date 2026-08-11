import { useState } from "react";
import { Activity, Clock3, Filter, ListFilter, SearchX, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityDetailList, EntitySheet } from "@/components/shared/entity-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGuardGovernanceState } from "../mock-provider";
import type { AuditEvent, EvidenceEvent, EvidenceOutcome, GuardrailRisk } from "../model";
import { GovernancePage, GovernanceMetric } from "../shared/governance-page";
import { GovernanceStatusBadge } from "../shared/governance-status";
import { filterEvidence } from "../store";

export function EvidencePage() {
  const state = useGuardGovernanceState();
  const [guardrailId, setGuardrailId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [outcome, setOutcome] = useState<"" | EvidenceOutcome>("");
  const [risk, setRisk] = useState<"" | GuardrailRisk>("");
  const [selected, setSelected] = useState<EvidenceEvent | null>(null);
  const items = filterEvidence(state, {
    ...(guardrailId ? { guardrailId } : {}),
    ...(assignmentId ? { assignmentId } : {}),
    ...(outcome ? { outcome } : {}),
    ...(risk ? { risk } : {}),
  });

  return (
    <GovernancePage title="Evidence" description="Review control-plane audit events and complete mock decision execution traces.">
      <Tabs defaultValue="audit">
        <TabsList variant="line" className="w-full justify-start"><TabsTrigger value="audit">Audit Events</TabsTrigger><TabsTrigger value="decisions">Decision Traces</TabsTrigger></TabsList>
        <TabsContent value="audit" className="space-y-5 pt-3">
          <div className="grid gap-3 sm:grid-cols-3"><GovernanceMetric label="Audit events" value={state.auditEvents.length} /><GovernanceMetric label="Successful" value={state.auditEvents.filter((item) => item.outcome === "SUCCESS").length} /><GovernanceMetric label="Linked context" value={state.auditEvents.filter((item) => item.guardrailId || item.assignmentId).length} /></div>
          <AuditEventLog events={state.auditEvents} state={state} />
          <PrivacyNotice />
        </TabsContent>
        <TabsContent value="decisions" className="space-y-5 pt-3">
          <div className="grid gap-3 sm:grid-cols-3"><GovernanceMetric label="Decision events" value={state.decisionEvidence.length} /><GovernanceMetric label="Blocked" value={state.decisionEvidence.filter((item) => item.outcome === "BLOCK").length} /><GovernanceMetric label="Visible" value={items.length} detail="After current filters" /></div>
          <DecisionFilters state={state} guardrailId={guardrailId} assignmentId={assignmentId} outcome={outcome} risk={risk} setGuardrailId={setGuardrailId} setAssignmentId={setAssignmentId} setOutcome={setOutcome} setRisk={setRisk} />
          <DecisionLog items={items} total={state.decisionEvidence.length} onSelect={setSelected} />
          <PrivacyNotice />
        </TabsContent>
      </Tabs>

      <EntitySheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }} width="xl" eyebrow="Decision Evidence" title={selected?.id ?? "Evidence"} description={selected?.reason ?? "Recorded decision details."} footer={<Button variant="outline" onClick={() => setSelected(null)}>Close</Button>}>
        {selected ? <div className="space-y-5"><EntityDetailList items={[{ label: "Outcome", value: <GovernanceStatusBadge status={selected.outcome} /> }, { label: "Risk", value: selected.risk.replaceAll("_", " ") }, { label: "Stage", value: selected.stage }, { label: "Duration", value: `${selected.durationMs} ms` }, { label: "Guardrail", value: selected.guardrailId, mono: true }, { label: "Assignment", value: selected.assignmentId ?? "Test run", mono: true }]} /><EvidenceBlock title="Input" value={selected.input} /><EvidenceBlock title="Output" value={selected.output || "No output recorded."} /><section><h3 className="text-sm font-medium">Matched controls</h3><div className="mt-2 flex flex-wrap gap-2">{selected.matchedControls.length ? selected.matchedControls.map((item) => <code key={item} className="rounded-md border bg-muted/25 px-2 py-1 text-xs">{item}</code>) : <span className="text-sm text-muted-foreground">None</span>}</div></section><section><h3 className="text-sm font-medium">Execution trace</h3><ol className="mt-2 divide-y rounded-md border">{selected.trace.map((step) => <li key={step.id} className="grid gap-2 p-3 sm:grid-cols-[8rem_minmax(0,1fr)_5rem]"><span className="font-mono text-xs">{step.stage}</span><span className="text-sm text-muted-foreground">{step.detail}</span><span className="text-right font-mono text-xs">{step.durationMs} ms</span></li>)}</ol></section></div> : null}
      </EntitySheet>
    </GovernancePage>
  );
}

function AuditEventLog({ events, state }: { events: AuditEvent[]; state: ReturnType<typeof useGuardGovernanceState> }) {
  const context = (item: AuditEvent) => ({
    assignment: state.assignments.find((candidate) => candidate.id === item.assignmentId)?.name,
    guardrail: state.guardrails.find((candidate) => candidate.id === item.guardrailId)?.name,
  });
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="size-4 text-primary" />Control-plane event log</CardTitle><CardDescription>Immutable local records for configuration and lifecycle changes.</CardDescription></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-y bg-muted/35 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Time</th><th className="px-4 py-3 font-medium">Event</th><th className="px-4 py-3 font-medium">Context</th><th className="px-4 py-3 font-medium">Outcome</th><th className="px-4 py-3 font-medium">Evidence</th></tr></thead><tbody className="divide-y">{events.map((item) => { const names = context(item); return <tr key={item.id}><td className="px-4 py-4 align-top font-mono text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</td><td className="px-4 py-4 align-top"><p className="text-xs font-medium">{auditLabel(item.kind)}</p>{item.risk ? <p className="mt-1 text-xs capitalize text-muted-foreground">{item.risk.replaceAll("_", " ")}</p> : null}</td><td className="px-4 py-4 align-top text-xs"><p className="flex items-center gap-2"><ListFilter className="size-3.5 text-primary" />{names.assignment ?? "Control plane"}</p>{names.guardrail ? <p className="mt-1 text-muted-foreground">{names.guardrail}</p> : null}</td><td className="px-4 py-4 align-top"><GovernanceStatusBadge status={item.outcome} /></td><td className="max-w-lg px-4 py-4 align-top text-xs leading-5 text-muted-foreground">{item.detail}</td></tr>; })}</tbody></table></div></CardContent></Card>;
}

function DecisionFilters({ state, guardrailId, assignmentId, outcome, risk, setGuardrailId, setAssignmentId, setOutcome, setRisk }: { state: ReturnType<typeof useGuardGovernanceState>; guardrailId: string; assignmentId: string; outcome: "" | EvidenceOutcome; risk: "" | GuardrailRisk; setGuardrailId: (value: string) => void; setAssignmentId: (value: string) => void; setOutcome: (value: "" | EvidenceOutcome) => void; setRisk: (value: "" | GuardrailRisk) => void }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Filter className="size-4 text-primary" />Filters</CardTitle><CardDescription>Narrow decision traces without mutating the underlying fixture data.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FilterField label="Guardrail filter"><select value={guardrailId} onChange={(event) => setGuardrailId(event.target.value)}><option value="">All Guardrails</option>{state.guardrails.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FilterField><FilterField label="Assignment filter"><select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}><option value="">All Assignments</option>{state.assignments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FilterField><FilterField label="Outcome filter"><select value={outcome} onChange={(event) => setOutcome(event.target.value as "" | EvidenceOutcome)}><option value="">All outcomes</option><option value="ALLOW">Allow</option><option value="BLOCK">Block</option><option value="REDACT">Redact</option><option value="TRANSFORM">Transform</option><option value="ERROR">Error</option></select></FilterField><FilterField label="Risk filter"><select value={risk} onChange={(event) => setRisk(event.target.value as "" | GuardrailRisk)}><option value="">All risks</option><option value="prompt_injection">Prompt injection</option><option value="pii">PII</option><option value="secrets">Secrets</option><option value="content_safety">Content safety</option><option value="topic_control">Topic control</option><option value="company_policy">Company policy</option></select></FilterField></CardContent></Card>;
}

function DecisionLog({ items, total, onSelect }: { items: EvidenceEvent[]; total: number; onSelect: (item: EvidenceEvent) => void }) {
  return items.length ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="size-4 text-primary" />Decision log</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead className="border-y bg-muted/35 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Time</th><th className="px-4 py-3 font-medium">Input</th><th className="px-4 py-3 font-medium">Risk</th><th className="px-4 py-3 font-medium">Outcome</th><th className="px-4 py-3 text-right font-medium">Open</th></tr></thead><tbody className="divide-y">{items.map((item) => <tr key={item.id}><td className="px-4 py-4 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</td><td className="max-w-lg px-4 py-4">{item.input}</td><td className="px-4 py-4 text-xs capitalize">{item.risk.replaceAll("_", " ")}</td><td className="px-4 py-4"><GovernanceStatusBadge status={item.outcome} /></td><td className="px-4 py-4 text-right"><Button aria-label={`Open ${item.id}`} size="sm" variant="outline" onClick={() => onSelect(item)}>View</Button></td></tr>)}</tbody></table></div></CardContent></Card> : <EmptyState icon={SearchX} title={total ? "No Evidence matches these filters" : "No Evidence yet"} description={total ? "Clear or change one or more filters." : "Run a Guardrail test to generate local Evidence."} />;
}

function PrivacyNotice() { return <section className="rounded-lg border border-primary/20 bg-primary/5 p-4"><h3 className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4 text-primary" />Evidence privacy</h3><p className="mt-1 text-sm text-muted-foreground">Mock evidence is stored only in browser memory. Production deployments should redact sensitive content and apply retention controls before persistence.</p></section>; }
function auditLabel(kind: string) { const labels: Record<string, string> = { "guardrail.created": "Guardrail created", "guardrail.default.created": "Default Guardrail installed", "guardrail.updated": "Guardrail updated", "guardrail.test_case.created": "Test case created", "guardrail.test_case.deleted": "Test case deleted", "guardrail.test.completed": "Guardrail test completed", "guardrail.version.created": "Guardrail version created", "assignment.created": "Assignment created", "assignment.default.created": "Default Assignment installed", "assignment.updated": "Assignment updated", "integration.registered": "Integration registered", "interaction.decision": "Interaction decision", "system.seeded": "System seeded" }; return labels[kind] ?? kind.replaceAll(".", " / "); }
function FilterField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-xs font-medium text-muted-foreground [&_select]:h-10 [&_select]:rounded-md [&_select]:border [&_select]:bg-background [&_select]:px-3 [&_select]:text-sm [&_select]:text-foreground">{label}{children}</label>; }
function EvidenceBlock({ title, value }: { title: string; value: string }) { return <section className="overflow-hidden rounded-md border"><h3 className="border-b bg-muted/35 px-4 py-3 text-sm font-medium">{title}</h3><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words p-4 font-sans text-sm">{value}</pre></section>; }
