import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Beaker, CheckCircle2, FileCheck2, LoaderCircle, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useDemoWorkflowActions, useDemoWorkflowState, useDemoWorkflowStore } from "../provider";
import { selectAgentWizardBuilds } from "../selectors";
import type { DemoRevisionStatus } from "../model";
import { TechnicalResult } from "./technical-result";

const eligibleStatuses: DemoRevisionStatus[] = [
  "READY_FOR_VALIDATION",
  "VALIDATING",
  "VALIDATION_FAILED",
  "VALIDATED",
  "PENDING_EVAL",
  "BUSINESS_EVALUATING",
  "PENDING_APPROVAL",
  "PUBLISHED",
];

export function TechnicalValidationPage() {
  const state = useDemoWorkflowState();
  const store = useDemoWorkflowStore();
  const actions = useDemoWorkflowActions();
  const builds = useMemo(
    () => selectAgentWizardBuilds(state).filter((item) => eligibleStatuses.includes(item.status)),
    [state],
  );
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (selectedId && builds.some((item) => item.revisionId === selectedId)) return;
    setSelectedId(builds.find((item) => item.status === "READY_FOR_VALIDATION")?.revisionId ?? builds[0]?.revisionId ?? "");
  }, [builds, selectedId]);

  const selected = builds.find((item) => item.revisionId === selectedId) ?? builds[0];
  const revision = state.agentRevisions.find((item) => item.id === selected?.revisionId);
  const agent = state.agents.find((item) => item.id === selected?.agentId);
  const progress = revision?.status === "VALIDATING" ? 65 : revision?.technicalResult ? 100 : 0;

  const run = () => {
    if (!revision) return;
    try {
      setError("");
      setNotice("");
      actions.runTechnicalValidation(revision.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to run validation");
    }
  };
  const submit = () => {
    if (!revision) return;
    try {
      store.submitReleaseCandidate(revision.id, "agent-wizard");
      setNotice("Release Candidate submitted. Pending business evaluation");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit candidate");
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader title="Technical Validation" description="Verify runtime configuration and dependency integrity before handing a revision to business evaluation." />
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Ready" value={builds.filter((item) => item.status === "READY_FOR_VALIDATION").length} />
        <Metric label="Running" value={builds.filter((item) => item.status === "VALIDATING").length} />
        <Metric label="Validated" value={builds.filter((item) => item.status === "VALIDATED").length} />
        <Card className="border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/20"><CardContent className="flex min-h-24 items-center gap-3 p-5"><ShieldCheck className="size-7 text-sky-700" /><div><strong className="text-sm">Deterministic demo</strong><p className="text-xs text-muted-foreground">No runtime or endpoint is contacted.</p></div></CardContent></Card>
      </div>
      {notice ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      {!builds.length ? <Card className="border-dashed"><CardContent className="grid min-h-64 place-items-center p-8 text-center"><div><Beaker className="mx-auto size-10 text-muted-foreground" /><h2 className="mt-3 font-semibold">No revision is ready</h2><p className="mt-1 text-sm text-muted-foreground">Open an Agent from Build and mark its draft ready first.</p></div></CardContent></Card> : (
        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-2 self-start xl:sticky xl:top-24"><h2 className="mb-3 text-sm font-semibold">Validation queue</h2>{builds.map((build) => <button key={build.revisionId} type="button" onClick={() => setSelectedId(build.revisionId)} className={`w-full rounded-lg border p-4 text-left transition-colors ${selected?.revisionId === build.revisionId ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}><div className="flex items-center justify-between"><strong className="text-sm">{build.name} · R{build.revision}</strong><Status status={build.status} /></div><p className="mt-2 text-xs text-muted-foreground">{build.runtimeType} · {build.model}</p></button>)}</aside>
          {revision && selected && agent ? <main className="space-y-5">
            <Card><CardHeader className="border-b"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><CardTitle>{agent.name} · R{revision.revision}</CardTitle><Status status={revision.status} /></div><p className="mt-2 text-sm text-muted-foreground">Technical checks for the exact immutable revision.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={revision.status !== "READY_FOR_VALIDATION"} onClick={run}>{revision.status === "VALIDATING" ? <LoaderCircle className="animate-spin" /> : <Beaker />}Run Technical Validation</Button><Button disabled={revision.status !== "VALIDATED"} onClick={submit}>Submit Release Candidate <ArrowRight /></Button></div></div></CardHeader><CardContent className="space-y-4 p-5"><div className="flex items-center justify-between text-xs"><span>Validation progress</span><strong>{progress}%</strong></div><Progress value={progress} /><div className="grid gap-3 text-sm sm:grid-cols-3"><Config label="Runtime" value={revision.runtimeType} /><Config label="Model" value={revision.model} /><Config label="Endpoint" value={revision.endpoint} /></div></CardContent></Card>
            {revision.status === "PENDING_EVAL" ? <Card className="border-emerald-200 bg-emerald-50"><CardContent className="flex items-center gap-3 p-5 text-emerald-800"><FileCheck2 className="size-6" /><div><strong>Pending business evaluation</strong><p className="text-sm">The exact validated revision is now available to Admin in Eval.</p></div></CardContent></Card> : null}
            <section className="space-y-3"><div><h2 className="text-lg font-semibold">Validation checks</h2><p className="text-sm text-muted-foreground">Results are technical diagnostics and remain in Agent Wizard surfaces.</p></div><TechnicalResult result={revision.technicalResult} running={revision.status === "VALIDATING"} /></section>
          </main> : null}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <Card><CardContent className="p-5"><span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span><strong className="mt-2 block text-3xl tabular-nums">{value}</strong></CardContent></Card>; }
function Config({ label, value }: { label: string; value: string }) { return <div className="rounded-md border bg-muted/20 p-3"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block break-all font-mono text-xs">{value}</strong></div>; }
function Status({ status }: { status: DemoRevisionStatus }) { const label = status === "READY_FOR_VALIDATION" ? "Ready" : status === "VALIDATING" ? "Running" : status === "VALIDATED" ? "Validated" : status === "PENDING_EVAL" ? "Submitted" : status.replaceAll("_", " ").toLowerCase(); const good = ["VALIDATED", "PENDING_EVAL", "PUBLISHED"].includes(status); return <Badge variant="outline" className={good ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>{good && status === "VALIDATED" ? <CheckCircle2 /> : null}{label}</Badge>; }
