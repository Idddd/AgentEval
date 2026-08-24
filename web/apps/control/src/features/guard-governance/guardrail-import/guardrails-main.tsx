import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Activity, ArrowLeft, Check, CheckCircle2, CircleAlert, FlaskConical, GitBranch, History, LoaderCircle, LockKeyhole, Plus, Rocket, ShieldCheck, Sparkles } from "lucide-react";
import { useGuardGovernanceState, useGuardGovernanceStore } from "../mock-provider";
import type { Guardrail, GuardrailPolicy } from "../model";
import { EntitySheet } from "./components/entity-sheet";
import { CreationFlow } from "./components/creation-flow";
import { InfoNotice, PageHeader, StateBadge } from "./components/product-shell";
import { PolicyBindingEditor, defaultPolicyBinding } from "./policy-binding-editor";
import { RuntimePostureFields } from "./runtime-posture-fields";
import { ComplianceDocumentImport } from "./components/compliance-document-import";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Progress } from "./components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Textarea } from "./components/ui/textarea";
import { cn } from "./lib/utils";
import { toSourcePolicy, type GuardrailPolicyBinding as SourcePolicyBinding } from "./lib/source-api";

/** Source-derived from tasklattice-guard/controller/src/routes/guardrails.tsx. */
export function GuardrailsPage({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation();
  const { guardrails } = useGuardGovernanceState();
  const [createOpen, setCreateOpen] = useState(false);
  const sorted = [...guardrails].sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
  return (
    <section className="py-6 sm:py-8">
      <PageHeader
        title={t("pages.guardrails.title")}
        description={t("guardrails.description")}
        action={<Button className="min-h-11" onClick={() => setCreateOpen(true)}><Plus />{t("guardrails.create")}</Button>}
      />
      {sorted.length ? (
        <section className="mt-5 overflow-hidden rounded-xl border bg-card shadow-xs">
          <header className="border-b bg-muted/25 px-5 py-3">
            <p className="text-xs font-medium text-muted-foreground">{t("guardrails.registry", { count: sorted.length })}</p>
          </header>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-64 px-5">{t("guardrails.guardrail")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("guardrails.policies")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("guardrails.validation")}</TableHead>
                <TableHead className="hidden xl:table-cell">{t("guardrails.updated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((guardrail) => (
                <TableRow key={guardrail.id} className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">
                  <TableCell className="px-5">
                    <Link to="/$projectId/governance/guardrails/$guardrailId" params={{ projectId, guardrailId: guardrail.id }} className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="size-4" /></span>
                      <span className="min-w-0"><strong className="block truncate text-sm">{guardrail.name}</strong><span className="mt-1 line-clamp-1 text-xs text-muted-foreground">{guardrail.purpose}</span></span>
                    </Link>
                  </TableCell>
                  <TableCell><StateBadge state={guardrail.status} /></TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">{guardrail.policyBindings.length}</TableCell>
                  <TableCell className="hidden lg:table-cell">{guardrail.latestTestRun ? <span className="flex items-center gap-2"><StateBadge state={guardrail.latestTestRun.status} /><span className="font-mono text-xs text-muted-foreground">{guardrail.latestTestRun.metrics.complianceRate}%</span></span> : <span className="text-xs text-muted-foreground">{t("guardrails.notRun")}</span>}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">{new Date(guardrail.updatedAt).toLocaleString(i18n.language)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
      <CreateGuardrailWizard open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}

export function GuardrailDetailPage({ projectId, guardrailId }: { projectId: string; guardrailId: string }) {
  const { t } = useTranslation();
  const state = useGuardGovernanceState();
  const guardrail = state.guardrails.find((item) => item.id === guardrailId);
  if (!guardrail) return <section className="py-8"><Card className="p-8 text-center"><h1 className="text-lg font-semibold">Guardrail not found</h1><Link className="mt-3 inline-flex text-sm text-primary" to="/$projectId/governance/guardrails" params={{ projectId }}>Return to Guardrails</Link></Card></section>;
  const versions = state.versions.filter((version) => version.guardrailId === guardrailId).sort((left, right) => right.version - left.version);
  const policies = guardrail.policyBindings.map((binding) => state.policies.find((policy) => policy.id === binding.policyId)).filter((policy): policy is GuardrailPolicy => Boolean(policy));
  return (
    <section className="py-6 sm:py-8">
      <Link to="/$projectId/governance/guardrails" params={{ projectId }} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />{t("guardrails.backToGuardrails")}
      </Link>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.015em] sm:text-3xl">{guardrail.name}</h1>
            {guardrail.activeVersion ? (
              <Badge className="border-emerald-200 bg-emerald-50 font-mono text-[11px] text-emerald-700 hover:bg-emerald-50">
                {t("guardrails.activeVersion", { version: `Release ${guardrail.activeVersion}` })}
              </Badge>
            ) : <StateBadge state={guardrail.testedCurrent ? "ready" : "needs_validation"} />}
            {guardrail.assignmentCount ? <StateBadge state="protected" /> : guardrail.activeVersion ? <StateBadge state="ready" /> : null}
            {guardrail.isDefault ? <Badge variant="outline">{t("guardrails.defaultBadge")}</Badge> : guardrail.systemManaged ? <Badge variant="outline">{t("guardrails.systemManaged")}</Badge> : null}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{guardrail.purpose}</p>
          {!guardrail.publishedCurrent && !guardrail.systemManaged ? (
            <button type="button" className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-md bg-amber-50 px-3 text-xs font-medium text-amber-800 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-ring">
              <span className="size-2.5 rounded-full bg-current" />{t("guardrails.unpublishedDraft")}
            </button>
          ) : null}
        </div>
        {!guardrail.systemManaged ? (
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" variant="outline"><FlaskConical />{t("guardrails.testDraft")}</Button>
            <Button className="min-h-11" variant="outline">{t("common.edit")}</Button>
          </div>
        ) : null}
      </div>
      {guardrail.isDefault ? <div className="mt-5"><InfoNotice title={t("guardrails.defaultNoticeTitle")}>{t("guardrails.defaultNoticeDescription")}</InfoNotice></div> : null}
      <Tabs defaultValue="runtime" className="mt-7">
        <div className="overflow-x-auto">
          <TabsList className="min-w-max" aria-label={t("guardrails.detailViews")}>
            <TabsTrigger value="runtime">{t("guardrails.runtimeTab")}</TabsTrigger>
            <TabsTrigger value="findings">{t("guardrails.securityFindingsTab")}</TabsTrigger>
            <TabsTrigger value="versions">{t("guardrails.versions")}</TabsTrigger>
            <TabsTrigger value="draft">{t("guardrails.draftReleaseTab")}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="runtime" className="pt-5"><RuntimeView guardrail={guardrail} versions={versions.length} /></TabsContent>
        <TabsContent value="findings" className="pt-5"><FindingsView guardrail={guardrail} /></TabsContent>
        <TabsContent value="versions" className="pt-5"><VersionsView guardrail={guardrail} /></TabsContent>
        <TabsContent value="draft" className="pt-5"><DraftReleaseView guardrail={guardrail} policies={policies} /></TabsContent>
      </Tabs>
    </section>
  );
}

function RuntimeView({ guardrail, versions }: { guardrail: Guardrail; versions: number }) {
  const state = useGuardGovernanceState();
  const evidence = state.evidence.filter((item) => item.guardrailId === guardrail.id);
  const interventions = evidence.filter((item) => item.outcome !== "ALLOW").length;
  const p95 = Math.max(0, ...evidence.map((item) => item.durationMs));
  return <div className="space-y-5"><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><RuntimeMetric label="Decisions" value={Math.max(evidence.length * 124, guardrail.assignmentCount ? 1240 : evidence.length)} detail="Last 24 hours" /><RuntimeMetric label="Intervention rate" value={`${evidence.length ? Math.round((interventions / evidence.length) * 100) : 0}%`} detail="Blocked, redacted, or transformed" /><RuntimeMetric label="Runtime P95" value={`${Math.max(p95, 24)} ms`} detail="Deterministic demo latency" /><RuntimeMetric label="Active release" value={guardrail.activeVersion ? `R${guardrail.activeVersion}` : "None"} detail={`${versions} immutable versions`} /></section><Card className="p-5 shadow-xs"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700"><Activity className="size-5" /></span><div><h2 className="text-sm font-semibold">Runtime healthy</h2><p className="mt-1 text-xs text-muted-foreground">The active immutable release is enforcing all bound Policy rails.</p></div></div><StateBadge state={guardrail.activeVersion ? "healthy" : "waiting"} /></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Fact label="Assignments" value={String(guardrail.assignmentCount)} /><Fact label="Policy bindings" value={String(guardrail.policyBindings.length)} /><Fact label="Delivery posture" value={guardrail.outputDelivery} /></div></Card><Card className="p-5 shadow-xs"><h2 className="text-sm font-semibold">Runtime decision volume</h2><p className="mt-1 text-xs text-muted-foreground">A source-style deterministic visualization for the selected time window.</p><div className="mt-5 flex h-36 items-end gap-2 rounded-lg border bg-muted/15 p-4">{[46, 62, 54, 78, 68, 86, 74, 92, 82, 70, 88, 96].map((height, index) => <div key={index} className="min-w-2 flex-1 rounded-t bg-primary/75" style={{ height: `${height}%` }} />)}</div></Card></div>;
}
function RuntimeMetric({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <Card className="gap-0 p-4 shadow-xs"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-2 block font-mono text-xl">{value}</strong><span className="mt-1 text-[11px] text-muted-foreground">{detail}</span></Card>; }

function FindingsView({ guardrail }: { guardrail: Guardrail }) {
  const { evidence, policies } = useGuardGovernanceState();
  const findings = evidence.filter((item) => item.guardrailId === guardrail.id && item.outcome !== "ALLOW");
  return <Card className="overflow-hidden shadow-xs"><header className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Runtime findings</h2><p className="mt-1 text-xs text-muted-foreground">Policy-linked evidence from recent Guardrail decisions.</p></div><div className="flex gap-2"><Badge variant="destructive">{findings.length} findings</Badge><Badge variant="outline">24 hours</Badge></div></header>{findings.length ? <div className="divide-y">{findings.map((finding) => { const binding = guardrail.policyBindings.find((item) => policies.find((policy) => policy.id === item.policyId)?.rules.some((rule) => rule.risk === finding.risk)); const policy = policies.find((item) => item.id === binding?.policyId); return <article key={finding.id} className="grid gap-3 p-5 lg:grid-cols-[10rem_minmax(0,1fr)_8rem]"><div><Badge variant={finding.outcome === "ERROR" ? "destructive" : "secondary"}>{finding.outcome}</Badge><p className="mt-2 font-mono text-xs text-muted-foreground">{finding.risk}</p></div><div><h3 className="text-sm font-medium">{finding.reason}</h3><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{finding.input}</p><p className="mt-2 text-xs text-primary">{policy ? `${policy.name} · v${binding?.policyVersion}` : "Guardrail runtime"}</p></div><div className="text-xs text-muted-foreground lg:text-right"><span>{finding.durationMs} ms</span><span className="mt-1 block">{new Date(finding.createdAt).toLocaleTimeString()}</span></div></article>; })}</div> : <div className="grid min-h-64 place-items-center p-8 text-center"><div><CheckCircle2 className="mx-auto size-8 text-emerald-600" /><h3 className="mt-3 text-sm font-semibold">No findings in this window</h3></div></div>}</Card>;
}

function VersionsView({ guardrail }: { guardrail: Guardrail }) {
  const { versions } = useGuardGovernanceState();
  const releases = versions.filter((item) => item.guardrailId === guardrail.id).sort((left, right) => right.version - left.version);
  return <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]"><Card className="overflow-hidden shadow-xs"><header className="border-b p-4"><h2 className="text-sm font-semibold">Immutable Versions</h2><p className="mt-1 text-xs text-muted-foreground">{releases.length} compiled releases</p></header><div className="divide-y">{releases.map((release) => <div key={release.version} className={cn("p-4", release.active && "bg-primary/[0.04]")}><div className="flex items-center justify-between"><strong className="font-mono text-sm">Release {release.version}</strong>{release.active ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">ACTIVE</Badge> : <Badge variant="secondary">HISTORICAL</Badge>}</div><p className="mt-2 text-xs text-muted-foreground">Draft R{release.sourceDraftVersion} · {release.policyBindings.length} Policies</p></div>)}</div></Card><Card className="p-5 shadow-xs">{releases[0] ? <><div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold">Release {releases[0].version}</h2><p className="mt-1 text-xs text-muted-foreground">Immutable compiled runtime snapshot</p></div><LockKeyhole className="size-5 text-primary" /></div><dl className="mt-5 grid gap-3 sm:grid-cols-2"><Fact label="Compiler" value={releases[0].compilerVersion} /><Fact label="Plan checksum" value={releases[0].planChecksum} /><Fact label="Validation run" value={releases[0].validationRunId ?? "Built-in verification"} /><Fact label="Created" value={new Date(releases[0].createdAt).toLocaleString()} /></dl><section className="mt-5"><h3 className="text-xs font-semibold">Pinned Policies</h3><div className="mt-2 flex flex-wrap gap-2">{releases[0].policySnapshots.map((policy) => <Badge key={`${policy.policyId}:${policy.policyVersion}`} variant="outline">{policy.name} · v{policy.policyVersion}</Badge>)}</div></section></> : <div className="grid min-h-56 place-items-center text-center"><div><History className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 text-sm font-semibold">No immutable releases</h2></div></div>}</Card></div>;
}

function DraftReleaseView({ guardrail, policies }: { guardrail: Guardrail; policies: GuardrailPolicy[] }) {
  const store = useGuardGovernanceStore();
  const status = guardrail.publishedCurrent && guardrail.activeVersion ? `Release ${guardrail.activeVersion} active` : guardrail.testedCurrent ? "Validation passed" : "Validation required";
  const progress = guardrail.publishedCurrent ? 100 : guardrail.testedCurrent ? 72 : 35;
  return <div className="space-y-5"><Card className="p-5 shadow-xs"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><span className={cn("grid size-10 place-items-center rounded-lg", guardrail.publishedCurrent ? "bg-emerald-500/10 text-emerald-700" : guardrail.testedCurrent ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700")}>{guardrail.publishedCurrent ? <Rocket className="size-5" /> : guardrail.testedCurrent ? <Check className="size-5" /> : <CircleAlert className="size-5" />}</span><div><h2 className="text-base font-semibold">{status}</h2><p className="mt-1 text-xs text-muted-foreground">Draft R{guardrail.draftVersion} · {guardrail.testCases.length} required acceptance cases</p></div></div>{!guardrail.systemManaged ? <div className="flex flex-wrap gap-2">{guardrail.publishedCurrent ? <Button onClick={() => store.updateGuardrail(guardrail.id, { policyBindings: guardrail.policyBindings })}><GitBranch />Create new draft</Button> : !guardrail.testedCurrent ? <Button onClick={() => store.validateGuardrail(guardrail.id)}><FlaskConical />Validate draft</Button> : <Button onClick={() => store.publishGuardrail(guardrail.id)}><Rocket />Publish version</Button>}</div> : <Badge variant="outline"><LockKeyhole />Managed</Badge>}</div><Progress className="mt-5" value={progress} /></Card><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]"><Card className="overflow-hidden shadow-xs"><header className="border-b p-5"><h2 className="text-sm font-semibold">Bound Policies</h2><p className="mt-1 text-xs text-muted-foreground">Each binding pins the exact Policy version and enabled rules.</p></header><div className="divide-y">{guardrail.policyBindings.map((binding) => { const policy = policies.find((item) => item.id === binding.policyId); return <article key={binding.policyId} className="flex items-start gap-3 p-4"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="size-4" /></span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-medium">{policy?.name ?? binding.policyId}</h3><p className="mt-1 font-mono text-xs text-muted-foreground">{binding.policyId}@{binding.policyVersion}</p></div><Badge variant="outline">{binding.enabledRuleIds.length} rules</Badge></article>; })}</div></Card><Card className="p-5 shadow-xs"><h2 className="text-sm font-semibold">Validation scope</h2><p className="mt-1 text-xs text-muted-foreground">Policy cases plus reviewed custom cases.</p><dl className="mt-4 grid gap-3"><Fact label="Required cases" value={String(guardrail.testCases.length)} /><Fact label="Safety level" value={guardrail.safetyLevel} /><Fact label="Output delivery" value={guardrail.outputDelivery} /><Fact label="Draft identity" value={`${guardrail.id}:R${guardrail.draftVersion}`} /></dl></Card></div><Card className="overflow-hidden shadow-xs"><header className="border-b p-5"><h2 className="text-sm font-semibold">Test Cases</h2><p className="mt-1 text-xs text-muted-foreground">Acceptance evidence inherited from the bound Policy versions.</p></header><div className="divide-y">{guardrail.testCases.map((testCase) => <article key={testCase.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_9rem_8rem]"><div><h3 className="text-sm font-medium">{testCase.name}</h3><p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{testCase.content}</p></div><span className="font-mono text-xs text-muted-foreground">{testCase.sourcePolicyVersion ? `Policy v${testCase.sourcePolicyVersion}` : testCase.origin}</span><Badge variant="secondary">{testCase.expectedDecision}</Badge></article>)}</div></Card></div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border bg-muted/15 p-3"><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-mono text-xs font-medium">{value}</dd></div>; }

function CreateGuardrailWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const { policies } = useGuardGovernanceState();
  const store = useGuardGovernanceStore();
  const sourcePolicies = useMemo(() => policies.map(toSourcePolicy), [policies]);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("Customer Interaction Guardrail");
  const [purpose, setPurpose] = useState("Protect customer-facing conversations from instruction override and sensitive data disclosure.");
  const [allowed, setAllowed] = useState("Approved customer assistance");
  const [restricted, setRestricted] = useState("Instruction override\nSensitive data disclosure");
  const [bindings, setBindings] = useState<SourcePolicyBinding[]>([]);
  const [safetyLevel, setSafetyLevel] = useState<Guardrail["safetyLevel"]>("strict");
  const [outputDelivery, setOutputDelivery] = useState<Guardrail["outputDelivery"]>("full_buffered");
  const [analyzingIntent, setAnalyzingIntent] = useState(false);
  const steps = [
    { label: t("guardrailWizard.steps.details"), description: t("guardrailWizard.steps.detailsDescription") },
    { label: t("guardrailWizard.steps.policies"), description: t("guardrailWizard.steps.policiesDescription") },
    { label: t("guardrailWizard.steps.runtime"), description: t("guardrailWizard.steps.runtimeDescription") },
    { label: t("guardrailWizard.steps.review"), description: t("guardrailWizard.steps.reviewDescription") },
  ];
  useEffect(() => {
    if (!open) return;
    const defaults = sourcePolicies.filter((policy) => ["policy-prompt-injection", "policy-sensitive-data"].includes(policy.id)).map(defaultPolicyBinding);
    setStep(0);
    setName("Customer Interaction Guardrail");
    setPurpose("Protect customer-facing conversations from instruction override and sensitive data disclosure.");
    setAllowed("Approved customer assistance");
    setRestricted("Instruction override\nSensitive data disclosure");
    setBindings(defaults);
    setSafetyLevel("strict");
    setOutputDelivery("full_buffered");
    setAnalyzingIntent(false);
  }, [open, sourcePolicies]);
  const selectedPolicies = policies.filter((policy) => bindings.some((binding) => binding.policy_id === policy.id));
  const canContinue = step === 0 ? name.trim().length > 2 && purpose.trim().length > 10 : step === 1 ? bindings.length > 0 && bindings.every((binding) => binding.enabled_rule_ids.length) : true;
  const close = () => { setStep(0); onOpenChange(false); };
  const create = () => {
    const controls = selectedPolicies.flatMap((policy) => policy.rules.map((rule) => ({ risk: rule.risk, action: rule.effect, enabled: true })));
    store.createGuardrail({
      name,
      purpose,
      safetyLevel,
      outputDelivery,
      allowedTopics: allowed.split("\n").map((item) => item.trim()).filter(Boolean),
      restrictedTopics: restricted.split("\n").map((item) => item.trim()).filter(Boolean),
      controls,
      policyBindings: bindings.map((binding) => ({ policyId: binding.policy_id, policyVersion: binding.policy_version, action: binding.action ?? null, parameterValues: binding.parameter_values, enabledRuleIds: binding.enabled_rule_ids, ruleActions: binding.rule_actions, enabledRails: binding.enabled_rails })),
    });
    close();
  };
  const analyzeIntent = () => {
    setAnalyzingIntent(true);
    globalThis.setTimeout(() => {
      setAllowed("Approved customer assistance\nAccount and service guidance\nPolicy-compliant support");
      setRestricted("Instruction override\nSensitive data disclosure\nUnapproved commitments");
      setAnalyzingIntent(false);
    }, 250);
  };
  return (
    <EntitySheet
      open={open}
      onOpenChange={(next) => { if (!next) close(); }}
      eyebrow={t("guardrailWizard.eyebrow")}
      title={t("guardrailWizard.title")}
      description={t("guardrailWizard.description")}
      width="xl"
      bodyClassName="p-0 sm:p-0"
      footer={<><Button variant="outline" onClick={step === 0 ? close : () => setStep((current) => current - 1)}>{step ? <><ArrowLeft />{t("common.previous")}</> : t("common.cancel")}</Button>{step < steps.length - 1 ? <Button disabled={!canContinue} onClick={() => setStep((current) => current + 1)}>{t("common.next")}</Button> : <Button onClick={create}><ShieldCheck />{t("guardrailWizard.create")}</Button>}</>}
    >
      <CreationFlow orientation="sidebar" currentStep={step} onStepChange={setStep} progressLabel={t("guardrailWizard.title")} steps={steps}>
        {step === 0 ? <WizardSection title={t("guardrailWizard.detailsTitle")} description={t("guardrailWizard.detailsDescription")}><div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5"><Field label={`${t("guardrailWizard.name")} *`}><Input autoFocus className="min-h-11 bg-card" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("guardrailWizard.namePlaceholder")} /></Field><ComplianceDocumentImport policies={sourcePolicies} resetKey={Number(open)} onApply={(analysis) => { setPurpose(analysis.summary); setBindings(sourcePolicies.filter((policy) => analysis.recommended_policy_ids.includes(policy.id)).map(defaultPolicyBinding)); }} /><Field label={`${t("guardrailWizard.purpose")} *`} hint={t("guardrailWizard.purposeHint")}><Textarea className="min-h-32 bg-card" value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder={t("guardrailWizard.purposePlaceholder")} /></Field><div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 p-4"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{t("guardrailWizard.intentTitle")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("guardrailWizard.intentDescription")}</p></div><Button variant="outline" disabled={purpose.trim().length < 20 || analyzingIntent} onClick={analyzeIntent}>{analyzingIntent ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{t("guardrailWizard.generateBoundaries")}</Button></div><div className="grid gap-4 sm:grid-cols-2"><Field label={t("guardrailWizard.allowedDomains")}><Textarea className="min-h-28 bg-card" value={allowed} onChange={(event) => setAllowed(event.target.value)} placeholder={t("guardrailWizard.onePerLine")} /></Field><Field label={t("guardrailWizard.restrictedDomains")}><Textarea className="min-h-28 bg-card" value={restricted} onChange={(event) => setRestricted(event.target.value)} placeholder={t("guardrailWizard.onePerLine")} /></Field></div></div></WizardSection> : null}
        {step === 1 ? <WizardSection title={t("guardrailWizard.policiesTitle")} description={t("guardrailWizard.policiesDescription")}><PolicyBindingEditor policies={sourcePolicies} value={bindings} onChange={setBindings} /></WizardSection> : null}
        {step === 2 ? <WizardSection title={t("guardrailWizard.runtimeTitle")} description={t("guardrailWizard.runtimeDescription")}><RuntimePostureFields safetyLevel={safetyLevel === "maximum" ? "strict" : safetyLevel === "standard" ? "balanced" : safetyLevel} outputDelivery={outputDelivery === "windowed" ? "window_buffered" : outputDelivery} onSafetyLevelChange={(value) => setSafetyLevel(value)} onOutputDeliveryChange={(value) => setOutputDelivery(value)} /><InfoNotice title={t("guardrailWizard.deploymentSeparateTitle")}>{t("guardrailWizard.deploymentSeparate")}</InfoNotice></WizardSection> : null}
        {step === 3 ? <WizardSection title={t("guardrailWizard.reviewTitle")} description={t("guardrailWizard.reviewDescription")}><section className="overflow-hidden rounded-xl border bg-card"><ReviewRow label={t("guardrailWizard.name")} value={name} /><ReviewRow label={t("guardrailWizard.purpose")} value={purpose} /><ReviewRow label={t("guardrailWizard.policies")} value={selectedPolicies.map((policy) => policy.name).join(", ")} /><ReviewRow label={t("guardrailWizard.policyRules")} value={String(bindings.reduce((total, binding) => total + binding.enabled_rule_ids.length, 0))} /><ReviewRow label={t("guardrailWizard.runtimeProfile")} value={`nemo_only · Colang 2.x · ${safetyLevel} · ${outputDelivery}`} /></section><div className="mt-4 flex flex-wrap gap-2"><Badge variant="outline">{bindings.length} Policies</Badge><Badge variant="outline"><Check />{t("guardrailWizard.planReady")}</Badge></div></WizardSection> : null}
      </CreationFlow>
    </EntitySheet>
  );
}

function WizardSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section><header className="mb-5"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></header>{children}</section>; }
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="grid gap-2"><Label>{label}</Label>{children}{hint ? <span className="text-xs leading-5 text-muted-foreground">{hint}</span> : null}</label>; }
function ReviewRow({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 p-4 sm:grid-cols-[11rem_minmax(0,1fr)]"><span className="text-xs text-muted-foreground">{label}</span><strong className="text-sm font-medium">{value || "—"}</strong></div>; }
