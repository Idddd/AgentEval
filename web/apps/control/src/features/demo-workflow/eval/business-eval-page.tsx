import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Play, Send, ShieldCheck, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEvaluationLayerState } from "@/features/evaluation-layer/mock-provider";
import { useDemoWorkflowActions, useDemoWorkflowState, useDemoWorkflowStore } from "../provider";
import { selectAdminReleaseCandidates } from "../selectors";
import type { DemoRevisionStatus } from "../model";
import { BusinessEvalForm, type BusinessEvalDraft } from "./business-eval-form";
import { BusinessEvalReport } from "./business-eval-report";

const DEFAULT_DRAFT: Omit<BusinessEvalDraft, "datasetId" | "selectedTemplateIds"> = {
  businessPurpose: "Resolve customer cases consistently while protecting restricted information.",
  targetUsers: "Customer service representatives",
  criticality: "High",
  dataSensitivity: "Confidential customer data",
  successThreshold: 85,
  approvalReason: "Meets service quality and safety expectations for the pilot team.",
};

export function BusinessEvalPage() {
  const state = useDemoWorkflowState();
  const store = useDemoWorkflowStore();
  const actions = useDemoWorkflowActions();
  const evaluationState = useEvaluationLayerState();
  const candidates = useMemo(() => selectAdminReleaseCandidates(state), [state]);
  const templates = useMemo(
    () => evaluationState.guardrailTemplates.filter((template) => template.available !== false && template.applicableTargetKinds.includes("agent")),
    [evaluationState.guardrailTemplates],
  );
  const requiredTemplateIds = useMemo(
    () => templates.filter((template) => template.required || template.defaultFor.includes("agent")).map((template) => template.id),
    [templates],
  );
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<BusinessEvalDraft>(() => ({
    ...DEFAULT_DRAFT,
    datasetId: state.datasets[0]?.id ?? "",
    selectedTemplateIds: requiredTemplateIds,
  }));

  useEffect(() => {
    if (selectedId && candidates.some((candidate) => candidate.revisionKey === selectedId)) return;
    const preferred = candidates.find((candidate) => candidate.status === "PENDING_EVAL") ?? candidates[0];
    setSelectedId(preferred?.revisionKey ?? "");
  }, [candidates, selectedId]);

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      selectedTemplateIds: [...new Set([
        ...current.selectedTemplateIds.filter((id) => templates.some((template) => template.id === id)),
        ...requiredTemplateIds,
      ])],
    }));
  }, [requiredTemplateIds, templates]);

  const selected = candidates.find((candidate) => candidate.revisionKey === selectedId) ?? candidates[0];
  const revision = state.agentRevisions.find((item) => item.id === selected?.revisionKey);
  const canRun = revision?.status === "PENDING_EVAL";
  const running = revision?.status === "BUSINESS_EVALUATING";
  const canDecide = revision?.status === "PENDING_APPROVAL";

  const run = () => {
    if (!revision) return;
    try {
      const selectedTemplates = templates.filter((template) => draft.selectedTemplateIds.includes(template.id));
      actions.runBusinessEvaluation(revision.id, {
        businessPurpose: draft.businessPurpose,
        targetUsers: draft.targetUsers,
        criticality: draft.criticality,
        dataSensitivity: draft.dataSensitivity,
        successThreshold: draft.successThreshold,
        datasetId: draft.datasetId,
        guardrailTemplates: selectedTemplates.map((template) => ({
          id: template.id,
          sourceGuardrailId: template.sourceGuardrailId ?? template.id,
          sourceGuardrailRevisionId: template.sourceGuardrailRevisionId ?? `${template.id}:R${template.version}`,
          version: template.version,
          name: template.name,
        })),
        approvalReason: draft.approvalReason,
      });
      setError("");
      setNotice("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to run Business Eval");
    }
  };

  const decide = (decision: "APPROVED" | "REJECTED") => {
    if (!revision) return;
    try {
      store.decideRevision(revision.id, decision, draft.approvalReason, "admin");
      setNotice(decision === "APPROVED" ? "Published to Agent Garden" : "Release Candidate rejected");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save approval decision");
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        title="Business Eval"
        description="Evaluate business outcomes, safety coverage, and approval readiness without technical configuration details."
        badge={<Badge variant="outline">Admin</Badge>}
      />
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Pending review" value={candidates.filter((item) => item.status === "PENDING_EVAL").length} />
        <Metric label="Evaluating" value={candidates.filter((item) => item.status === "BUSINESS_EVALUATING").length} />
        <Metric label="Awaiting decision" value={candidates.filter((item) => item.status === "PENDING_APPROVAL").length} />
        <Metric label="Published" value={candidates.filter((item) => item.status === "PUBLISHED").length} />
      </div>
      {notice ? <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="size-4" />{notice}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      {!candidates.length ? (
        <Card className="border-dashed"><CardContent className="grid min-h-64 place-items-center p-8 text-center"><div><ClipboardCheck className="mx-auto size-10 text-muted-foreground" /><h2 className="mt-3 font-semibold">No Release Candidate yet</h2><p className="mt-1 text-sm text-muted-foreground">A validated revision will appear here after Agent Wizard submits it.</p></div></CardContent></Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-2 self-start xl:sticky xl:top-24">
            <h2 className="mb-3 text-sm font-semibold">Release Candidates</h2>
            {candidates.map((candidate) => (
              <button key={candidate.revisionKey} type="button" onClick={() => setSelectedId(candidate.revisionKey)} className={`w-full rounded-lg border p-4 text-left transition-colors ${selected?.revisionKey === candidate.revisionKey ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
                <div className="flex items-start justify-between gap-2"><strong className="text-sm">{candidate.name} · R{candidate.revision}</strong><Status status={candidate.status} /></div>
                <p className="mt-2 text-xs text-muted-foreground">Owner · {candidate.owner}</p>
              </button>
            ))}
          </aside>
          {revision && selected ? (
            <main className="space-y-5">
              <Card>
                <CardHeader className="border-b"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><CardTitle>{selected.name} · R{selected.revision}</CardTitle><Status status={selected.status} /></div><p className="mt-2 text-sm text-muted-foreground">Owner · {selected.owner}</p></div><Button disabled={!canRun || running} onClick={run}>{running ? <ShieldCheck /> : <Play />}{running ? "Running Eval" : "Run Business Eval"}</Button></div></CardHeader>
                <CardContent className="grid gap-3 p-5 sm:grid-cols-3"><BusinessFact label="Business outcome" value={selected.businessPurpose} /><BusinessFact label="Audience" value={selected.targetUsers} /><BusinessFact label="Safety coverage" value={selected.guardrailCoverage} /></CardContent>
              </Card>
              {revision.businessEvaluation ? <BusinessEvalReport evaluation={revision.businessEvaluation} /> : null}
              <BusinessEvalForm value={draft} onChange={setDraft} datasets={state.datasets} templates={templates} disabled={!canRun} />
              {canDecide ? (
                <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><strong>Approval decision required</strong><p className="mt-1 text-sm text-muted-foreground">Publish this exact revision or return it with a recorded business reason.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => decide("REJECTED")}><XCircle />Reject</Button><Button onClick={() => decide("APPROVED")}><Send />Approve &amp; Publish</Button></div></CardContent></Card>
              ) : null}
              {revision.status === "PUBLISHED" ? <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20"><CardContent className="flex items-center gap-3 p-5 text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="size-6" /><div><strong>Published to Agent Garden</strong><p className="text-sm">End users can now apply the approved stable version.</p></div></CardContent></Card> : null}
            </main>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <Card><CardContent className="p-5"><span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span><strong className="mt-2 block text-3xl tabular-nums">{value}</strong></CardContent></Card>; }
function BusinessFact({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border bg-muted/20 p-3"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-sm">{value}</strong></div>; }
function Status({ status }: { status: DemoRevisionStatus }) { const label = status === "PENDING_EVAL" ? "Pending Eval" : status === "BUSINESS_EVALUATING" ? "Evaluating" : status === "PENDING_APPROVAL" ? "Decision ready" : status === "PUBLISHED" ? "Published" : status.replaceAll("_", " ").toLowerCase(); const good = ["PENDING_APPROVAL", "PUBLISHED"].includes(status); return <Badge variant="outline" className={good ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>{label}</Badge>; }
