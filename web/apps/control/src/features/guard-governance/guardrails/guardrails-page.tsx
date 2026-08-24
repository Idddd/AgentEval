import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, Library, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { EntitySheet } from "@/components/shared/entity-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGuardGovernanceState, useGuardGovernanceStore } from "../mock-provider";
import type { GuardrailControl, GuardrailTemplate } from "../model";
import { GovernancePage, GovernanceMetric } from "../shared/governance-page";
import { GovernanceStatusBadge } from "../shared/governance-status";

export function GuardrailsPage({ projectId }: { projectId: string }) {
  const state = useGuardGovernanceState();
  const [createOpen, setCreateOpen] = useState(false);
  const protectedCount = state.guardrails.filter((item) => item.testedCurrent).length;
  const ordered = useMemo(
    () => [...state.guardrails].sort((left, right) => Number(right.isDefault) - Number(left.isDefault)),
    [state.guardrails],
  );

  return (
    <GovernancePage
      title="Guardrails"
      description="Turn enterprise safety intent into reviewed Controls, test evidence, and immutable Guardrail Versions."
      actions={<Button onClick={() => setCreateOpen(true)}><Plus />Create Guardrail</Button>}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <GovernanceMetric label="Guardrails" value={state.guardrails.length} />
        <GovernanceMetric label="Tested current" value={protectedCount} detail="Eligible for protected traffic" />
        <GovernanceMetric label="Need review" value={state.guardrails.filter((item) => !item.testedCurrent && !item.systemManaged).length} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" />Guardrail registry</CardTitle>
          <CardDescription>Select a Guardrail to inspect its complete intent, controls, evidence, versions, and assignments.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b bg-muted/35 text-xs text-muted-foreground">
                <tr><th className="px-5 py-3 font-medium">Guardrail</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Controls</th><th className="px-4 py-3 font-medium">Test evidence</th><th className="px-4 py-3 font-medium">Assignments</th><th className="px-4 py-3 font-medium">Last updated</th><th className="px-4 py-3 font-medium">Open</th></tr>
              </thead>
              <tbody className="divide-y">
                {ordered.map((guardrail) => (
                  <tr key={guardrail.id} className="hover:bg-muted/20">
                    <td className="px-5 py-4"><div className="flex items-center gap-2"><strong>{guardrail.name}</strong>{guardrail.isDefault ? <span className="rounded-md border bg-muted px-2 py-0.5 text-[10px] font-medium">Built-in</span> : null}</div><p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">{guardrail.purpose}</p></td>
                    <td className="px-4 py-4"><GovernanceStatusBadge status={guardrail.status} /></td>
                    <td className="px-4 py-4 tabular-nums">{guardrail.controls.length}</td>
                    <td className="px-4 py-4"><p>{guardrail.systemManaged ? "Built-in verified" : `${guardrail.testCaseCount} reviewed cases`}</p><p className="mt-1 text-xs text-muted-foreground">{guardrail.localOnly ? "Local only" : guardrail.latestTestRun ? `${guardrail.latestTestRun.metrics.complianceRate}% compliance` : "No current evidence"}</p></td>
                    <td className="px-4 py-4 tabular-nums">{guardrail.assignmentCount}</td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">{new Date(guardrail.updatedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-4"><Button asChild size="sm" variant="ghost"><a href={`/${encodeURIComponent(projectId)}/governance/guardrails/${encodeURIComponent(guardrail.id)}`}>View</a></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <CreateGuardrailSheet open={createOpen} onOpenChange={setCreateOpen} />
    </GovernancePage>
  );
}

function CreateGuardrailSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const state = useGuardGovernanceState();
  const store = useGuardGovernanceStore();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"template" | "blank">("template");
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [allowed, setAllowed] = useState("");
  const [restricted, setRestricted] = useState("");
  const [controls, setControls] = useState<GuardrailControl[]>([]);
  const [analysisSummary, setAnalysisSummary] = useState("");
  const [error, setError] = useState("");
  const selected = state.templates.find((item) => item.id === templateId);

  const reset = () => {
    setStep(0); setMode("template"); setTemplateId(""); setName(""); setPurpose(""); setParameters({}); setAllowed(""); setRestricted(""); setControls([]); setAnalysisSummary(""); setError("");
  };
  const selectTemplate = (template: GuardrailTemplate) => {
    setTemplateId(template.id); setName(template.name); setPurpose(template.purpose); setAllowed(template.allowedTopics.join("\n")); setRestricted(template.restrictedTopics.join("\n")); setControls(structuredClone(template.defaultControls)); setParameters({});
  };
  const analyze = () => {
    try {
      const result = store.analyzeIntent(purpose);
      setAnalysisSummary(result.summary); setAllowed(result.allowedTopics.join("\n")); setRestricted(result.restrictedTopics.join("\n"));
      if (!controls.length) setControls([{ risk: "topic_control", action: "redirect", enabled: true }]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to analyze intent"); }
  };
  const missingParameter = selected?.parameters.some((item) => item.required && !parameters[item.name]?.trim());
  const canContinue = step === 0 ? mode === "blank" || Boolean(selected) : Boolean(name.trim() && purpose.trim() && !missingParameter);
  const create = () => {
    try {
      store.createGuardrail({ name, purpose, safetyLevel: selected?.safetyLevel ?? "balanced", outputDelivery: selected?.outputDelivery ?? "window_buffered", allowedTopics: lines(allowed), restrictedTopics: lines(restricted), controls: controls.length ? controls : [{ risk: "topic_control", action: "redirect", enabled: true }], sourceTemplateId: selected?.id ?? null, templateParameters: parameters });
      onOpenChange(false); reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create Guardrail"); }
  };

  return (
    <EntitySheet
      open={open}
      onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}
      width="xl"
      eyebrow="Guardrail / create"
      title="Create Guardrail"
      description="Start from a reviewed built-in template or define a blank structured intent."
      footer={<><Button variant="outline" onClick={() => step ? setStep(step - 1) : onOpenChange(false)}>{step ? <><ArrowLeft />Back</> : "Cancel"}</Button>{step < 2 ? <Button disabled={!canContinue} onClick={() => setStep(step + 1)}>Continue<ArrowRight /></Button> : <Button disabled={!name.trim() || !controls.length} onClick={create}><ShieldCheck />Create</Button>}</>}
    >
      <div className="mb-6 grid grid-cols-3 gap-2" aria-label="Creation progress">
        {["Start", "Intent", "Controls"].map((label, index) => <div key={label} className={`rounded-md border p-3 text-xs ${index === step ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground"}`}><span className="mr-2 font-mono">{index + 1}</span>{label}</div>)}
      </div>
      {step === 0 ? <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" aria-pressed={mode === "template"} className={`rounded-lg border p-4 text-left ${mode === "template" ? "border-primary bg-primary/5" : ""}`} onClick={() => setMode("template")}><Library className="size-5 text-primary" /><strong className="mt-3 block">Built-in template</strong><span className="mt-1 block text-xs text-muted-foreground">Use a versioned local policy pack.</span></button>
          <button type="button" aria-pressed={mode === "blank"} className={`rounded-lg border p-4 text-left ${mode === "blank" ? "border-primary bg-primary/5" : ""}`} onClick={() => { setMode("blank"); setTemplateId(""); setName(""); setPurpose(""); setControls([]); }}><FileText className="size-5 text-primary" /><strong className="mt-3 block">Blank intent</strong><span className="mt-1 block text-xs text-muted-foreground">Describe business intent and review generated controls.</span></button>
        </div>
        {mode === "template" ? <div className="grid gap-3 sm:grid-cols-2">{state.templates.map((template) => <button key={template.id} type="button" className={`min-h-36 rounded-lg border p-4 text-left ${templateId === template.id ? "border-primary bg-accent" : ""}`} onClick={() => selectTemplate(template)}><span className="flex justify-between gap-3"><strong>{template.name}</strong>{templateId === template.id ? <Check className="size-4 text-primary" /> : null}</span><span className="mt-2 block text-xs leading-5 text-muted-foreground">{template.description}</span><span className="mt-3 block text-xs font-medium">{template.controls.length} local controls · v{template.version}</span></button>)}</div> : <p className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">Blank intent remains structured: purpose, allowed domains, restricted domains, controls, safety level, and output delivery are all reviewable.</p>}
      </div> : null}
      {step === 1 ? <div className="grid gap-5">
        <Field label="Guardrail name"><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field>
        {selected ? <><TemplateSummary template={selected} />{selected.parameters.map((parameter) => <Field key={parameter.name} label={`${parameter.label}${parameter.required ? " *" : ""}`} hint={parameter.description}>{parameter.kind === "multiline" ? <Textarea value={parameters[parameter.name] ?? ""} onChange={(event) => setParameters((current) => ({ ...current, [parameter.name]: event.target.value }))} /> : <Input value={parameters[parameter.name] ?? ""} onChange={(event) => setParameters((current) => ({ ...current, [parameter.name]: event.target.value }))} />}</Field>)}</> : <><Field label="Business purpose" hint="Explain who uses this assistant and what approved outcome it supports."><Textarea rows={5} value={purpose} onChange={(event) => setPurpose(event.target.value)} /></Field><Button type="button" variant="outline" disabled={purpose.trim().length < 20} onClick={analyze}><Sparkles />Analyze intent</Button>{analysisSummary ? <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">{analysisSummary}</p> : null}<div className="grid gap-4 sm:grid-cols-2"><Field label="Allowed domains"><Textarea rows={6} value={allowed} onChange={(event) => setAllowed(event.target.value)} /></Field><Field label="Restricted domains"><Textarea rows={6} value={restricted} onChange={(event) => setRestricted(event.target.value)} /></Field></div></>}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div> : null}
      {step === 2 ? <div className="space-y-5"><div><h3 className="text-lg font-medium">Review controls</h3><p className="mt-1 text-sm text-muted-foreground">Confirm what the Guardrail evaluates and which action applies when a risk is detected.</p></div>{selected ? <TemplateSummary template={selected} /> : null}<div className="divide-y rounded-lg border">{controls.map((control) => <div key={control.risk} className="grid grid-cols-[minmax(0,1fr)_10rem] gap-4 p-4"><span className="capitalize">{control.risk.replaceAll("_", " ")}</span><span className="font-mono text-xs">{control.action}</span></div>)}</div><p className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">After creation, add reviewed test cases and run them to create an immutable Guardrail Version.</p></div> : null}
    </EntitySheet>
  );
}

function TemplateSummary({ template }: { template: GuardrailTemplate }) {
  return <section className="rounded-lg border bg-muted/20 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{template.name}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{template.description}</p></div><span className="rounded-md border bg-background px-2 py-1 text-xs">v{template.version}</span></div><p className="mt-3 text-xs text-muted-foreground">{template.domain} · {template.controls.join(" · ")}</p></section>;
}

function Field({ children, hint, label }: { children: React.ReactNode; hint?: string; label: string }) {
  return <label className="grid gap-2 text-sm font-medium">{label}{children}{hint ? <span className="text-xs font-normal leading-5 text-muted-foreground">{hint}</span> : null}</label>;
}

function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}
