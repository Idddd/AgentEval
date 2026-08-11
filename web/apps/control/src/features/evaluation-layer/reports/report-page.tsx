import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { FileChartColumn } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useCurrentProjectId } from "@/hooks/use-project";
import { useEffectiveProjectRole } from "@/hooks/use-project-permissions";
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
import {
  RevisionDecisionSection,
  type RevisionDecisionMode,
} from "./revision-decision";
import type { EvaluationLayerRunResult } from "../model";

interface GuardrailPackResultGroup {
  id: string;
  name: string;
  version: string;
  results: EvaluationLayerRunResult[];
}

function resultCounts(results: EvaluationLayerRunResult[]) {
  return {
    passed: results.filter((item) => item.status === "PASS").length,
    failed: results.filter(
      (item) => item.status === "FAIL" || item.status === "ERROR",
    ).length,
  };
}

function ResultSourceSummary({
  businessResults,
  packGroups,
}: {
  businessResults: EvaluationLayerRunResult[];
  packGroups: GuardrailPackResultGroup[];
}) {
  const business = resultCounts(businessResults);
  const guardrail = resultCounts(
    packGroups.flatMap((group) => group.results),
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border bg-muted/20 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Business Dataset results
        </p>
        <p className="mt-1 text-sm font-medium">
          {business.passed} passed · {business.failed} failed
        </p>
      </div>
      <div className="rounded-md border bg-muted/20 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Guardrail Test Pack results
        </p>
        <p className="mt-1 text-sm font-medium">
          {guardrail.passed} passed · {guardrail.failed} failed · {packGroups.length}{" "}
          {packGroups.length === 1 ? "pack" : "packs"}
        </p>
      </div>
    </div>
  );
}

function ResultGroup({
  eyebrow,
  name,
  version,
  results,
  embedded,
  projectId,
  showFailedCases = false,
}: {
  eyebrow: string;
  name: string;
  version: string;
  results: EvaluationLayerRunResult[];
  embedded: boolean;
  projectId: string;
  showFailedCases?: boolean;
}) {
  const counts = resultCounts(results);
  const failed = results.filter(
    (item) => item.status === "FAIL" || item.status === "ERROR",
  );
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
          <p className="mt-1 font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{version}</p>
        </div>
        <div className="text-right text-sm">
          <p>{counts.passed} passed · {counts.failed} failed</p>
          <p className="text-xs text-muted-foreground">
            {results.length} evaluated {results.length === 1 ? "case" : "cases"}
          </p>
        </div>
      </div>
      {results.length ? (
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
            {results.map((result) => (
              <tr key={`${eyebrow}-${result.caseId}`}>
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
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          No completed results.
        </p>
      )}
      {showFailedCases && failed.length ? (
        <div className="border-t border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-destructive">
            Failed cases
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {failed.map((result) => (
              <li key={`failed-${eyebrow}-${result.caseId}`}>
                <span className="font-medium">{result.caseId}</span>
                {result.response ? ` — ${result.response}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function TestResultsBySource({
  datasetName,
  datasetRevision,
  businessResults,
  packGroups,
  embedded,
  projectId,
}: {
  datasetName: string;
  datasetRevision: number;
  businessResults: EvaluationLayerRunResult[];
  packGroups: GuardrailPackResultGroup[];
  embedded: boolean;
  projectId: string;
}) {
  return (
    <EvaluationSection
      title="Test Results"
      description="Business Dataset and required Guardrail Test Pack evidence are shown separately."
    >
      <div className="space-y-4">
        <ResultGroup
          eyebrow="Business Dataset"
          name={datasetName}
          version={`Published R${datasetRevision}`}
          results={businessResults}
          embedded={embedded}
          projectId={projectId}
        />
        {packGroups.map((group) => (
          <ResultGroup
            key={group.id}
            eyebrow="Guardrail Test Pack"
            name={group.name}
            version={group.version}
            results={group.results}
            embedded={embedded}
            projectId={projectId}
            showFailedCases
          />
        ))}
      </div>
    </EvaluationSection>
  );
}

export function EvaluationReportDetail({
  reportId,
  embedded = false,
  decisionMode = "inline",
}: {
  reportId: string;
  embedded?: boolean;
  decisionMode?: RevisionDecisionMode;
}) {
  const state = useEvaluationLayerState();
  const store = useEvaluationLayerStore();
  const projectId = useCurrentProjectId();
  const role = useEffectiveProjectRole();
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
  const businessResults = done.filter((item) => !item.guardrailTemplateId);
  const guardrailPackIds = Array.from(
    new Set([
      ...run.guardrailTemplateIds,
      ...done.flatMap((item) =>
        item.guardrailTemplateId ? [item.guardrailTemplateId] : [],
      ),
    ]),
  );
  const guardrailPackGroups: GuardrailPackResultGroup[] = guardrailPackIds.map(
    (templateId) => {
      const template = state.guardrailTemplates.find(
        (item) => item.id === templateId,
      );
      return {
        id: templateId,
        name: template?.name ?? templateId,
        version: template?.version ?? "Version unavailable",
        results: done.filter(
          (item) => item.guardrailTemplateId === templateId,
        ),
      };
    },
  );
  const failures = done.filter(
    (item) => item.status === "FAIL" || item.status === "ERROR",
  );
  const decision = state.revisionDecisions.find(
    (item) => item.reportId === report.id,
  );
  const allPassed =
    run.status === "COMPLETED" &&
    report.status === "READY" &&
    run.results.length > 0 &&
    run.results.every((item) => item.status === "PASS");
  const recommendation = allPassed ? "APPROVED" as const : "REJECTED" as const;
  const revisionLabel = `${target.name} R${targetRevision.revision}`;
  const latestPublishedDatasetRevision = state.datasetRevisions
    .filter(
      (item) => item.datasetId === run.datasetId && item.status === "PUBLISHED",
    )
    .sort(
      (left, right) =>
        right.revision - left.revision ||
        right.createdAt.localeCompare(left.createdAt) ||
        right.id.localeCompare(left.id),
    )[0];
  const decisionBlockedReason = decision
    ? undefined
    : target.currentRevisionId !== run.targetRevisionId
      ? "This report belongs to an outdated Target revision and cannot be decided."
      : latestPublishedDatasetRevision?.id !== run.datasetRevisionId
        ? "This report belongs to an outdated Dataset revision and cannot be decided."
        : !["COMPLETED", "PARTIAL", "FAILED"].includes(run.status) ||
            run.results.some((item) => item.status === "PENDING")
          ? "Only a finished evaluation can be decided."
          : undefined;
  const targetLabel = target.kind === "agent"
    ? "Agent"
    : target.kind === "skill"
      ? "Skill"
      : target.kind === "mcp"
        ? "MCP Server"
        : "Knowledge Base";
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
  const isDeveloper = role === "member";
  const reflectionActionsHidden = decisionMode === "hidden";
  const canApplyReflection =
    !reflectionActionsHidden &&
    isDeveloper &&
    decision?.status === "REJECTED" &&
    target.currentRevisionId === run.targetRevisionId;
  const reflectionUnavailableMessage = reflectionActionsHidden
    ? "Reflection changes are available to Developers in the standalone report."
    : decision?.status !== "REJECTED"
      ? "Developer changes become available after an Admin rejects this evaluation."
      : !isDeveloper
        ? "Developer access is required to update the Target after rejection."
        : "This rejected evaluation has already been superseded by a newer Target revision.";
  if (target.kind === "guardrail") {
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
        <EvaluationSection title="Summary">
          <ResultSourceSummary
            businessResults={businessResults}
            packGroups={guardrailPackGroups}
          />
        </EvaluationSection>
        <GuardrailReport
          cases={datasetRevision.cases}
          results={businessResults}
          traces={traces}
        />
        <TestResultsBySource
          datasetName={dataset.name}
          datasetRevision={datasetRevision.revision}
          businessResults={businessResults}
          packGroups={guardrailPackGroups}
          embedded={embedded}
          projectId={projectId}
        />
        <RevisionDecisionSection
          decision={decision}
          recommendation={recommendation}
          revisionLabel={revisionLabel}
          canDecide={role === "admin"}
          blockedReason={decisionBlockedReason}
          mode={decisionMode}
          onDecision={(status) => store.decideRevision(report.id, status, {
            name: role === "admin" ? "Local Administrator" : role,
            role,
          })}
        />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <KeyValueGrid
        items={([
          ...(embedded ? [] : [["Report", report.id], ["Evaluation", run.id]]),
          [targetLabel, target.name],
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
        <div className="mt-4">
          <ResultSourceSummary
            businessResults={businessResults}
            packGroups={guardrailPackGroups}
          />
        </div>
      </EvaluationSection>
      <TestResultsBySource
        datasetName={dataset.name}
        datasetRevision={datasetRevision.revision}
        businessResults={businessResults}
        packGroups={guardrailPackGroups}
        embedded={embedded}
        projectId={projectId}
      />
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
      <RevisionDecisionSection
        decision={decision}
        recommendation={recommendation}
        revisionLabel={revisionLabel}
        canDecide={role === "admin"}
        blockedReason={decisionBlockedReason}
        mode={decisionMode}
        onDecision={(status) => store.decideRevision(report.id, status, {
          name: role === "admin" ? "Local Administrator" : role,
          role,
        })}
      />
      <EvaluationSection
        title="Reflection"
        description="After rejection, select evidence-backed improvements and create one immutable Target revision."
      >
        {reflections.length ? (
          <div className="grid gap-3">
            {reflections.map((reflection) => reflectionActionsHidden ? (
              <div
                key={reflection.id}
                className="rounded-md border p-4"
              >
                <p className="font-medium">{reflection.suggestion}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Status: {reflection.status}
                </p>
              </div>
            ) : (
              <label
                key={reflection.id}
                className="flex items-start gap-3 rounded-md border p-4"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={reflection.status !== "OPEN" || !canApplyReflection}
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
            {canApplyReflection ? (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => store.finishReflectionWithoutChanges(report.id, {
                    name: role === "member" ? "Developer" : role,
                    role,
                  })}
                >
                  Finish without changes
                </Button>
                <Button
                  disabled={!selected.length}
                  onClick={() => store.submitReflection(report.id, selected, {
                    name: role === "member" ? "Developer" : role,
                    role,
                  })}
                >
                  Apply selected changes
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {reflectionUnavailableMessage}
              </p>
            )}
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
