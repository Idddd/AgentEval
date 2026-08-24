import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardCheck, Play, Send, ShieldCheck, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useEvaluationLayerState } from "@/features/evaluation-layer/mock-provider";
import { useDemoWorkflowActions, useDemoWorkflowProjectId, useDemoWorkflowState, useDemoWorkflowStore } from "../provider";
import { selectAdminReleaseCandidates } from "../selectors";
import type { DemoRevisionStatus } from "../model";
import { BusinessEvalForm, type BusinessEvalDraft } from "./business-eval-form";
import { BusinessEvalReport } from "./business-eval-report";

const CANDIDATES_PER_PAGE = 6;

export function BusinessEvalPage() {
  const state = useDemoWorkflowState();
  const store = useDemoWorkflowStore();
  const actions = useDemoWorkflowActions();
  const projectId = useDemoWorkflowProjectId();
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
  const [candidatePage, setCandidatePage] = useState(1);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [draft, setDraft] = useState<BusinessEvalDraft>(() => ({
    datasetId: state.datasets[0]?.id ?? "",
    selectedTemplateIds: requiredTemplateIds,
  }));

  useEffect(() => {
    if (selectedId && candidates.some((candidate) => candidate.revisionKey === selectedId)) return;
    const preferred =
      candidates.find((candidate) => candidate.status === "PENDING_APPROVAL") ??
      candidates.find((candidate) => candidate.status === "PENDING_EVAL") ??
      candidates[0];
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
  const candidatePageCount = Math.max(1, Math.ceil(candidates.length / CANDIDATES_PER_PAGE));
  const visibleCandidates = candidates.slice((candidatePage - 1) * CANDIDATES_PER_PAGE, candidatePage * CANDIDATES_PER_PAGE);
  const revision = state.agentRevisions.find((item) => item.id === selected?.revisionKey);
  const canRun = revision?.status === "PENDING_EVAL";
  const running = revision?.status === "BUSINESS_EVALUATING";
  const canDecide = revision?.status === "PENDING_APPROVAL";
  const approvalEvent = revision
    ? [...state.events].reverse().find((event) =>
        event.entityId === revision.id && event.action === "approved-and-published",
      )
    : undefined;

  useEffect(() => {
    setDecisionReason(revision?.decisionReason ?? "");
    setNotice("");
    setError("");
  }, [revision?.id]);

  useEffect(() => {
    if (candidatePage > candidatePageCount) setCandidatePage(candidatePageCount);
  }, [candidatePage, candidatePageCount]);

  const goToCandidatePage = (nextPage: number) => {
    const boundedPage = Math.min(candidatePageCount, Math.max(1, nextPage));
    setCandidatePage(boundedPage);
    const firstCandidate = candidates[(boundedPage - 1) * CANDIDATES_PER_PAGE];
    if (firstCandidate) setSelectedId(firstCandidate.revisionKey);
  };

  const run = () => {
    if (!revision) return;
    try {
      const agent = state.agents.find((item) => item.id === revision.agentId);
      const selectedTemplates = templates.filter((template) => draft.selectedTemplateIds.includes(template.id));
      actions.runBusinessEvaluation(revision.id, {
        businessPurpose: agent?.businessOutcome.trim() || "Not provided",
        targetUsers: agent?.targetUsers.trim() || "Not provided",
        criticality: "Not provided",
        dataSensitivity: "Not provided",
        successThreshold: 85,
        datasetId: draft.datasetId,
        guardrailTemplates: selectedTemplates.map((template) => ({
          id: template.id,
          sourceGuardrailId: template.sourceGuardrailId ?? template.id,
          sourceGuardrailRevisionId: template.sourceGuardrailRevisionId ?? `${template.id}:R${template.version}`,
          version: template.version,
          name: template.name,
          ...(template.sourcePolicies ? {
            sourcePolicies: template.sourcePolicies.map((policy) => ({
              id: policy.id,
              version: policy.version,
              name: policy.name,
              ruleCount: policy.ruleCount,
              testCaseCount: policy.testCaseCount,
            })),
          } : {}),
          ...(template.runtimePosture ? {
            runtimePosture: { ...template.runtimePosture },
          } : {}),
        })),
        approvalReason: "Evaluation evidence is ready for Admin review.",
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
      store.decideRevision(
        revision.id,
        decision,
        decision === "REJECTED" ? decisionReason : "",
        "admin",
      );
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Pending review" value={candidates.filter((item) => item.status === "PENDING_EVAL").length} />
        <Metric label="Evaluating" value={candidates.filter((item) => item.status === "BUSINESS_EVALUATING").length} />
        <Metric label="Awaiting decision" value={candidates.filter((item) => item.status === "PENDING_APPROVAL").length} />
        <Metric label="Rejected" value={candidates.filter((item) => item.status === "REJECTED").length} />
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
            {visibleCandidates.map((candidate) => (
              <button key={candidate.revisionKey} type="button" onClick={() => setSelectedId(candidate.revisionKey)} className={`w-full rounded-lg border p-4 text-left transition-colors ${selected?.revisionKey === candidate.revisionKey ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
                <div className="flex items-start justify-between gap-2"><strong className="text-sm">{candidate.name} · R{candidate.revision}</strong><Status status={candidate.status} /></div>
                <p className="mt-2 text-xs text-muted-foreground">Owner · {candidate.owner}</p>
              </button>
            ))}
            {candidatePageCount > 1 ? <div className="flex items-center justify-between gap-2 pt-2"><Button size="sm" variant="outline" disabled={candidatePage === 1} onClick={() => goToCandidatePage(candidatePage - 1)}>Previous</Button><span className="text-xs tabular-nums text-muted-foreground">{candidatePage} / {candidatePageCount}</span><Button size="sm" variant="outline" disabled={candidatePage === candidatePageCount} onClick={() => goToCandidatePage(candidatePage + 1)}>Next</Button></div> : null}
          </aside>
          {revision && selected ? (
            <main className="space-y-5">
              <Card className="gap-0 overflow-hidden py-0">
                <CardHeader className="border-b"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><CardTitle>{selected.name} · R{selected.revision}</CardTitle><Status status={selected.status} /></div><p className="mt-2 text-sm text-muted-foreground">Owner · {selected.owner}</p></div>{canRun || running ? <Button disabled={running} onClick={run}>{running ? <ShieldCheck /> : <Play />}{running ? "Running Eval" : "Run Business Eval"}</Button> : null}</div></CardHeader>
              <div>
              {revision.submissionJustification && !revision.businessEvaluation ? <section className="border-b p-4"><span className="text-xs text-muted-foreground">Submission justification</span><p className="mt-1 text-sm">{revision.submissionJustification}</p></section> : null}
              {revision.businessEvaluation ? <BusinessEvalReport evaluation={revision.businessEvaluation} fullReportHref={`/${projectId}/evaluation/reports/${revision.id}`} datasetName={state.datasets.find((dataset) => dataset.id === revision.businessEvaluation?.datasetId)?.name} {...(revision.submissionJustification !== undefined ? { submissionJustification: revision.submissionJustification } : {})} /> : null}
              {canDecide ? (
                <section className="border-t border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900 dark:bg-amber-950/10">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">Admin decision</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">Approve now, or optionally leave guidance when returning it for changes.</p>
                    </div>
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">Decision required</Badge>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <label className="grid min-w-0 gap-1.5 text-xs font-medium">
                      Return note <span className="font-normal text-muted-foreground">(optional)</span>
                      <Textarea
                        aria-label="Return note"
                        rows={2}
                        className="min-h-16 resize-none bg-background"
                        value={decisionReason}
                        placeholder="What should the owner change before resubmitting?"
                        onChange={(event) => setDecisionReason(event.target.value)}
                      />
                    </label>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        className="text-destructive hover:bg-destructive/5 hover:text-destructive"
                        onClick={() => decide("REJECTED")}
                      >
                        <XCircle />Return for changes
                      </Button>
                      <Button
                        onClick={() => decide("APPROVED")}
                      >
                        <Send />Approve &amp; Publish
                      </Button>
                    </div>
                  </div>
                </section>
              ) : null}
              </div>
              {revision.status === "PUBLISHED" ? (
                <section className="border-t border-emerald-200 bg-emerald-50/60 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-6 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <strong>Published to Agent Garden</strong>
                      <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">End users can now apply the approved stable version.</p>
                      <dl className="mt-3 grid gap-3 border-t border-emerald-200 pt-3 text-sm dark:border-emerald-900 sm:grid-cols-3">
                        <div><dt className="text-xs text-emerald-700/80 dark:text-emerald-400">Approved by</dt><dd className="mt-1 font-medium">{approvalEvent ? personaName(approvalEvent.createdByPersona) : "Local Administrator"}</dd></div>
                        <div><dt className="text-xs text-emerald-700/80 dark:text-emerald-400">Approved at</dt><dd className="mt-1 font-medium"><time dateTime={approvalEvent?.createdAt ?? revision.updatedAt}>{new Date(approvalEvent?.createdAt ?? revision.updatedAt).toLocaleString()}</time></dd></div>
                        <div><dt className="text-xs text-emerald-700/80 dark:text-emerald-400">Published revision</dt><dd className="mt-1 font-medium">R{revision.revision}</dd></div>
                      </dl>
                      <Button asChild size="sm" className="mt-4">
                        <a href={`/${projectId}/agent-garden?query=${encodeURIComponent(selected.name)}`}>
                          View in Agent Garden <ArrowRight />
                        </a>
                      </Button>
                    </div>
                  </div>
                </section>
              ) : null}
              {revision.status === "REJECTED" ? (
                  <section className="flex items-start gap-3 border-t border-destructive/30 bg-destructive/5 p-4 text-destructive">
                    <XCircle className="mt-0.5 size-6 shrink-0" />
                    <div>
                      <strong>Rejected after business review</strong>
                      <p className="mt-1 text-sm text-foreground">{revision.decisionReason || "Returned to the Agent Wizard for changes."}</p>
                    </div>
                  </section>
              ) : null}
              </Card>
              {canRun ? <BusinessEvalForm value={draft} datasets={state.datasets} templates={templates} /> : null}
            </main>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <Card><CardContent className="p-5"><span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span><strong className="mt-2 block text-3xl tabular-nums">{value}</strong></CardContent></Card>; }
function Status({ status }: { status: DemoRevisionStatus }) { const label = status === "PENDING_EVAL" ? "Pending Eval" : status === "BUSINESS_EVALUATING" ? "Evaluating" : status === "PENDING_APPROVAL" ? "Pending approval" : status === "PUBLISHED" ? "Published" : status === "REJECTED" ? "Rejected" : status.replaceAll("_", " ").toLowerCase(); const good = ["PENDING_APPROVAL", "PUBLISHED"].includes(status); const rejected = status === "REJECTED"; return <Badge variant="outline" className={good ? "border-emerald-200 bg-emerald-50 text-emerald-700" : rejected ? "border-destructive/30 bg-destructive/5 text-destructive" : ""}>{label}</Badge>; }
function personaName(persona: string) { return persona === "admin" ? "Local Administrator" : persona === "agent-wizard" ? "Agent Wizard" : "Business User"; }
