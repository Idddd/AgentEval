import { useState } from "react";
import { ArrowLeft, Building2, Check, FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { EntitySheet } from "@/components/shared/entity-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useGuardGovernanceState, useGuardGovernanceStore } from "../mock-provider";
import type { GuardrailDecision, GuardrailOutputDelivery, GuardrailRisk, GuardrailSafetyLevel, TargetSource } from "../model";
import { GovernancePage } from "../shared/governance-page";
import { GovernanceStatusBadge } from "../shared/governance-status";
import { TrafficScopeSummary } from "../traffic-scope/traffic-scope-builder";

export function GuardrailDetailPage({ guardrailId, projectId }: { guardrailId: string; projectId: string }) {
  const state = useGuardGovernanceState();
  const store = useGuardGovernanceStore();
  const guardrail = state.guardrails.find((item) => item.id === guardrailId);
  const [editOpen, setEditOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const [error, setError] = useState("");
  const [editName, setEditName] = useState(guardrail?.name ?? "");
  const [editPurpose, setEditPurpose] = useState(guardrail?.purpose ?? "");
  const [editAllowed, setEditAllowed] = useState(guardrail?.allowedTopics.join("\n") ?? "");
  const [editRestricted, setEditRestricted] = useState(guardrail?.restrictedTopics.join("\n") ?? "");
  const [editLevel, setEditLevel] = useState<GuardrailSafetyLevel>(guardrail?.safetyLevel ?? "balanced");
  const [editDelivery, setEditDelivery] = useState<GuardrailOutputDelivery>(guardrail?.outputDelivery ?? "window_buffered");
  const [caseName, setCaseName] = useState("");
  const [caseContent, setCaseContent] = useState("");
  const [caseRisk, setCaseRisk] = useState<GuardrailRisk>("prompt_injection");
  const [expectedDecision, setExpectedDecision] = useState<GuardrailDecision>("BLOCK");
  const [casePhase, setCasePhase] = useState<"input" | "output">("input");
  const [targetSource, setTargetSource] = useState<TargetSource>("user_input");
  const [trustedInstruction, setTrustedInstruction] = useState("Follow the approved enterprise policy.");
  const [query, setQuery] = useState("");
  const [groundingSources, setGroundingSources] = useState("");

  if (!guardrail) return <EmptyState icon={FlaskConical} title="Guardrail not found" description="The selected mock Guardrail does not exist." />;

  const versions = state.versions.filter((item) => item.guardrailId === guardrail.id).sort((left, right) => right.version - left.version);
  const assignments = state.assignments.filter((item) => item.guardrailId === guardrail.id);
  const template = state.templates.find((item) => item.id === guardrail.sourceTemplateId);
  const openEdit = () => {
    setEditName(guardrail.name); setEditPurpose(guardrail.purpose); setEditAllowed(guardrail.allowedTopics.join("\n")); setEditRestricted(guardrail.restrictedTopics.join("\n")); setEditLevel(guardrail.safetyLevel); setEditDelivery(guardrail.outputDelivery); setEditOpen(true);
  };
  const save = () => {
    try { store.updateGuardrail(guardrail.id, { name: editName, purpose: editPurpose, allowedTopics: lines(editAllowed), restrictedTopics: lines(editRestricted), safetyLevel: editLevel, outputDelivery: editDelivery }); setEditOpen(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save"); }
  };
  const run = () => {
    try { store.runGuardrailTest(guardrail.id); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to run tests"); }
  };
  const addCase = () => {
    try {
      store.addTestCase(guardrail.id, { guardrailId: guardrail.id, name: caseName, content: caseContent, phase: casePhase, risk: caseRisk, expectedDecision, actualDecision: expectedDecision, origin: "custom", updatedAt: new Date().toISOString(), trustedInstruction, targetSource, query, groundingSources: lines(groundingSources), expectedReasoningResult: null });
      setCaseOpen(false); setCaseName(""); setCaseContent("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to add Test Case"); }
  };

  return (
    <GovernancePage
      title={guardrail.name}
      description={guardrail.purpose}
      actions={<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><a href={`/${encodeURIComponent(projectId)}/governance/guardrails`}><ArrowLeft />Back</a></Button>{guardrail.systemManaged ? null : <><Button aria-label="Edit intent" variant="outline" onClick={openEdit}><Pencil />Edit intent</Button>{guardrail.testedCurrent ? <Button asChild><a href={`/${encodeURIComponent(projectId)}/governance/assignments`}><Building2 />Create Assignment</a></Button> : <Button disabled={!guardrail.testCases.length} onClick={run}><FlaskConical />Run reviewed tests</Button>}</>}</div>}
    >
      {guardrail.systemManaged ? <Info title="Product-managed baseline">This built-in Guardrail is locally verified, system managed, and unavailable for direct editing or assignment.</Info> : null}
      {error ? <p role="alert" className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-5 py-3"><GovernanceStatusBadge status={guardrail.status} /><span className="text-xs text-muted-foreground">Last updated {new Date(guardrail.updatedAt).toLocaleString()}</span></div>
        <section aria-label="Workflow" className="border-b">
          <div className="border-b px-5 py-3"><h2 className="text-sm font-medium">Workflow</h2></div>
          <div className="grid sm:grid-cols-4">{[
            ["Intent defined", true], ["Controls reviewed", guardrail.controls.length > 0], ["Tests passed", guardrail.testedCurrent], ["Traffic assigned", guardrail.assignmentCount > 0],
          ].map(([label, complete], index) => <div key={String(label)} className="flex min-h-14 items-center gap-2 border-b px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className={`grid size-6 place-items-center rounded-full border text-[10px] ${complete ? "border-emerald-500 bg-emerald-500/10 text-emerald-700" : "text-muted-foreground"}`}>{complete ? <Check className="size-3.5" /> : index + 1}</span><span className="text-xs font-medium">{label}</span></div>)}</div>
        </section>
        <div className="grid grid-cols-2 gap-3 border-b p-4 sm:grid-cols-4">
          <Metric label="Controls" value={String(guardrail.controls.length)} detail="reviewed controls" />
          <Metric label="Test Cases" value={guardrail.systemManaged ? "Built-in" : String(guardrail.testCaseCount)} detail={guardrail.systemManaged ? "product managed" : "visible and editable"} />
          <Metric label="Test Status" value={guardrail.systemManaged ? "Verified" : guardrail.testedCurrent ? "Passed" : "Required"} detail={guardrail.localOnly ? "Local only" : guardrail.latestTestRun ? `${guardrail.latestTestRun.metrics.complianceRate}% compliance` : "No evidence"} />
          <Metric label="Assignments" value={String(guardrail.assignmentCount)} detail="traffic assignments" />
        </div>

        <Tabs defaultValue="intent" className="p-5 sm:p-6">
          <TabsList className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="intent">Intent</TabsTrigger><TabsTrigger value="controls">Controls</TabsTrigger><TabsTrigger value="tests">Test Cases</TabsTrigger><TabsTrigger value="versions">Versions</TabsTrigger><TabsTrigger value="assignments">Assignments</TabsTrigger>
          </TabsList>
          <TabsContent value="intent" className="mt-5 space-y-5">
            <div className="grid gap-5 xl:grid-cols-2"><TopicPanel title="Allowed domains" items={guardrail.allowedTopics} /><TopicPanel title="Restricted domains" items={guardrail.restrictedTopics} danger /></div>
            <section className="rounded-lg border p-4"><h3 className="text-lg font-medium">Decision posture</h3><div className="mt-4 grid gap-3 sm:grid-cols-3"><SmallFact label="Evaluation" value={guardrail.localOnly ? "Local deterministic" : guardrail.safetyLevel} /><SmallFact label="Model output" value={deliveryLabel(guardrail.outputDelivery)} /><SmallFact label="Ownership" value={guardrail.systemManaged ? "Product-managed baseline" : "Organization owned"} /></div></section>
            <Info title="Runtime boundary">Guardrails evaluate trusted instructions, untrusted targets, and configured output stages without changing the existing AgentEval Security layer.</Info>
          </TabsContent>
          <TabsContent value="controls" className="mt-5 space-y-5">
            {template ? <section className="rounded-lg border bg-muted/20 p-4"><div className="flex justify-between gap-3"><div><h3 className="font-medium">{template.name}</h3><p className="mt-1 text-xs text-muted-foreground">{template.description}</p></div><GovernanceStatusBadge status="LOCAL" /></div><p className="mt-3 text-xs">Source {template.source} · Version {template.version}</p>{Object.keys(guardrail.templateParameters).length ? <dl className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(guardrail.templateParameters).map(([key, value]) => <div key={key}><dt className="text-xs text-muted-foreground">{key}</dt><dd className="text-sm">{value}</dd></div>)}</dl> : null}</section> : null}
            <section className="overflow-hidden rounded-lg border"><div className="grid grid-cols-[minmax(0,1fr)_140px_150px] border-b bg-muted/40 px-4 py-3 text-xs font-medium text-muted-foreground"><span>Control</span><span>Model boundary</span><span>When detected</span></div><div className="divide-y">{guardrail.controls.map((control) => { const definition = state.controlDefinitions.find((item) => item.id === control.risk); return <div key={control.risk} className="grid grid-cols-[minmax(0,1fr)_140px_150px] gap-3 px-4 py-4"><div><strong className="text-sm">{definition?.displayName ?? control.risk}</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">{definition?.description}</p>{definition?.limitations.map((item) => <p key={item} className="mt-1 text-xs text-amber-700">{item}</p>)}</div><span className="text-xs capitalize">{definition?.defaultPhases.join(" + ")}</span><span className="font-mono text-xs">{control.action}</span></div>; })}</div></section>
          </TabsContent>
          <TabsContent value="tests" className="mt-5 space-y-5">
            {guardrail.systemManaged ? <Info title="Built-in verification">This deterministic baseline is verified and updated with the product policy pack.</Info> : <><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-medium">Reviewed cases</h3><p className="text-xs text-muted-foreground">Trusted context, untrusted target, expected decision, and evidence configuration.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setCaseOpen(true)}><Plus />Add case</Button><Button disabled={!guardrail.testCases.length} onClick={run}><FlaskConical />Run tests</Button></div></div><div className="divide-y rounded-lg border">{guardrail.testCases.map((testCase) => <div key={testCase.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_8rem_8rem_3rem]"><div><strong>{testCase.name}</strong><p className="mt-1 text-xs text-muted-foreground">{testCase.content}</p><p className="mt-2 text-[11px] text-muted-foreground">{testCase.phase} · {testCase.targetSource} · {testCase.origin}</p></div><span className="text-xs capitalize">{testCase.risk.replaceAll("_", " ")}</span><span className="font-mono text-xs">{testCase.expectedDecision}</span><Button aria-label={`Delete ${testCase.name}`} size="icon" variant="ghost" onClick={() => store.deleteTestCase(guardrail.id, testCase.id)}><Trash2 /></Button></div>)}</div>{guardrail.latestTestRun ? <TestEvidence run={guardrail.latestTestRun} /> : <Info title="Not ready">Run reviewed cases to produce compliance metrics and an immutable version.</Info>}</>}
          </TabsContent>
          <TabsContent value="versions" className="mt-5">{versions.length ? <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Version</th><th className="px-4 py-3">Source draft</th><th className="px-4 py-3">Compiler</th><th className="px-4 py-3">Plan checksum</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">State</th></tr></thead><tbody className="divide-y">{versions.map((version) => <tr key={version.version}><td className="px-4 py-4 font-mono">{version.version}</td><td className="px-4 py-4">Draft {version.sourceDraftVersion}</td><td className="px-4 py-4 text-xs">{version.compilerVersion}</td><td className="px-4 py-4 font-mono text-xs">{version.planChecksum}</td><td className="px-4 py-4 text-xs">{new Date(version.createdAt).toLocaleString()}</td><td className="px-4 py-4"><GovernanceStatusBadge status={version.active ? "ACTIVE" : "ARCHIVED"} /></td></tr>)}</tbody></table></div> : <Info title="No versions">A passing reviewed test run creates the first immutable version.</Info>}</TabsContent>
          <TabsContent value="assignments" className="mt-5 space-y-4"><div className="flex items-center justify-between"><div><h3 className="text-lg font-medium">Assignments</h3><p className="text-xs text-muted-foreground">Traffic Scopes pinned to an immutable version of this Guardrail.</p></div>{guardrail.testedCurrent && !guardrail.systemManaged ? <Button asChild><a href={`/${encodeURIComponent(projectId)}/governance/assignments`}><Building2 />Apply</a></Button> : null}</div>{assignments.length ? <div className="divide-y rounded-lg border">{assignments.map((assignment) => <div key={assignment.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(240px,1fr)_auto]"><div><strong>{assignment.name}</strong><p className="mt-1 text-xs text-muted-foreground">Guardrail Version {assignment.guardrailVersion}</p></div><TrafficScopeSummary expression={assignment.trafficScope} /><GovernanceStatusBadge status={assignment.enabled ? "PROTECTED" : "PAUSED"} /></div>)}</div> : <Info title="No Assignments">This Guardrail is not bound to traffic yet.</Info>}</TabsContent>
        </Tabs>
      </Card>

      {!guardrail.systemManaged ? <><EntitySheet open={editOpen} onOpenChange={setEditOpen} width="xl" eyebrow="Guardrail / edit intent" title={`Edit ${guardrail.name}`} description="Changes increment the draft version and require new reviewed evidence." footer={<><Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></>}><div className="grid gap-5"><Field label="Guardrail name"><Input value={editName} onChange={(event) => setEditName(event.target.value)} /></Field><Field label="Business purpose"><Textarea rows={5} value={editPurpose} onChange={(event) => setEditPurpose(event.target.value)} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Allowed domains"><Textarea rows={6} value={editAllowed} onChange={(event) => setEditAllowed(event.target.value)} /></Field><Field label="Restricted domains"><Textarea rows={6} value={editRestricted} onChange={(event) => setEditRestricted(event.target.value)} /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Evaluation mode"><select value={editLevel} onChange={(event) => setEditLevel(event.target.value as GuardrailSafetyLevel)}><option value="balanced">Balanced</option><option value="strict">Strict</option></select></Field><Field label="Model output"><select value={editDelivery} onChange={(event) => setEditDelivery(event.target.value as GuardrailOutputDelivery)}><option value="interruptible">Real time</option><option value="window_buffered">Window buffered</option><option value="full_buffered">Full buffered</option></select></Field></div></div></EntitySheet>
      <EntitySheet open={caseOpen} onOpenChange={setCaseOpen} width="lg" eyebrow="Guardrail / test evidence" title="Add Test Case" description="Record trusted context, the untrusted target, and the reviewed expected decision." footer={<><Button variant="outline" onClick={() => setCaseOpen(false)}>Cancel</Button><Button disabled={!caseName.trim() || !caseContent.trim()} onClick={addCase}>Add case</Button></>}><div className="grid gap-5"><Field label="Case name"><Input value={caseName} onChange={(event) => setCaseName(event.target.value)} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Phase"><select value={casePhase} onChange={(event) => setCasePhase(event.target.value as "input" | "output")}><option value="input">Input</option><option value="output">Output</option></select></Field><Field label="Target source"><select value={targetSource} onChange={(event) => setTargetSource(event.target.value as TargetSource)}><option value="user_input">User input</option><option value="retrieved_content">Retrieved content</option><option value="tool_output">Tool output</option><option value="model_output">Model output</option></select></Field></div><Field label="Trusted instruction"><Textarea value={trustedInstruction} onChange={(event) => setTrustedInstruction(event.target.value)} /></Field><Field label="Untrusted target"><Textarea rows={6} value={caseContent} onChange={(event) => setCaseContent(event.target.value)} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Risk"><select value={caseRisk} onChange={(event) => setCaseRisk(event.target.value as GuardrailRisk)}>{state.controlDefinitions.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></Field><Field label="Expected decision"><select value={expectedDecision} onChange={(event) => setExpectedDecision(event.target.value as GuardrailDecision)}><option value="ALLOW">Allow</option><option value="BLOCK">Block</option><option value="REDACT">Redact</option><option value="TRANSFORM">Transform</option></select></Field></div><Field label="Reasoning or grounding query"><Textarea value={query} onChange={(event) => setQuery(event.target.value)} /></Field><Field label="Grounding sources" ><Textarea value={groundingSources} onChange={(event) => setGroundingSources(event.target.value)} /></Field></div></EntitySheet></> : null}
    </GovernancePage>
  );
}

function TestEvidence({ run }: { run: NonNullable<ReturnType<typeof useGuardGovernanceState>["guardrails"][number]["latestTestRun"]> }) {
  return <section className="overflow-hidden rounded-lg border"><div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 p-4"><div><h3 className="font-medium">Latest test evidence</h3><p className="mt-1 text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</p></div><GovernanceStatusBadge status={run.status} /></div><div className="grid grid-cols-2 gap-3 border-b p-4 sm:grid-cols-4"><SmallFact label="Compliance" value={`${run.metrics.complianceRate}%`} /><SmallFact label="False positive" value={`${run.metrics.falsePositiveRate}%`} /><SmallFact label="Deep escalation" value={`${run.metrics.deepEscalationRate}%`} /><SmallFact label="P95 latency" value={`${run.metrics.p95LatencyMs} ms`} /></div><div className="divide-y">{run.results.map((result) => <details key={result.caseId} className="group p-4"><summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-3"><div><strong>{result.name}</strong><p className="mt-1 text-xs text-muted-foreground">Expected {result.expectedDecision} · Actual {result.actualDecision} · {result.latencyMs} ms</p></div><GovernanceStatusBadge status={result.passed ? "PASSED" : "FAILED"} /></div></summary><div className="mt-4 grid gap-4"><div className="grid gap-3 sm:grid-cols-3"><SmallFact label="Stage reached" value={result.stageReached} /><SmallFact label="Target source" value={result.targetSource} /><SmallFact label="Action" value={result.action} /></div><Info title="Decision reason">{result.reason}</Info>{result.findings.map((finding, index) => <section key={`${finding.risk}-${index}`} className="rounded-md border p-3"><h4 className="text-sm font-medium">Triggered finding · {finding.risk.replaceAll("_", " ")}</h4><p className="mt-2 text-xs leading-5 text-muted-foreground">{finding.evidence} · confidence {Math.round(finding.confidence * 100)}%</p></section>)}<ol className="divide-y rounded-md border">{result.trace.map((step) => <li key={step.id} className="grid gap-2 p-3 sm:grid-cols-[8rem_minmax(0,1fr)_5rem]"><span className="font-mono text-xs">{step.stage}</span><span className="text-xs text-muted-foreground">{step.detail}</span><span className="text-right font-mono text-xs">{step.durationMs} ms</span></li>)}</ol></div></details>)}</div></section>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-lg font-medium">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div>; }
function SmallFact({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium capitalize">{value.replaceAll("_", " ")}</p></div>; }
function TopicPanel({ title, items, danger = false }: { title: string; items: string[]; danger?: boolean }) { return <section className="overflow-hidden rounded-lg border"><h3 className="border-b bg-muted/40 px-4 py-3 font-medium">{title}</h3><div className="min-h-32 p-4">{items.length ? <ul className="space-y-2">{items.map((item) => <li key={item} className="flex gap-2 text-sm"><span className={`mt-2 size-1.5 shrink-0 rounded-full ${danger ? "bg-destructive" : "bg-primary"}`} />{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">No domains configured.</p>}</div></section>; }
function Info({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-lg border border-primary/20 bg-primary/5 p-4"><h3 className="text-sm font-medium text-primary">{title}</h3><div className="mt-1 text-sm leading-6 text-muted-foreground">{children}</div></section>; }
function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="grid gap-2 text-sm font-medium [&_select]:h-11 [&_select]:rounded-md [&_select]:border [&_select]:bg-background [&_select]:px-3">{label}{children}</label>; }
function lines(value: string) { return value.split("\n").map((item) => item.trim()).filter(Boolean); }
function deliveryLabel(value: GuardrailOutputDelivery) { return value === "interruptible" ? "Real time" : value === "full_buffered" ? "Full buffered" : "Window buffered"; }
