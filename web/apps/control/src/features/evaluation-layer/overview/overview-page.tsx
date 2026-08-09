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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { traceScoreJson } from "../traces/trace-view-model";
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
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [state.traces, targetId],
  );
  const traces =
    statusFilter === "ALL"
      ? scoped
      : scoped.filter((trace) => trace.status === statusFilter);

  const observations = scoped.reduce(
    (sum, trace) => sum + observationCount(trace),
    0,
  );
  const failures = scoped.filter(
    (trace) => trace.status !== "PASS" || trace.markedFailed,
  ).length;
  const cost = scoped.reduce((sum, trace) => sum + trace.costUsd, 0);
  const counts = {
    PASS: scoped.filter((trace) => trace.status === "PASS").length,
    FAIL: scoped.filter((trace) => trace.status === "FAIL").length,
    ERROR: scoped.filter((trace) => trace.status === "ERROR").length,
  };

  const flashing = useFlashingKeys(
    scoped.map((trace) => [trace.id, trace.startedAt] as const),
  );

  const samplingRate = state.settings.samplingRate;
  const sampling = useMemo(() => {
    const captured = scoped.filter((trace) =>
      traceSampledAtRate(trace.id, samplingRate),
    );
    const dropped = scoped.filter(
      (trace) => !traceSampledAtRate(trace.id, samplingRate),
    );
    return {
      captured: captured.length,
      total: scoped.length,
      droppedFailures: dropped.filter(
        (trace) => trace.status !== "PASS" || trace.markedFailed,
      ).length,
      capturedCost: captured.reduce((sum, trace) => sum + trace.costUsd, 0),
      totalCost: cost,
    };
  }, [scoped, samplingRate, cost]);

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

      {/* Configuration layer: evaluators + sampling what-if */}
      <Tabs defaultValue="evaluators">
        <TabsList>
          <TabsTrigger value="evaluators">Evaluators</TabsTrigger>
          <TabsTrigger value="sampling">Sampling</TabsTrigger>
        </TabsList>
        <TabsContent value="evaluators">
          <EvaluationSection
            title="Evaluators"
            description={`${enabledEvaluators}/${state.evaluators.length} evaluators will be used by the next Evaluation.`}
          >
            <EvaluationTable>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Version</th>
                  <th>Enabled</th>
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
                  </tr>
                ))}
              </tbody>
            </EvaluationTable>
          </EvaluationSection>
        </TabsContent>
        <TabsContent value="sampling">
          <EvaluationSection
            title="Sampling rate"
            description="What-if preview: how many of the current traces would be captured at this rate. No data is dropped."
          >
            <div className="space-y-4">
              <Label className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={samplingRate}
                  className="w-64"
                  aria-label="Sampling rate"
                  onChange={(event) =>
                    store.setSamplingRate(Number(event.target.value))
                  }
                />
                <span className="w-12 text-lg font-semibold">
                  {samplingRate}%
                </span>
              </Label>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: `${
                      (sampling.captured / Math.max(sampling.total, 1)) * 100
                    }%`,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Captured</p>
                  <p className="mt-1 text-xl font-semibold">
                    {sampling.captured}/{sampling.total}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    Estimated capture cost
                  </p>
                  <p className="mt-1 text-xl font-semibold">
                    {formatCost(sampling.capturedCost)}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    Estimated saving
                  </p>
                  <p className="mt-1 text-xl font-semibold">
                    {formatCost(sampling.totalCost - sampling.capturedCost)}
                  </p>
                </div>
                <div
                  className={cn(
                    "rounded-md border p-3",
                    sampling.droppedFailures > 0 &&
                      "border-amber-500/40 bg-amber-500/5",
                  )}
                >
                  <p className="text-xs text-muted-foreground">
                    Dropped failures
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-xl font-semibold",
                      sampling.droppedFailures > 0 &&
                        "text-amber-700 dark:text-amber-300",
                    )}
                  >
                    {sampling.droppedFailures}
                  </p>
                </div>
              </div>
              {sampling.droppedFailures > 0 ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                  ⚠ At {samplingRate}% sampling, {sampling.droppedFailures}{" "}
                  failure trace{sampling.droppedFailures === 1 ? "" : "s"} would
                  not be captured.
                </p>
              ) : null}
            </div>
          </EvaluationSection>
        </TabsContent>
      </Tabs>

      {/* Work layer: the single trace table */}
      <EvaluationTable>
        <thead>
          <tr>
            <th>Trace</th>
            <th>Agent</th>
            <th>Case</th>
            <th>Status</th>
            <th>Observations</th>
            <th>Latency</th>
            <th>Cost</th>
            <th>Sampled</th>
            <th className="w-[150px]">Score</th>
            <th>Started</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {traces.map((trace) => {
            const sampled = traceSampledAtRate(trace.id, samplingRate);
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
                  <EvaluationLayerStatusBadge status={trace.status} />
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
                <td className="max-w-[150px]">
                  <TraceScoreCell trace={trace} evaluators={state.evaluators} />
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
 * Score column cell: a one-line truncated JSON preview that never stretches
 * the table; the full per-evaluator JSON opens in a bounded popover.
 */
function TraceScoreCell({
  trace,
  evaluators,
}: {
  trace: EvaluationLayerTrace;
  evaluators: EvaluationLayerEvaluator[];
}) {
  const json = traceScoreJson(trace, evaluators);
  if (!json) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="View evaluator scores"
          className="block w-full max-w-[150px] truncate whitespace-nowrap text-left font-mono text-xs hover:underline"
        >
          {JSON.stringify(json)}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-80 w-auto max-w-sm overflow-auto p-3"
      >
        <JsonPreview value={json} />
      </PopoverContent>
    </Popover>
  );
}
