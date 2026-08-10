import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { FileChartColumn } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useCurrentProjectId } from "@/hooks/use-project";
import {
  useEvaluationLayerState,
  useEvaluationLayerStore,
} from "../mock-provider";
import { EvaluationLayerStatusBadge } from "../shared/evaluation-status";
import {
  EvaluationMetric,
  EvaluationSection,
  EvaluationTable,
  JsonPreview,
  KeyValueGrid,
  formatCost,
  formatPercent,
} from "../shared/evaluation-ui";
import { GuardrailReport } from "./guardrail-report";

export function EvaluationReportDetail({ reportId, embedded = false }: { reportId: string; embedded?: boolean }) {
  const state = useEvaluationLayerState();
  const store = useEvaluationLayerStore();
  const projectId = useCurrentProjectId();
  const report = state.reports.find((item) => item.id === reportId);
  const [selected, setSelected] = useState<string[]>(() =>
    state.reflections
      .filter((item) => item.reportId === reportId && item.status === "OPEN")
      .map((item) => item.id),
  );
  if (!report)
    return (
      <EmptyState
        icon={FileChartColumn}
        title="Report not found"
        description="This immutable mock Report does not exist."
        action={
          <Button asChild variant="outline">
            <Link to="/$projectId/evaluation/runs" params={{ projectId }}>
              Back to Evaluation
            </Link>
          </Button>
        }
      />
    );
  const run = state.runs.find((item) => item.id === report.runId)!;
  const target = state.targets.find((item) => item.id === run.targetId)!;
  const dataset = state.datasets.find((item) => item.id === run.datasetId)!;
  const targetRevision = state.targetRevisions.find(
    (item) => item.id === run.targetRevisionId,
  )!;
  const datasetRevision = state.datasetRevisions.find(
    (item) => item.id === run.datasetRevisionId,
  )!;
  const traces = state.traces.filter((item) => item.runId === run.id);
  const done = run.results.filter((item) => item.status !== "PENDING");
  const failures = done.filter(
    (item) => item.status === "FAIL" || item.status === "ERROR",
  );
  const passRate = done.length
    ? done.filter((item) => item.status === "PASS").length / done.length
    : 0;
  const cost = traces.reduce((sum, trace) => sum + trace.costUsd, 0);
  const baseline = state.reports.find((item) => item.id !== report.id);
  const baselineRun = baseline
    ? state.runs.find((item) => item.id === baseline.runId)
    : undefined;
  const baselineDone =
    baselineRun?.results.filter((item) => item.status !== "PENDING") ?? [];
  const baselinePass = baselineDone.length
    ? baselineDone.filter((item) => item.status === "PASS").length /
      baselineDone.length
    : 0;
  const reflections = state.reflections.filter(
    (item) => item.reportId === report.id,
  );
  if (target.kind === "guardrail") {
    const approval = state.guardrailApprovals.find(
      (item) => item.reportId === report.id,
    );
    return (
      <div className="space-y-6">
        <KeyValueGrid
          items={([
            ...(embedded ? [] : [["Report", report.id], ["Evaluation", run.id]]),
            ["Guardrail", target.name],
            ["Test Case", dataset.name],
            ["Status", <EvaluationLayerStatusBadge status={report.status} />],
            ["Created", new Date(report.createdAt).toLocaleString()],
          ] as [string, ReactNode][])}
        />
        <GuardrailReport
          cases={datasetRevision.cases}
          results={run.results}
          traces={traces}
          revisionLabel={`R${targetRevision.revision} · v${targetRevision.version ?? "—"}`}
          approval={approval}
          onDecision={(status) => store.decideGuardrailApproval(report.id, status)}
        />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <KeyValueGrid
        items={([
          ...(embedded ? [] : [["Report", report.id], ["Evaluation", run.id]]),
          ["Agent", target.name],
          ["Test Case", dataset.name],
          ["Status", <EvaluationLayerStatusBadge status={report.status} />],
          ["Created", new Date(report.createdAt).toLocaleString()],
        ] as [string, ReactNode][])}
      />
      <EvaluationSection title="Summary">
        <div className="grid gap-4 md:grid-cols-4">
          <EvaluationMetric label="Pass rate" value={formatPercent(passRate)} />
          <EvaluationMetric
            label="Passed"
            value={done.filter((item) => item.status === "PASS").length}
          />
          <EvaluationMetric label="Failed" value={failures.length} />
          <EvaluationMetric label="Total cost" value={formatCost(cost)} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{report.summary}</p>
      </EvaluationSection>
      <EvaluationSection title="Test Results">
        <EvaluationTable>
          <thead>
            <tr>
              <th>Case</th>
              <th>Status</th>
              <th>Response</th>
              <th>Trace</th>
            </tr>
          </thead>
          <tbody>
            {done.map((result) => (
              <tr key={result.caseId}>
                <td>{result.caseId}</td>
                <td>
                  <EvaluationLayerStatusBadge status={result.status} />
                </td>
                <td>{result.response}</td>
                <td>
                  {result.traceId && !embedded ? (
                    <Link
                      className="font-mono text-xs hover:underline"
                      to="/$projectId/evaluation/traces/$traceId"
                      params={{ projectId, traceId: result.traceId }}
                    >
                      {result.traceId}
                    </Link>
                  ) : result.traceId ? "Available" : "Not available"}
                </td>
              </tr>
            ))}
          </tbody>
        </EvaluationTable>
      </EvaluationSection>
      <EvaluationSection title="Failure reasons">
        {failures.length ? (
          <div className="grid gap-3">
            {failures.map((failure) => (
              <div
                key={failure.caseId}
                className="rounded-md border border-destructive/20 bg-destructive/5 p-4"
              >
                <p className="font-medium">{failure.caseId}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {failure.response}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No failed Cases.</p>
        )}
      </EvaluationSection>
      <EvaluationSection
        title="Tool Evidence"
        description="Requested, executed, succeeded, and effect-verified evidence."
      >
        <EvaluationTable>
          <thead>
            <tr>
              <th>Trace</th>
              <th>Tool</th>
              <th>Requested</th>
              <th>Executed</th>
              <th>Succeeded</th>
              <th>Effect verified</th>
              <th>Output</th>
            </tr>
          </thead>
          <tbody>
            {traces.flatMap((trace) =>
              trace.toolEvidence.map((evidence) => (
                <tr key={evidence.id}>
                  <td>{trace.id}</td>
                  <td>{evidence.toolId}</td>
                  <td>{String(evidence.requested)}</td>
                  <td>{String(evidence.executed)}</td>
                  <td>{String(evidence.succeeded)}</td>
                  <td>
                    {evidence.effectVerified === null
                      ? "Not available"
                      : String(evidence.effectVerified)}
                  </td>
                  <td>
                    <JsonPreview value={evidence.output} />
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </EvaluationTable>
      </EvaluationSection>
      <EvaluationSection
        title="LLM Judge"
        description="Recorded Langfuse-compatible judge evidence; no live model request is made."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {traces.map((trace) => (
            <div key={trace.id} className="rounded-md border p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{trace.caseId}</p>
                <span className="text-xs text-muted-foreground">
                  {trace.judge?.model ?? "Not available"}
                </span>
              </div>
              {trace.judge ? (
                <>
                  <KeyValueGrid
                    className="mt-3 sm:grid-cols-2 lg:grid-cols-2"
                    items={Object.entries(trace.judge.scores)}
                  />
                  <p className="mt-3 text-sm text-muted-foreground">
                    {trace.judge.summary}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Not available
                </p>
              )}
            </div>
          ))}
        </div>
      </EvaluationSection>
      <EvaluationSection
        title="Comparison"
        description="Compare shared Cases, regressions, resolved failures, configuration, and cost."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <EvaluationMetric
            label="Baseline"
            value={baseline?.id ?? "Not available"}
          />
          <EvaluationMetric
            label="Pass-rate delta"
            value={`${Math.round((passRate - baselinePass) * 100)} pp`}
          />
          <EvaluationMetric
            label="Cost delta"
            value={formatCost(
              cost -
                (baselineRun
                  ? state.traces
                      .filter((trace) => trace.runId === baselineRun.id)
                      .reduce((sum, trace) => sum + trace.costUsd, 0)
                  : 0),
            )}
          />
        </div>
        <KeyValueGrid
          className="mt-4"
          items={[
            ["Regressions", failures.length],
            [
              "Resolved failures",
              Math.max(
                0,
                baselineDone.filter((item) => item.status !== "PASS").length -
                  failures.length,
              ),
            ],
            [
              "Unchanged failures",
              failures.filter((item) =>
                baselineDone.some(
                  (base) =>
                    base.caseId === item.caseId && base.status !== "PASS",
                ),
              ).length,
            ],
            [
              "Added Cases",
              done.filter(
                (item) =>
                  !baselineDone.some((base) => base.caseId === item.caseId),
              ).length,
            ],
            [
              "Removed Cases",
              baselineDone.filter(
                (item) =>
                  !done.some((current) => current.caseId === item.caseId),
              ).length,
            ],
            [
              "Configuration diff",
              run.targetRevisionId === baselineRun?.targetRevisionId
                ? "No change"
                : `${baselineRun?.targetRevisionId ?? "—"} → ${run.targetRevisionId}`,
            ],
          ]}
        />
      </EvaluationSection>
      <EvaluationSection title="Usage & Cost">
        <KeyValueGrid
          items={[
            ["Agent", formatCost(cost)],
            ["Judge", formatCost(done.length * 0.0004)],
            ["Evaluation total", formatCost(cost + done.length * 0.0004)],
            [
              "Average / Case",
              formatCost(done.length ? cost / done.length : 0),
            ],
            ["Trace count", traces.length],
            ["Currency", "USD"],
          ]}
        />
      </EvaluationSection>
      <EvaluationSection
        title="Reflection"
        description="Select evidence-backed improvements and create one immutable Agent revision."
      >
        {reflections.length ? (
          <div className="grid gap-3">
            {reflections.map((reflection) => (
              <label
                key={reflection.id}
                className="flex items-start gap-3 rounded-md border p-4"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={reflection.status !== "OPEN"}
                  checked={selected.includes(reflection.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, reflection.id]
                        : current.filter((id) => id !== reflection.id),
                    )
                  }
                />
                <span>
                  <span className="font-medium">{reflection.suggestion}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Status: {reflection.status}
                  </span>
                </span>
              </label>
            ))}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => store.finishReflectionWithoutChanges(report.id)}
              >
                Finish without changes
              </Button>
              <Button
                disabled={!selected.length}
                onClick={() => store.submitReflection(report.id, selected)}
              >
                Apply selected changes
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No Reflection suggestions are available.
          </p>
        )}
      </EvaluationSection>
    </div>
  );
}
