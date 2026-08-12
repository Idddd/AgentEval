import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChartNoAxesCombined } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  EvaluationSection,
  EvaluationTable,
  formatCost,
  formatPercent,
  formatRelativeTime,
  JsonPreview,
  useFlashingKeys,
} from "../shared/evaluation-ui";

const STATUS_FILTERS = ["ALL", "PASS", "FAIL", "ERROR"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_COLORS: Record<Exclude<StatusFilter, "ALL">, string> = {
  PASS: "bg-emerald-500",
  FAIL: "bg-red-500",
  ERROR: "bg-amber-500",
};

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

  const scoped = useMemo(
    () =>
      state.traces
        .filter((trace) => targetId === "all" || trace.targetId === targetId)
        .sort((a, b) => {
          const onboardingOrder =
            Number(b.targetId === "demo-onboarding-assistant") -
            Number(a.targetId === "demo-onboarding-assistant");
          return onboardingOrder || b.startedAt.localeCompare(a.startedAt);
        }),
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
  ).length;

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

      {/* Configuration layer: evaluators, policy, and sampling what-if */}
      <section role="region" aria-label="Evaluators">
        <EvaluationSection
          title="Evaluators"
          description={`${enabledEvaluators}/${state.evaluators.length} evaluators will be used by the next Evaluation.`}
        >
          <div className="space-y-5">
            <EvaluationTable>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Version</th>
                  <th>Enabled</th>
                  <th>Minimum score</th>
                  <th>Send alert</th>
                </tr>
              </thead>
              <tbody>
                {state.evaluators.map((evaluator) => (
                  <tr key={evaluator.id}>
                    <td className="font-medium">{evaluator.name}</td>
                    <td>
                      {evaluator.provider === "BUILT_IN"
                        ? "Built-in"
                        : "Langfuse"}
                    </td>
                    <td>{evaluator.version}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Enable ${evaluator.name}`}
                        checked={evaluator.enabled}
                        onChange={(event) =>
                          store.setEvaluatorEnabled(
                            evaluator.id,
                            event.target.checked,
                          )
                        }
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={evaluator.minimumScore}
                          aria-label={`Minimum score for ${evaluator.name}`}
                          className="h-8 w-16 rounded-md border bg-background px-2 text-right text-sm"
                          onChange={(event) =>
                            store.setEvaluatorMinimumScore(
                              evaluator.id,
                              Number(event.target.value),
                            )
                          }
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Send alert for ${evaluator.name}`}
                        checked={evaluator.sendAlert}
                        onChange={(event) =>
                          store.setEvaluatorSendAlert(
                            evaluator.id,
                            event.target.checked,
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </EvaluationTable>

            <div className="space-y-4 border-t pt-5">
              <div>
                <h3 className="font-medium">Sampling</h3>
                <p className="text-sm text-muted-foreground">
                  What-if preview: how many current Traces would be captured.
                  No data is dropped.
                </p>
              </div>
              <Label className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={samplingRate}
                  className="w-64 max-w-full"
                  aria-label="Sampling rate"
                  onChange={(event) =>
                    store.setSamplingRate(Number(event.target.value))
                  }
                />
                <span className="w-12 text-lg font-semibold">
                  {samplingRate}%
                </span>
              </Label>
            </div>
          </div>
        </EvaluationSection>
      </section>

      {/* Work layer: the single trace table */}
      <EvaluationTable>
        <thead>
          <tr>
            <th>Trace</th>
            <th>Agent</th>
            <th>Case</th>
            <th className="w-[150px]">Score</th>
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
                <td>{trace.caseId}</td>
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

/**
 * Score column cell: a compact policy summary with normalized and raw
 * per-evaluator details in a bounded popover.
 */
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

  return (
    <div className="space-y-1">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Evaluator score: ${summary.passed} of ${summary.totalEnabled} passed`}
            title="View evaluator scores"
            className={cn(
              "whitespace-nowrap text-left text-xs font-semibold hover:underline",
              summary.allPassed
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-red-700 dark:text-red-300",
            )}
          >
            {summary.passed}/{summary.totalEnabled} passed
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="max-h-96 w-80 overflow-auto p-3"
        >
          <div className="space-y-3">
            <div>
              <p className="font-medium">Evaluator results</p>
              <p className="text-xs text-muted-foreground">
                Each evaluator uses its configured minimum score.
              </p>
            </div>
            {summary.details.map((detail) => (
              <div
                key={detail.evaluatorId}
                className="space-y-2 rounded-md border p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{detail.evaluatorName}</p>
                  <span
                    className={cn(
                      "whitespace-nowrap text-xs font-semibold",
                      detail.passed === null
                        ? "text-muted-foreground"
                        : detail.passed
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-red-700 dark:text-red-300",
                    )}
                  >
                    {detail.normalizedScore === null
                      ? "Not evaluated"
                      : `${detail.normalizedScore}% · ${detail.passed ? "PASS" : "FAIL"}`}
                  </span>
                </div>
                {detail.rawScores ? (
                  <JsonPreview value={detail.rawScores} />
                ) : null}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {alertTriggered ? (
        <p className="whitespace-nowrap text-[11px] font-medium text-red-700 dark:text-red-300">
          Alert triggered
        </p>
      ) : null}
    </div>
  );
}
