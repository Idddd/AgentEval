import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BellRing, ChartNoAxesCombined, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useCurrentProjectId } from "@/hooks/use-project";
import { AgentGardenIcon } from "@/components/agent-garden/agent-garden-icon";
import {
  useEvaluationLayerState,
  useEvaluationLayerStore,
} from "../mock-provider";
import { traceSampledAtRate } from "../mock-store";
import type {
  EvaluationLayerEvaluator,
  EvaluationLayerTrace,
} from "../model";
import { EvaluationLayerStatusBadge } from "../shared/evaluation-status";
import {
  overviewTraceStatus,
  traceEvaluatorAlertTriggered,
  traceEvaluatorSummary,
} from "./overview-evaluator-policy";
import {
  EvaluationTable,
  formatCost,
  formatPercent,
  formatRelativeTime,
  useFlashingKeys,
} from "../shared/evaluation-ui";

const STATUS_FILTERS = ["ALL", "PASS", "FAIL", "ERROR"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const EVALUATOR_POLICY_PREVIEW_COUNT = 4;
const TRACE_EVALUATOR_PREVIEW_COUNT = 3;

const STATUS_COLORS: Record<Exclude<StatusFilter, "ALL">, string> = {
  PASS: "bg-emerald-500",
  FAIL: "bg-red-500",
  ERROR: "bg-amber-500",
};

const monitoringCaseLabels: Record<string, string> = {
  "weather-guest-allow": "Safe public data access",
  "employee-dept-hr-allow": "Authorized employee data access",
  "salary-employee-deny": "Data leak prevention",
  "restart-admin-allow": "Authorized privileged action",
  "restart-employee-deny": "Unauthorized action blocked",
  "jailbreak-guard-bypass": "Prompt injection data leak",
  "ops-list-allow": "Authorized read-only action",
  "ops-list-deny": "Unauthorized tool action blocked",
  "kb-policy-hit": "Grounded policy response",
  "kb-policy-miss": "Ungrounded response prevented",
  "skill-summary-decision": "Instruction-following summary",
  "skill-summary-risks": "Security incident summary includes risks and next steps",
  "deployment-health-running": "Service health check",
};

function monitoringCaseLabel(caseId: string) {
  return monitoringCaseLabels[caseId] ?? caseId;
}

function observationCount(trace: {
  spans: unknown[];
  toolEvidence: unknown[];
  judge?: unknown;
}) {
  return trace.spans.length + trace.toolEvidence.length + (trace.judge ? 1 : 0);
}

export function EvaluationOverviewPage() {
  const state = useEvaluationLayerState();
  const store = useEvaluationLayerStore();
  const projectId = useCurrentProjectId();
  const [targetId, setTargetId] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [showAllEvaluators, setShowAllEvaluators] = useState(false);

  const scoped = useMemo(
    () =>
      state.traces
        .filter((trace) => targetId === "all" || trace.targetId === targetId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [state.traces, targetId],
  );
  const traceStatuses = useMemo(
    () =>
      new Map(
        scoped.map((trace) => [
          trace.id,
          overviewTraceStatus(trace, state.evaluators),
        ]),
      ),
    [scoped, state.evaluators],
  );
  const traces =
    statusFilter === "ALL"
      ? scoped
      : scoped.filter((trace) => traceStatuses.get(trace.id) === statusFilter);

  const observations = scoped.reduce(
    (sum, trace) => sum + observationCount(trace),
    0,
  );
  const failures = scoped.filter(
    (trace) => traceStatuses.get(trace.id) === "FAIL",
  ).length;
  const cost = scoped.reduce((sum, trace) => sum + trace.costUsd, 0);
  const counts = {
    PASS: scoped.filter((trace) => traceStatuses.get(trace.id) === "PASS")
      .length,
    FAIL: scoped.filter((trace) => traceStatuses.get(trace.id) === "FAIL")
      .length,
    ERROR: scoped.filter((trace) => traceStatuses.get(trace.id) === "ERROR")
      .length,
  };

  const flashing = useFlashingKeys(
    scoped.map((trace) => [trace.id, trace.startedAt] as const),
  );

  const samplingRate = state.settings.samplingRate;

  const enabledEvaluators = state.evaluators.filter(
    (evaluator) => evaluator.enabled,
  );
  const visibleEvaluatorPolicies = showAllEvaluators
    ? state.evaluators
    : state.evaluators.slice(0, EVALUATOR_POLICY_PREVIEW_COUNT);

  if (!state.traces.length) {
    return (
      <EmptyState
        icon={ChartNoAxesCombined}
        title="No traces yet"
        description="Run an Evaluation to populate quality, failure, latency, and cost metrics."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Monitoring layer: sticky filters + KPIs + quality bar */}
      <div className="sticky top-16 z-10 space-y-3 rounded-lg border bg-background/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          {targetId !== "all" ? (
            <AgentGardenIcon
              type="custom"
              catalogIcon={
                state.targets.find((target) => target.id === targetId)?.icon
              }
              className="size-8"
              iconClassName="size-4"
            />
          ) : null}
          <Label className="flex items-center gap-2 text-sm">
            Agent
            <select
              className="h-8 min-w-56 rounded-md border bg-background px-2 text-sm"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="all">All Agents</option>
              {state.targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
          </Label>
          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map((filter) => (
              <Button
                key={filter}
                size="sm"
                variant={statusFilter === filter ? "default" : "outline"}
                onClick={() => setStatusFilter(filter)}
              >
                {filter === "ALL" ? "All" : filter}
              </Button>
            ))}
          </div>
          <span className="ml-auto flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Traces</p>
            <p className="mt-1 text-xl font-semibold">{scoped.length}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Observations</p>
            <p className="mt-1 text-xl font-semibold">{observations}</p>
          </div>
          <button
            type="button"
            className={cn(
              "rounded-md border p-3 text-left transition-colors hover:border-destructive/50",
              failures > 0 && "border-destructive/30 bg-destructive/5",
            )}
            onClick={() =>
              setStatusFilter((current) => (current === "FAIL" ? "ALL" : "FAIL"))
            }
          >
            <p className="text-xs text-muted-foreground">
              Failures{failures > 0 ? " · click to filter" : ""}
            </p>
            <p
              className={cn(
                "mt-1 text-xl font-semibold",
                failures > 0 && "text-destructive",
              )}
            >
              {failures}
            </p>
          </button>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Cost</p>
            <p className="mt-1 text-xl font-semibold">{formatCost(cost)}</p>
          </div>
        </div>
        <div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {(Object.keys(counts) as Array<keyof typeof counts>).map((key) =>
              counts[key] ? (
                <button
                  key={key}
                  type="button"
                  aria-label={`Filter ${key}`}
                  title={`${key}: ${counts[key]}`}
                  className={cn("h-full", STATUS_COLORS[key])}
                  style={{ width: `${(counts[key] / scoped.length) * 100}%` }}
                  onClick={() =>
                    setStatusFilter((current) =>
                      current === key ? "ALL" : key,
                    )
                  }
                />
              ) : null,
            )}
          </div>
          <div className="mt-1.5 flex gap-4 text-xs text-muted-foreground">
            {(Object.keys(counts) as Array<keyof typeof counts>).map((key) => (
              <span key={key} className="flex items-center gap-1.5">
                <span
                  className={cn("size-2 rounded-full", STATUS_COLORS[key])}
                />
                {key} {formatPercent(counts[key] / Math.max(scoped.length, 1))}{" "}
                ({counts[key]})
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Configuration layer: evaluator policy visibly drives trace status. */}
      <section role="region" aria-label="Evaluators" className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <h2 className="font-heading text-lg font-semibold">Evaluator policy</h2>
              <Badge variant="secondary">{enabledEvaluators.length} active</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Enabled rules score every sampled Trace below. Missing any threshold changes that Trace to FAIL.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-md border bg-background px-3 py-2">
            <div>
              <h3 className="text-sm font-medium">Sampling</h3>
              <p className="text-xs text-muted-foreground">Preview only; no stored data is removed.</p>
            </div>
            <Label className="flex items-center gap-3">
              <input type="range" min={0} max={100} step={5} value={samplingRate} className="w-40 max-w-full" aria-label="Sampling rate" onChange={(event) => store.setSamplingRate(Number(event.target.value))} />
              <span className="w-12 text-base font-semibold">{samplingRate}%</span>
            </Label>
          </div>
        </div>
        <div className={cn("grid gap-3 p-4 md:grid-cols-2", showAllEvaluators && "max-h-[28rem] overflow-y-auto")}>
          {visibleEvaluatorPolicies.map((evaluator) => (
            <article key={evaluator.id} className={cn("rounded-lg border p-4 transition-colors", evaluator.enabled ? "border-primary/30 bg-primary/[0.03]" : "bg-muted/20 opacity-70")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{evaluator.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{evaluator.provider === "BUILT_IN" ? "Built-in" : "Langsmith"} · {evaluator.version}</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" aria-label={`Enable ${evaluator.name}`} checked={evaluator.enabled} onChange={(event) => store.setEvaluatorEnabled(evaluator.id, event.target.checked)} />Enabled</label>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3">
                <label className="text-xs font-medium text-muted-foreground">Pass threshold<div className="mt-1 flex items-center gap-2"><input type="number" min={0} max={100} value={evaluator.minimumScore} aria-label={`Minimum score for ${evaluator.name}`} className="h-8 w-20 rounded-md border bg-background px-2 text-right text-sm text-foreground" onChange={(event) => store.setEvaluatorMinimumScore(evaluator.id, Number(event.target.value))} /><span>%</span></div></label>
                <label className="flex items-center justify-end gap-2 text-xs font-medium"><BellRing className="size-4 text-muted-foreground" /><input type="checkbox" aria-label={`Send alert for ${evaluator.name}`} checked={evaluator.sendAlert} onChange={(event) => store.setEvaluatorSendAlert(evaluator.id, event.target.checked)} />Alert on fail</label>
              </div>
            </article>
          ))}
        </div>
        {state.evaluators.length > EVALUATOR_POLICY_PREVIEW_COUNT ? (
          <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-4 py-2">
            <span className="text-xs text-muted-foreground">
              Showing {visibleEvaluatorPolicies.length} of {state.evaluators.length} Evaluators
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-expanded={showAllEvaluators}
              onClick={() => setShowAllEvaluators((current) => !current)}
            >
              {showAllEvaluators
                ? "Show fewer"
                : `Show all ${state.evaluators.length} Evaluators`}
            </Button>
          </div>
        ) : null}
      </section>

      {/* Work layer: the single trace table */}
      <div
        role="note"
        aria-label="Checks applied to every case"
        className="flex flex-wrap items-center gap-2 rounded-md border border-primary/20 bg-primary/[0.03] px-3 py-2"
      >
        <strong className="text-xs">Incoming Trace</strong><ArrowRight className="size-3.5 text-muted-foreground" />
        {enabledEvaluators.slice(0, TRACE_EVALUATOR_PREVIEW_COUNT).map((evaluator) => (
          <span
            key={evaluator.id}
            className="rounded-full border bg-background px-2 py-0.5 text-xs"
          >
            {evaluator.name}
          </span>
        ))}
        {enabledEvaluators.length > TRACE_EVALUATOR_PREVIEW_COUNT ? (
          <Badge variant="secondary">
            +{enabledEvaluators.length - TRACE_EVALUATOR_PREVIEW_COUNT} more active
          </Badge>
        ) : null}
        <ArrowRight className="size-3.5 text-muted-foreground" /><strong className="text-xs">Final Trace status</strong>
        <span className="text-xs text-muted-foreground">Any evaluator below threshold → FAIL</span>
      </div>
      <EvaluationTable>
        <thead>
          <tr>
            <th>Trace</th>
            <th>Agent</th>
            <th>Case</th>
            <th className="w-[300px]">Score</th>
            <th>Status</th>
            <th>Observations</th>
            <th>Latency</th>
            <th>Cost</th>
            <th>Sampled</th>
            <th>Started</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {traces.map((trace) => {
            const sampled = traceSampledAtRate(trace.id, samplingRate);
            const status = traceStatuses.get(trace.id) ?? "PASS";
            const agent = state.targets.find(
              (target) => target.id === trace.targetId,
            );
            return (
              <tr
                key={trace.id}
                className={cn(flashing.has(trace.id) && "eval-live-flash")}
              >
                <td className="font-mono text-xs">{trace.id.slice(0, 13)}…</td>
                <td>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <AgentGardenIcon
                      type="custom"
                      catalogIcon={agent?.icon}
                      className="size-7"
                      iconClassName="size-3.5"
                    />
                    <span className="text-xs">{agent?.name ?? trace.targetId}</span>
                  </span>
                </td>
                <td title={trace.caseId}>{monitoringCaseLabel(trace.caseId)}</td>
                <td>
                  <TraceScoreCell
                    trace={trace}
                    evaluators={state.evaluators}
                  />
                </td>
                <td>
                  <EvaluationLayerStatusBadge status={status} />
                </td>
                <td>{observationCount(trace)}</td>
                <td>
                  {trace.latencyMs ? `${trace.latencyMs} ms` : "Not available"}
                </td>
                <td>{formatCost(trace.costUsd)}</td>
                <td>
                  {sampled ? (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      ✓ sampled
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      — dropped
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatRelativeTime(trace.startedAt)}
                </td>
                <td>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/$projectId/evaluation/traces/$traceId"
                      params={{ projectId, traceId: trace.id }}
                    >
                      Open
                    </Link>
                  </Button>
                </td>
              </tr>
            );
          })}
          {!traces.length ? (
            <tr>
              <td colSpan={11} className="text-center text-muted-foreground">
                No traces match the current filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </EvaluationTable>
    </div>
  );
}

function TraceScoreCell({
  trace,
  evaluators,
}: {
  trace: EvaluationLayerTrace;
  evaluators: EvaluationLayerEvaluator[];
}) {
  const summary = traceEvaluatorSummary(trace, evaluators);
  if (!summary.evaluatedAny) {
    return (
      <span className="text-xs text-muted-foreground">Not evaluated</span>
    );
  }
  const alertTriggered = traceEvaluatorAlertTriggered(trace, evaluators);
  const orderedDetails = [...summary.details].sort(
    (left, right) =>
      Number(right.passed === false) - Number(left.passed === false) ||
      Number(right.passed === null) - Number(left.passed === null),
  );
  const previewDetails = orderedDetails.slice(0, TRACE_EVALUATOR_PREVIEW_COUNT);
  const remainingDetails = orderedDetails.slice(TRACE_EVALUATOR_PREVIEW_COUNT);
  const failed = summary.details.filter((detail) => detail.passed === false).length;

  return (
    <div className="space-y-1">
      <div aria-label={`Evaluator score: ${summary.passed} of ${summary.totalEnabled} passed`} className="space-y-1">
        {summary.totalEnabled > TRACE_EVALUATOR_PREVIEW_COUNT ? (
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <strong>{summary.passed}/{summary.totalEnabled} passed</strong>
            <span className={failed ? "font-medium text-red-700 dark:text-red-300" : "text-muted-foreground"}>
              {failed ? `${failed} need attention` : "All clear"}
            </span>
          </div>
        ) : null}
        {previewDetails.map((detail) => (
          <EvaluatorResultRow key={detail.evaluatorId} detail={detail} />
        ))}
        {remainingDetails.length ? (
          <details className="rounded border bg-background px-2 py-1 text-[11px]">
            <summary className="cursor-pointer font-medium text-primary">
              Show remaining {remainingDetails.length} evaluator results
            </summary>
            <div className="mt-1 space-y-1 border-t pt-1">
              {remainingDetails.map((detail) => (
                <EvaluatorResultRow key={detail.evaluatorId} detail={detail} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
      {alertTriggered ? (
        <p className="whitespace-nowrap text-[11px] font-medium text-red-700 dark:text-red-300">
          Alert triggered
        </p>
      ) : null}
    </div>
  );
}

function EvaluatorResultRow({
  detail,
}: {
  detail: ReturnType<typeof traceEvaluatorSummary>["details"][number];
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2 rounded border px-2 py-1 text-[11px]", detail.passed === false ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300" : "bg-background")}>
      <span className="min-w-0 truncate" title={detail.evaluatorName}>{detail.evaluatorName}</span>
      <strong className={cn("shrink-0", detail.passed === true ? "text-emerald-700 dark:text-emerald-300" : detail.passed === false ? "text-red-700 dark:text-red-300" : "text-muted-foreground")}>
        {detail.normalizedScore === null ? "Not scored" : `${detail.normalizedScore}% · ${detail.passed ? "PASS" : "FAIL"}`}
      </strong>
    </div>
  );
}
