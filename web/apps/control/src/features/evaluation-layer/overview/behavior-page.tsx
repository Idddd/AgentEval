import { useMemo, useState } from "react";
import {
  Bot,
  Eye,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEvaluationLayerState } from "../mock-provider";
import type { EvaluationLayerTrace } from "../model";
import { EvaluationLayerStatusBadge } from "../shared/evaluation-status";
import {
  EvaluationMetric,
  EvaluationSection,
  EvaluationTable,
  JsonPreview,
  formatCost,
} from "../shared/evaluation-ui";

type BehaviorFilter = "ALL" | "CLEAR" | "FLAGGED" | "ERROR";

interface BehaviorReview {
  outcome: "CLEAR" | "VIOLATION";
  summary: string;
  rules: string[];
}

function traceIsFlagged(trace: EvaluationLayerTrace) {
  return trace.markedFailed
    || trace.status === "FAIL"
    || trace.status === "ERROR"
    || (trace.judge?.scores.safety ?? 5) <= 2;
}

function reviewTrace(trace: EvaluationLayerTrace): BehaviorReview {
  if (trace.status === "ERROR") {
    return {
      outcome: "VIOLATION",
      summary: "The model flow failed before a trustworthy policy outcome was recorded.",
      rules: ["Execution integrity", "Fail-closed behavior"],
    };
  }
  if (traceIsFlagged(trace)) {
    const bypass = /bypass|despite a deny|leaked|restricted/i.test(
      `${trace.response} ${trace.judge?.summary ?? ""}`,
    );
    return {
      outcome: "VIOLATION",
      summary: bypass
        ? "The LLM reviewer found a policy bypass: the model or tool continued after access should have been denied."
        : "The LLM reviewer found behavior that conflicts with the expected safety policy.",
      rules: bypass
        ? ["Authorization boundary", "Sensitive-data handling"]
        : ["Expected behavior contract"],
    };
  }
  return {
    outcome: "CLEAR",
    summary: "The recorded request, model response, and tool behavior are consistent with the expected policy.",
    rules: ["No violation detected"],
  };
}

function fallbackLogLines(trace: EvaluationLayerTrace) {
  if (trace.spans.length) {
    return trace.spans.map((span) => ({
      id: span.id,
      at: span.startedAt,
      action: span.kind.toLowerCase(),
      detail: `${span.name} · ${span.status}`,
      outcome: span.status === "ERROR" ? "failure" : "success",
    }));
  }
  return [
    { id: `${trace.id}-start`, at: trace.startedAt, action: "model_call", detail: `Started ${trace.caseId}`, outcome: "info" },
    { id: `${trace.id}-end`, at: trace.startedAt, action: "result", detail: trace.response, outcome: trace.status === "PASS" ? "success" : "failure" },
  ];
}

export function BehaviorPage() {
  const state = useEvaluationLayerState();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BehaviorFilter>("ALL");
  const [selectedTraceId, setSelectedTraceId] = useState(state.traces[0]?.id ?? "");
  const [reviews, setReviews] = useState<Record<string, BehaviorReview>>({});

  const targetById = useMemo(
    () => new Map(state.targets.map((target) => [target.id, target] as const)),
    [state.targets],
  );
  const runById = useMemo(
    () => new Map(state.runs.map((run) => [run.id, run] as const)),
    [state.runs],
  );
  const revisionById = useMemo(
    () => new Map(state.targetRevisions.map((revision) => [revision.id, revision] as const)),
    [state.targetRevisions],
  );
  const filteredTraces = state.traces.filter((trace) => {
    const target = targetById.get(trace.targetId);
    const text = `${trace.caseId} ${trace.response} ${target?.name ?? ""}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (filter === "FLAGGED") return traceIsFlagged(trace) && trace.status !== "ERROR";
    if (filter === "ERROR") return trace.status === "ERROR";
    if (filter === "CLEAR") return !traceIsFlagged(trace);
    return true;
  });
  const selectedTrace = state.traces.find((trace) => trace.id === selectedTraceId)
    ?? filteredTraces[0]
    ?? state.traces[0];
  const selectedRun = selectedTrace ? runById.get(selectedTrace.runId) : undefined;
  const selectedRevision = selectedRun ? revisionById.get(selectedRun.targetRevisionId) : undefined;
  const selectedTarget = selectedTrace ? targetById.get(selectedTrace.targetId) : undefined;
  const selectedReview = selectedTrace ? reviews[selectedTrace.id] : undefined;
  const selectedLogs = selectedTrace
    ? state.logs.filter((log) => log.runId === selectedTrace.runId && (!log.caseId || log.caseId === selectedTrace.caseId))
    : [];
  const logLines = selectedTrace && selectedLogs.length ? selectedLogs : selectedTrace ? fallbackLogLines(selectedTrace) : [];
  const request = selectedTrace?.toolEvidence[0]?.requestedArguments
    ?? selectedTrace?.spans.find((span) => span.input)?.input
    ?? (selectedTrace ? { case_id: selectedTrace.caseId, target_id: selectedTrace.targetId, mode: "recorded-demo" } : {});
  const response = selectedTrace?.toolEvidence[0]?.output
    ?? (selectedTrace ? { status: selectedTrace.status, response: selectedTrace.response } : {});
  const flaggedCount = state.traces.filter(traceIsFlagged).length;
  const averageLatency = state.traces.length
    ? Math.round(state.traces.reduce((sum, trace) => sum + (trace.latencyMs ?? 0), 0) / state.traces.length)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <EvaluationMetric compact label="Recorded calls" value={state.traces.length} detail="Model and tool invocations" />
        <EvaluationMetric compact label="Needs review" value={flaggedCount} detail="Failed, unsafe, or errored" />
        <EvaluationMetric compact label="LLM reviewed" value={Object.keys(reviews).length} detail="Reviewed in this demo session" />
        <EvaluationMetric compact label="Average latency" value={`${averageLatency} ms`} detail={`Recorded cost ${formatCost(state.traces.reduce((sum, trace) => sum + trace.costUsd, 0))}`} />
      </div>

      <EvaluationSection
        title="Model call history"
        description="Inspect recorded inputs, responses, tool behavior, and compliance state."
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label="Search model calls"
                className="h-9 w-60 pl-8"
                placeholder="Search calls or targets"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label="Behavior status"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={filter}
              onChange={(event) => setFilter(event.target.value as BehaviorFilter)}
            >
              <option value="ALL">All behavior</option>
              <option value="CLEAR">Clear</option>
              <option value="FLAGGED">Flagged</option>
              <option value="ERROR">Errors</option>
            </select>
          </div>
        )}
      >
        <EvaluationTable density="compact">
          <thead>
            <tr><th>Time</th><th>Target</th><th>Case / call</th><th>Model</th><th>Status</th><th>Behavior</th><th>Review</th></tr>
          </thead>
          <tbody>
            {filteredTraces.map((trace) => {
              const target = targetById.get(trace.targetId);
              const run = runById.get(trace.runId);
              const revision = run ? revisionById.get(run.targetRevisionId) : undefined;
              const review = reviews[trace.id];
              return (
                <tr key={trace.id} className={selectedTrace?.id === trace.id ? "bg-cyan-500/5" : undefined}>
                  <td>{new Date(trace.startedAt).toLocaleString()}</td>
                  <td><p className="font-medium">{target?.name ?? trace.targetId}</p><p className="text-[11px] text-muted-foreground">{target?.kind ?? "Target"}</p></td>
                  <td><p className="max-w-56 truncate font-medium" title={trace.caseId}>{trace.caseId}</p><p className="max-w-56 truncate text-[11px] text-muted-foreground" title={trace.response}>{trace.response}</p></td>
                  <td>{revision?.model ?? revision?.version ?? "Recorded demo"}</td>
                  <td><EvaluationLayerStatusBadge status={trace.status} /></td>
                  <td>{traceIsFlagged(trace) ? <Badge variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">Flagged</Badge> : <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">Clear</Badge>}</td>
                  <td><Button size="sm" variant={selectedTrace?.id === trace.id ? "secondary" : "outline"} onClick={() => setSelectedTraceId(trace.id)}>{review ? review.outcome === "CLEAR" ? "Reviewed · clear" : "Reviewed · violation" : "Inspect"}</Button></td>
                </tr>
              );
            })}
          </tbody>
        </EvaluationTable>
        {!filteredTraces.length ? <p className="py-8 text-center text-sm text-muted-foreground">No model calls match these filters.</p> : null}
      </EvaluationSection>

      {selectedTrace ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,.85fr)]">
          <EvaluationSection
            title="Call inspection"
            description={`${selectedTarget?.name ?? selectedTrace.targetId} · ${selectedTrace.caseId}`}
            action={(
              <Button onClick={() => setReviews((current) => ({ ...current, [selectedTrace.id]: reviewTrace(selectedTrace) }))}>
                <Sparkles />{selectedReview ? "Review again" : "Review with LLM"}
              </Button>
            )}
          >
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Target</p><p className="mt-1 font-medium">{selectedTarget?.name}</p></div>
                <div className="rounded-md border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Model</p><p className="mt-1 font-medium">{selectedRevision?.model ?? selectedRevision?.version ?? "Recorded demo"}</p></div>
                <div className="rounded-md border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Latency</p><p className="mt-1 font-medium">{selectedTrace.latencyMs ?? 0} ms</p></div>
              </div>
              {selectedReview ? (
                <div role="status" aria-label="LLM behavior review" className={cn("rounded-md border p-3", selectedReview.outcome === "VIOLATION" ? "border-destructive/35 bg-destructive/5" : "border-emerald-500/35 bg-emerald-500/10")}>
                  <div className="flex items-center gap-2 font-semibold">{selectedReview.outcome === "VIOLATION" ? <XCircle className="size-4 text-destructive" /> : <ShieldCheck className="size-4 text-emerald-600" />}{selectedReview.outcome === "VIOLATION" ? "Violation detected" : "No violation detected"}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedReview.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-2">{selectedReview.rules.map((rule) => <Badge key={rule} variant="outline">{rule}</Badge>)}</div>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground"><Eye className="size-4" />Run the LLM review to explain whether this behavior violates policy.</div>
              )}
              <div className="grid gap-3 lg:grid-cols-2">
                <div><p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Request</p><JsonPreview value={request} /></div>
                <div><p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Response</p><JsonPreview value={response} /></div>
              </div>
            </div>
          </EvaluationSection>

          <EvaluationSection title="Runtime log" description="Recorded events for the selected call.">
            <div className="max-h-[34rem] overflow-auto rounded-md border bg-slate-950 p-3 font-mono text-xs text-slate-200">
              {logLines.map((line) => (
                <div key={line.id} className="grid grid-cols-[7.5rem_5.5rem_minmax(0,1fr)] gap-2 border-b border-slate-800 py-1.5 last:border-0">
                  <span className="text-slate-500">{new Date(line.at).toLocaleTimeString()}</span>
                  <span className={cn(line.outcome === "failure" ? "text-rose-400" : line.outcome === "success" ? "text-emerald-400" : "text-cyan-400")}>{line.action}</span>
                  <span className="break-words">{line.detail}</span>
                </div>
              ))}
              {!logLines.length ? <div className="flex items-center gap-2 text-slate-400"><TerminalSquare className="size-4" />No runtime logs recorded.</div> : null}
            </div>
          </EvaluationSection>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground"><Bot className="mx-auto mb-3 size-7" /><p>No recorded model behavior is available.</p></div>
      )}
      <div className="sr-only" aria-live="polite">{selectedReview ? selectedReview.summary : ""}</div>
    </div>
  );
}
