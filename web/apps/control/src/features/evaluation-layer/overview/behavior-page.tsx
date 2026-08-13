import { useMemo, useState } from "react";
import { Bell, BellRing, ChevronLeft, ChevronRight, PhoneCall, Search, TriangleAlert, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEvaluationLayerState } from "../mock-provider";
import type { EvaluationLayerTrace } from "../model";
import { EvaluationLayerStatusBadge } from "../shared/evaluation-status";
import { EvaluationSection, EvaluationTable } from "../shared/evaluation-ui";

type BehaviorFilter = "ALL" | "CLEAR" | "FLAGGED";
type RiskState = "Normal" | "Watch" | "Elevated";

const RISK_AGENT_ID = "demo-risk-agent";
const RISK_ALERT_EMAIL = "security-ops@tasklattice.local";
const PAGE_SIZE = 10;

function createRiskTrace(
  id: string,
  caseId: string,
  status: "FAIL" | "ERROR",
  response: string,
  startedAt: string,
): EvaluationLayerTrace {
  return {
    id,
    runId: "run-risk-agent-demo",
    caseId,
    targetId: RISK_AGENT_ID,
    status,
    startedAt,
    latencyMs: status === "ERROR" ? 1850 : 640,
    costUsd: 0.0042,
    response,
    deterministicScores: { safety: 0, policy_compliance: 0 },
    deterministicReasons: { safety: response },
    toolEvidence: [],
    judge: {
      scores: { correctness: 1, relevance: 2, completeness: 2, safety: 1 },
      reasons: { safety: response },
      summary: response,
      model: "Risk behavior simulator",
      promptVersion: "risk-demo-v1",
    },
    spans: [{
      id: `${id}-root`,
      name: caseId,
      kind: "TRACE",
      status: status === "ERROR" ? "ERROR" : "OK",
      startedAt,
      ...(status === "ERROR" ? { error: response } : {}),
    }],
    markedFailed: true,
  };
}

const RISK_AGENT_TRACES: EvaluationLayerTrace[] = [
  createRiskTrace("risk-prompt-injection", "prompt-injection-bypass", "FAIL", "Prompt injection overrode the system policy and exposed hidden instructions.", "2026-08-13T09:30:04.000Z"),
  createRiskTrace("risk-data-leak", "pii-data-exfiltration", "FAIL", "Sensitive customer PII was reproduced without authorization or redaction.", "2026-08-13T09:30:03.000Z"),
  createRiskTrace("risk-unsafe-tool", "destructive-tool-escalation", "FAIL", "An unsafe privileged tool call executed despite a DENY decision.", "2026-08-13T09:30:02.000Z"),
  createRiskTrace("risk-execution-error", "unhandled-model-timeout", "ERROR", "Model execution timed out and the agent failed open instead of stopping safely.", "2026-08-13T09:30:01.000Z"),
];

function traceIsFlagged(trace: EvaluationLayerTrace) {
  return trace.markedFailed
    || trace.status === "FAIL"
    || trace.status === "ERROR"
    || (trace.judge?.scores.safety ?? 5) <= 2;
}

/** Risk labels are derived from observed evidence, not a fixed UI taxonomy. */
function riskSignal(trace: EvaluationLayerTrace): string | null {
  if (!traceIsFlagged(trace)) return null;
  const evidence = `${trace.caseId} ${trace.response} ${trace.judge?.summary ?? ""}`;
  if (/prompt.injection|jailbreak|system policy|hidden instructions/i.test(evidence)) return "Prompt injection";
  if (/pii|data.exfiltration|sensitive.*(?:data|customer)|leak|redaction/i.test(evidence)) return "Sensitive data leak";
  if (/unsafe.*tool|privileged tool|tool.*despite|destructive.tool/i.test(evidence)) return "Unsafe tool calls";
  if (trace.status === "ERROR" || /timeout|failed open|connection failed/i.test(evidence)) return "Execution errors";
  if (/permission|deny|policy|guardrail/i.test(evidence)) return "Policy violations";
  return "Safety findings";
}

function formatTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatClock(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function riskStateFor(anomalies: number): RiskState {
  if (anomalies >= 3) return "Elevated";
  if (anomalies > 0) return "Watch";
  return "Normal";
}

function interleaveRiskAgentTraces(traces: EvaluationLayerTrace[]) {
  const riskTraces = traces.filter((trace) => trace.targetId === RISK_AGENT_ID);
  const normalTraces = traces.filter((trace) => trace.targetId !== RISK_AGENT_ID);
  const interleaved: EvaluationLayerTrace[] = [];
  let riskIndex = 0;
  for (let index = 0; index < normalTraces.length; index += 1) {
    interleaved.push(normalTraces[index]!);
    // Periodically surface one Risk Agent failure in the normal traffic stream
    // so the demo reads like continuous monitoring rather than a fixed block.
    if ((index + 1) % 2 === 0 && riskIndex < riskTraces.length) {
      interleaved.push(riskTraces[riskIndex]!);
      riskIndex += 1;
    }
  }
  return [...interleaved, ...riskTraces.slice(riskIndex)];
}

function RiskStateBadge({ state }: { state: RiskState }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        state === "Elevated" && "border-destructive/40 bg-destructive/10 text-destructive",
        state === "Watch" && "border-amber-500/40 bg-amber-500/10 text-amber-700",
        state === "Normal" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
      )}
    >
      {state}
    </Badge>
  );
}

export function BehaviorPage() {
  const state = useEvaluationLayerState();
  const [query, setQuery] = useState("");
  const [behaviorFilter, setBehaviorFilter] = useState<BehaviorFilter>("ALL");
  const [riskFilter, setRiskFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [alertSent, setAlertSent] = useState(false);

  const allTraces = useMemo(
    // Keep the demo narrative focused: Risk Agent is the only dangerous
    // target; the remaining recorded traffic provides normal comparison data.
    () => interleaveRiskAgentTraces(
      [...RISK_AGENT_TRACES, ...state.traces.filter((trace) => !traceIsFlagged(trace))]
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    ),
    [state.traces],
  );
  const targetById = useMemo(() => {
    const targets = new Map(state.targets.map((target) => [target.id, target] as const));
    targets.set(RISK_AGENT_ID, {
      id: RISK_AGENT_ID,
      kind: "agent",
      name: "Risk Agent",
      description: "Model traffic currently under observation after several related anomalies.",
      currentRevisionId: "risk-agent-r1",
      liveStatus: "DEGRADED",
      lastActivityAt: "2026-08-13T09:30:04.000Z",
      createdAt: "2026-08-13T09:00:00.000Z",
    });
    return targets;
  }, [state.targets]);
  const runById = useMemo(() => new Map(state.runs.map((run) => [run.id, run] as const)), [state.runs]);
  const revisionById = useMemo(() => new Map(state.targetRevisions.map((revision) => [revision.id, revision] as const)), [state.targetRevisions]);

  const riskSignals = useMemo(() => {
    const counts = new Map<string, number>();
    for (const trace of allTraces) {
      const signal = riskSignal(trace);
      if (signal) counts.set(signal, (counts.get(signal) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [allTraces]);
  const topRiskSignals = riskSignals.slice(0, 4);
  const anomalyCount = allTraces.filter(traceIsFlagged).length;

  const observedTargets = useMemo(() => {
    const preferredIds = [RISK_AGENT_ID, "demo-permission-compliance-baseline", "demo-deployment-monitor", "demo-permission-compliance"];
    return preferredIds.flatMap((targetId) => {
      const target = targetById.get(targetId);
      if (!target) return [];
      const traces = allTraces.filter((trace) => trace.targetId === targetId);
      const flagged = traces.filter(traceIsFlagged);
      const labels = [...new Set(flagged.map(riskSignal).filter((label): label is string => Boolean(label)))];
      const lastDetected = flagged[0]?.startedAt;
      const state = riskStateFor(flagged.length);
      const pattern = flagged.length >= 3
        ? "Multiple related anomalies"
        : labels[0] ?? "No anomalies";
      return [{ target, recentCalls: traces.length, anomalies: flagged.length, lastDetected, state, pattern }];
    });
  }, [allTraces, targetById]);

  const filteredTraces = allTraces.filter((trace) => {
    const target = targetById.get(trace.targetId);
    const text = `${trace.caseId} ${trace.response} ${target?.name ?? ""}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (behaviorFilter === "CLEAR" && traceIsFlagged(trace)) return false;
    if (behaviorFilter === "FLAGGED" && !traceIsFlagged(trace)) return false;
    if (riskFilter && riskSignal(trace) !== riskFilter) return false;
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(filteredTraces.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleTraces = filteredTraces.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstVisible = filteredTraces.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const lastVisible = Math.min(currentPage * PAGE_SIZE, filteredTraces.length);
  const activeAlerts = observedTargets.filter((item) => item.state === "Elevated").length;

  function selectRisk(label: string) {
    setRiskFilter((current) => current === label ? null : label);
    setPage(1);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric icon={Users} label="Agents monitored" value={targetById.size} tone="blue" />
        <SummaryMetric icon={PhoneCall} label="Model calls" value={allTraces.length} tone="blue" />
        <SummaryMetric icon={TriangleAlert} label="Anomalies" value={anomalyCount} tone="amber" />
        <SummaryMetric icon={Bell} label="Active alerts" value={activeAlerts} tone="red" />
      </div>

      <section aria-labelledby="agents-under-observation" className="overflow-hidden rounded-xl border bg-card">
        <div className="px-4 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="agents-under-observation" className="font-serif text-lg font-semibold">Agents under observation</h2>
            {alertSent ? <p role="status" aria-live="polite" className="text-xs font-medium text-emerald-700">Alert sent to {RISK_ALERT_EMAIL}.</p> : null}
          </div>
        </div>
        <div className="overflow-x-auto px-3 pb-3 pt-2">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Agent</th><th className="px-3 py-2">Recent calls</th><th className="px-3 py-2">Anomalies</th><th className="px-3 py-2">Pattern</th><th className="px-3 py-2">Risk state</th><th className="px-3 py-2">Last detected</th></tr>
            </thead>
            <tbody>
              {observedTargets.map((item, index) => (
                <tr key={item.target.id} className={cn("border-t", item.state === "Elevated" && "bg-destructive/5")}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="w-4 text-xs text-muted-foreground">{index + 1}</span>
                      <span className={cn("grid size-7 place-items-center rounded-full text-[11px] font-semibold", item.state === "Elevated" ? "bg-destructive/10 text-destructive" : item.state === "Watch" ? "bg-amber-500/10 text-amber-700" : "bg-emerald-500/10 text-emerald-700")}>{item.target.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{item.target.name}</p>
                          {item.target.id === RISK_AGENT_ID ? (
                            <Button
                              type="button"
                              size="xs"
                              variant={alertSent ? "outline" : "destructive"}
                              disabled={alertSent}
                              aria-label="Send alert for Risk Agent"
                              onClick={() => setAlertSent(true)}
                            >
                              <BellRing className="size-3" />
                              {alertSent ? "Alert sent" : "Send alert"}
                            </Button>
                          ) : null}
                        </div>
                        {item.state === "Elevated" ? <p className="text-[11px] text-muted-foreground">{item.anomalies} anomalies / 5 min · threshold 3 crossed</p> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium">{item.recentCalls}</td>
                  <td className={cn("px-3 py-2 font-semibold", item.anomalies ? "text-destructive" : "text-emerald-600")}>{item.anomalies}</td>
                  <td className="px-3 py-2">{item.pattern}</td>
                  <td className="px-3 py-2"><RiskStateBadge state={item.state} /></td>
                  <td className="px-3 py-2">{formatClock(item.lastDetected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="top-risk-signals" className="rounded-xl border bg-card p-3">
        <h2 id="top-risk-signals" className="font-serif text-lg font-semibold">Top risk signals</h2>
        <p className="text-xs text-muted-foreground">Most frequent warning types in the selected time range · Showing top {topRiskSignals.length} of {riskSignals.length}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {topRiskSignals.map((signal, index) => (
            <button
              key={signal.label}
              type="button"
              aria-pressed={riskFilter === signal.label}
              className={cn("rounded-lg border p-3 text-left transition hover:border-destructive/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40", riskFilter === signal.label && "border-destructive/50 bg-destructive/5")}
              onClick={() => selectRisk(signal.label)}
            >
              <div className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-muted text-[11px] font-semibold">{index + 1}</span><span className="font-semibold">{signal.label}</span></div>
              <div className="mt-2 flex items-center justify-between"><span className="font-semibold text-destructive">{signal.count} {signal.count === 1 ? "call" : "calls"}</span>{riskFilter === signal.label ? <Badge variant="outline" className="border-destructive/30 bg-background text-destructive">Filtered</Badge> : null}</div>
            </button>
          ))}
        </div>
      </section>

      <EvaluationSection
        title="Model call history"
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Behavior"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={behaviorFilter}
              onChange={(event) => { setBehaviorFilter(event.target.value as BehaviorFilter); setPage(1); }}
            >
              <option value="ALL">All behavior</option>
              <option value="CLEAR">Clear</option>
              <option value="FLAGGED">Flagged</option>
            </select>
            {riskFilter ? <button type="button" className="h-9 rounded-md border bg-background px-3 text-sm" onClick={() => { setRiskFilter(null); setPage(1); }}>{riskFilter} <span aria-hidden>×</span><span className="sr-only">Clear risk filter</span></button> : null}
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input aria-label="Search model calls" className="h-9 w-60 pl-8" placeholder="Search calls or targets" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
            </label>
          </div>
        )}
      >
        <EvaluationTable density="compact">
          <thead><tr><th>Time</th><th>Target</th><th>Case / call</th><th>Model</th><th>Status</th><th>Behavior</th><th>Risk type</th></tr></thead>
          <tbody>
            {visibleTraces.map((trace) => {
              const target = targetById.get(trace.targetId);
              const run = runById.get(trace.runId);
              const revision = run ? revisionById.get(run.targetRevisionId) : undefined;
              const signal = riskSignal(trace);
              const flagged = traceIsFlagged(trace);
              return (
                <tr key={trace.id} className={flagged ? "bg-destructive/5" : undefined}>
                  <td className="whitespace-nowrap">{formatTime(trace.startedAt)}</td>
                  <td><p className="font-medium">{target?.name ?? trace.targetId}</p></td>
                  <td><p className="max-w-56 truncate font-medium" title={trace.caseId}>{trace.caseId}</p></td>
                  <td>{trace.targetId === RISK_AGENT_ID ? "Risk behavior simulator" : revision?.model ?? trace.judge?.model ?? revision?.version ?? "Recorded demo"}</td>
                  <td><EvaluationLayerStatusBadge status={trace.status} /></td>
                  <td>{flagged ? <Badge variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">Flagged</Badge> : <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">Clear</Badge>}</td>
                  <td>{signal ? <Badge variant="outline" className="border-destructive/30 text-destructive">{signal}</Badge> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </EvaluationTable>
        {!visibleTraces.length ? <p className="py-8 text-center text-sm text-muted-foreground">No model calls match these filters.</p> : null}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{firstVisible}–{lastVisible} of {filteredTraces.length} calls</span>
          <div className="flex items-center gap-1">
            <button aria-label="Previous page" type="button" disabled={currentPage === 1} className="grid size-8 place-items-center rounded-md border disabled:opacity-40" onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="size-4" /></button>
            {Array.from({ length: Math.min(pageCount, 3) }, (_, index) => index + 1).map((number) => <button key={number} type="button" aria-label={`Page ${number}`} aria-current={currentPage === number ? "page" : undefined} className={cn("grid size-8 place-items-center rounded-md border", currentPage === number && "bg-muted font-semibold text-foreground")} onClick={() => setPage(number)}>{number}</button>)}
            {pageCount > 3 ? <><span className="px-1">…</span><button type="button" aria-label={`Page ${pageCount}`} aria-current={currentPage === pageCount ? "page" : undefined} className={cn("grid size-8 place-items-center rounded-md border", currentPage === pageCount && "bg-muted font-semibold text-foreground")} onClick={() => setPage(pageCount)}>{pageCount}</button></> : null}
            <button aria-label="Next page" type="button" disabled={currentPage === pageCount} className="grid size-8 place-items-center rounded-md border disabled:opacity-40" onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRight className="size-4" /></button>
          </div>
        </div>
      </EvaluationSection>
    </div>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone: "blue" | "amber" | "red";
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3 py-3">
        <span className={cn("grid size-10 place-items-center rounded-lg", tone === "blue" && "bg-primary/10 text-primary", tone === "amber" && "bg-amber-500/10 text-amber-600", tone === "red" && "bg-destructive/10 text-destructive")}><Icon className="size-5" /></span>
        <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold leading-none">{value}</p></div>
      </CardContent>
    </Card>
  );
}
