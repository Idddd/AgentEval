import { useState } from "react";
import { ArrowLeft, FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { EntitySheet } from "@/components/shared/entity-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGuardGovernanceState, useGuardGovernanceStore } from "../mock-provider";
import type { GuardrailDecision, GuardrailRisk } from "../model";
import { GovernancePage } from "../shared/governance-page";
import { GovernanceStatusBadge } from "../shared/governance-status";

export function GuardrailDetailPage({ guardrailId, projectId }: { guardrailId: string; projectId: string }) {
  const state = useGuardGovernanceState();
  const store = useGuardGovernanceStore();
  const guardrail = state.guardrails.find((item) => item.id === guardrailId);
  const [editOpen, setEditOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [editName, setEditName] = useState(guardrail?.name ?? "");
  const [editPurpose, setEditPurpose] = useState(guardrail?.purpose ?? "");
  const [caseName, setCaseName] = useState("");
  const [caseContent, setCaseContent] = useState("");
  const [caseRisk, setCaseRisk] = useState<GuardrailRisk>("prompt_injection");
  const [expectedDecision, setExpectedDecision] = useState<GuardrailDecision>("BLOCK");

  if (!guardrail) {
    return <EmptyState icon={FlaskConical} title="Guardrail not found" description="The selected mock Guardrail does not exist." />;
  }

  const run = () => {
    setRunning(true);
    setError("");
    window.setTimeout(() => {
      try { store.runGuardrailTest(guardrail.id); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Test failed"); }
      finally { setRunning(false); }
    }, 80);
  };

  const save = () => {
    try {
      store.updateGuardrail(guardrail.id, { name: editName, purpose: editPurpose });
      setEditOpen(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save"); }
  };

  const addCase = () => {
    try {
      store.addTestCase(guardrail.id, {
        name: caseName,
        content: caseContent,
        phase: "input",
        risk: caseRisk,
        expectedDecision,
        actualDecision: expectedDecision,
      });
      setCaseOpen(false); setCaseName(""); setCaseContent("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to add Test Case"); }
  };

  return (
    <GovernancePage
      title={guardrail.name}
      description={guardrail.purpose}
      actions={<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><a href={`/${encodeURIComponent(projectId)}/governance/guardrails`}><ArrowLeft />Back</a></Button><Button variant="outline" onClick={() => { setEditName(guardrail.name); setEditPurpose(guardrail.purpose); setEditOpen(true); }}><Pencil />Edit</Button><Button aria-label="Run test" disabled={running || !guardrail.testCases.length} onClick={run}><FlaskConical />{running ? "Running…" : "Run test"}</Button></div>}
    >
      <div className="flex flex-wrap items-center gap-3"><GovernanceStatusBadge status={guardrail.status} /><span className="font-mono text-xs text-muted-foreground">{guardrail.id}</span>{guardrail.latestTestRun ? <span className="text-sm text-muted-foreground">{guardrail.latestTestRun.caseResults.length} Evidence events generated · {guardrail.latestTestRun.status}</span> : null}</div>
      {error ? <p role="alert" className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Fact label="Safety level" value={guardrail.safetyLevel} />
        <Fact label="Output delivery" value={guardrail.outputDelivery.replaceAll("_", " ")} />
        <Fact label="Assignments" value={String(state.assignments.filter((item) => item.guardrailId === guardrail.id).length)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Controls</CardTitle><CardDescription>Enabled decisions for this Guardrail.</CardDescription></CardHeader><CardContent className="space-y-2">{guardrail.controls.map((control) => <div key={control.risk} className="flex items-center justify-between rounded-md border p-3"><span className="text-sm">{control.risk.replaceAll("_", " ")}</span><span className="font-mono text-xs text-muted-foreground">{control.action}</span></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Topics</CardTitle><CardDescription>Allowed and restricted semantic boundaries.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Topic title="Allowed" items={guardrail.allowedTopics} /><Topic title="Restricted" items={guardrail.restrictedTopics} /></CardContent></Card>
      </div>
      <Card>
        <CardHeader className="flex grid-cols-none flex-row items-start justify-between gap-3"><div><CardTitle>Test Cases</CardTitle><CardDescription>Expected decisions used to promote this Guardrail.</CardDescription></div><Button size="sm" variant="outline" onClick={() => setCaseOpen(true)}><Plus />Add Test Case</Button></CardHeader>
        <CardContent className="p-0">{guardrail.testCases.length ? <div className="divide-y border-t">{guardrail.testCases.map((testCase) => <div key={testCase.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_9rem_7rem_2.75rem] sm:items-center"><div><p className="font-medium">{testCase.name}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{testCase.content}</p></div><span className="text-xs">{testCase.risk.replaceAll("_", " ")}</span><span className="font-mono text-xs">{testCase.expectedDecision}</span><Button aria-label={`Delete ${testCase.name}`} size="icon" variant="ghost" onClick={() => store.deleteTestCase(guardrail.id, testCase.id)}><Trash2 /></Button></div>)}</div> : <p className="border-t p-8 text-center text-sm text-muted-foreground">Add at least one Test Case before running a test.</p>}</CardContent>
      </Card>

      <EntitySheet open={editOpen} onOpenChange={setEditOpen} title="Edit Guardrail" description="Changes require a new passing test before Assignment." footer={<><Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></>}><div className="grid gap-5"><Field label="Name"><Input value={editName} onChange={(event) => setEditName(event.target.value)} /></Field><Field label="Purpose"><Textarea rows={4} value={editPurpose} onChange={(event) => setEditPurpose(event.target.value)} /></Field></div></EntitySheet>
      <EntitySheet open={caseOpen} onOpenChange={setCaseOpen} title="Add Test Case" description="Mock execution returns the configured expected decision." footer={<><Button variant="outline" onClick={() => setCaseOpen(false)}>Cancel</Button><Button disabled={!caseName.trim() || !caseContent.trim()} onClick={addCase}>Add</Button></>}><div className="grid gap-5"><Field label="Test Case name"><Input value={caseName} onChange={(event) => setCaseName(event.target.value)} /></Field><Field label="Input"><Textarea rows={5} value={caseContent} onChange={(event) => setCaseContent(event.target.value)} /></Field><Field label="Risk"><select className="h-11 rounded-md border bg-background px-3" value={caseRisk} onChange={(event) => setCaseRisk(event.target.value as GuardrailRisk)}><option value="prompt_injection">Prompt injection</option><option value="pii">PII</option><option value="secrets">Secrets</option><option value="content_safety">Content safety</option><option value="topic_control">Topic control</option><option value="company_policy">Company policy</option></select></Field><Field label="Expected decision"><select className="h-11 rounded-md border bg-background px-3" value={expectedDecision} onChange={(event) => setExpectedDecision(event.target.value as GuardrailDecision)}><option value="ALLOW">Allow</option><option value="BLOCK">Block</option><option value="REDACT">Redact</option><option value="TRANSFORM">Transform</option></select></Field></div></EntitySheet>
    </GovernancePage>
  );
}

function Fact({ label, value }: { label: string; value: string }) { return <Card size="sm"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="capitalize">{value}</CardTitle></CardHeader></Card>; }
function Topic({ title, items }: { title: string; items: string[] }) { return <div><p className="text-xs font-medium text-muted-foreground">{title}</p>{items.length ? <ul className="mt-2 space-y-1 text-sm">{items.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">None</p>}</div>; }
function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="grid gap-2 text-sm font-medium">{label}{children}</label>; }
