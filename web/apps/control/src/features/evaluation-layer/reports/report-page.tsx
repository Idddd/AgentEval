import { Fragment, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { FileChartColumn } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useCurrentProjectId } from "@/hooks/use-project";
import { useEffectiveProjectRole } from "@/hooks/use-project-permissions";
import { cn } from "@/lib/utils";
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

interface ToolEvidenceViewRow {
  key: string;
  traceId: string;
  toolId: string;
  requested: boolean;
  executed: boolean;
  succeeded: boolean;
  effectVerified: boolean | null;
  output: unknown;
  simulated: boolean;
}

function resultCounts(results: EvaluationLayerRunResult[]) {
  return {
    passed: results.filter((item) => item.status === "PASS").length,
    failed: results.filter(
      (item) => item.status === "FAIL" || item.status === "ERROR",
    ).length,
  };
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
      <div className={cn(
        "flex flex-wrap items-start justify-between border-b bg-muted/20",
        embedded ? "gap-2 px-3 py-2" : "gap-3 px-4 py-3",
      )}>
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
        <EvaluationTable density={embedded ? "compact" : "default"}>
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
        <div className={cn(
          "border-t border-destructive/20 bg-destructive/5",
          embedded ? "px-3 py-2" : "px-4 py-3",
        )}>
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
  const [expandedToolEvidenceKey, setExpandedToolEvidenceKey] = useState<string>();
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
  const totalCost = cost + done.length * 0.0004;
  const caseDefinitions = new Map([
    ...datasetRevision.cases,
    ...guardrailPackIds.flatMap((templateId) => (
      state.guardrailTemplates.find((item) => item.id === templateId)?.cases ?? []
    )),
  ].map((item) => [item.id, item] as const));
  const recordedToolEvidence: ToolEvidenceViewRow[] = traces.flatMap((trace) => (
    trace.toolEvidence.map((evidence) => ({
      key: evidence.id,
      traceId: trace.id,
      toolId: evidence.toolId,
      requested: evidence.requested,
      executed: evidence.executed,
      succeeded: evidence.succeeded,
      effectVerified: evidence.effectVerified,
      output: evidence.output ?? evidence.error ?? { status: "No output recorded" },
      simulated: false,
    }))
  ));
  const simulatedToolEvidence: ToolEvidenceViewRow[] = done.map((result) => {
    const definition = caseDefinitions.get(result.caseId);
    const toolId = [definition?.expectedOutput, definition?.input]
      .flatMap((record) => Object.entries(record ?? {}))
      .find(([key, value]) => key.toLowerCase().includes("tool") && typeof value === "string")?.[1]
      ?? targetRevision.tools.find((tool) => tool.enabled)?.name
      ?? `${targetLabel} invocation`;
    const response = result.response ?? "Demo invocation completed.";
    const blockedBeforeExecution = /blocked before execution|deny enforced before/i.test(response);
    const executed = result.status !== "ERROR" && !blockedBeforeExecution;
    return {
      key: `simulated-${result.caseId}`,
      traceId: result.traceId ?? `demo-${result.caseId}`,
      toolId: String(toolId),
      requested: true,
      executed,
      succeeded: executed && result.status !== "ERROR",
      effectVerified: result.status === "PASS",
      output: {
        mode: "demo",
        behavior: blockedBeforeExecution ? "blocked" : executed ? "executed" : "failed",
        response,
      },
      simulated: true,
    };
  });
  const toolEvidenceRows = recordedToolEvidence.length
    ? recordedToolEvidence
    : simulatedToolEvidence;
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
    ? "Suggestions can be applied by Developers in the standalone report."
    : decision?.status !== "REJECTED"
      ? "Developer changes become available after an Admin rejects this evaluation."
      : !isDeveloper
        ? "Developer access is required to update the Target after rejection."
        : "This rejected evaluation has already been superseded by a newer Target revision.";
  const reflectionContent = reflections.length ? (
    <div className={cn("grid", embedded ? "gap-2" : "gap-3")}>
      {reflections.map((reflection) => reflectionActionsHidden ? (
        <div
          key={reflection.id}
          className={cn("flex items-start justify-between gap-3 rounded-md border", embedded ? "p-2" : "p-4")}
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium">{reflection.suggestion}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Status: {reflection.status}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="shrink-0 bg-blue-600 text-white hover:bg-blue-700"
          >
            Action
          </Button>
        </div>
      ) : (
        <div
          key={reflection.id}
          className={cn("flex items-start rounded-md border", embedded ? "gap-2 p-2" : "gap-3 p-4")}
        >
          <label className={cn("flex min-w-0 flex-1 items-start", embedded ? "gap-2" : "gap-3")}>
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
            <span className="min-w-0">
              <span className="font-medium">{reflection.suggestion}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Status: {reflection.status}
              </span>
            </span>
          </label>
          <Button
            type="button"
            size="sm"
            className="shrink-0 bg-blue-600 text-white hover:bg-blue-700"
          >
            Action
          </Button>
        </div>
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
  ) : null;
  if (target.kind === "guardrail") {
    return (
      <div className={cn(
        "space-y-6",
        embedded && "space-y-2 [&_[data-slot=card]]:[--card-spacing:--spacing(2)] [&_[data-slot=card-description]]:text-xs [&_dl>div]:p-2! [&_pre]:max-h-48 [&_pre]:p-2 [&_td]:px-2! [&_td]:py-1! [&_th]:px-2! [&_th]:py-1!",
      )}>
        <KeyValueGrid
          {...(embedded ? { className: "sm:grid-cols-4 lg:grid-cols-4" } : {})}
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
    <div className={cn(
      "space-y-6",
      embedded && "space-y-2 [&_[data-slot=card]]:[--card-spacing:--spacing(2)] [&_[data-slot=card-description]]:text-xs [&_dl>div]:p-2! [&_pre]:max-h-48 [&_pre]:p-2 [&_td]:px-2! [&_td]:py-1! [&_th]:px-2! [&_th]:py-1!",
    )}>
      <KeyValueGrid
        {...(embedded ? { className: "sm:grid-cols-4 lg:grid-cols-4" } : {})}
        items={([
          ...(embedded ? [] : [["Report", report.id], ["Evaluation", run.id]]),
          [targetLabel, target.name],
          ["Test Case", dataset.name],
          ["Status", <EvaluationLayerStatusBadge status={report.status} />],
          ["Created", new Date(report.createdAt).toLocaleString()],
        ] as [string, ReactNode][])}
      />
      <EvaluationSection title="Summary">
        <div className={cn("grid md:grid-cols-4", embedded ? "gap-2" : "gap-4")}>
          <EvaluationMetric compact={embedded} label="Pass rate" value={formatPercent(passRate)} />
          <EvaluationMetric
            compact={embedded}
            label="Passed"
            value={done.filter((item) => item.status === "PASS").length}
          />
          <EvaluationMetric compact={embedded} label="Failed" value={failures.length} />
          <EvaluationMetric compact={embedded} label="Total cost" value={formatCost(totalCost)} />
        </div>
        <p className={cn("text-sm text-muted-foreground", embedded ? "mt-2" : "mt-4")}>{report.summary}</p>
      </EvaluationSection>
      {failures.length || reflectionContent ? (
        <div className={cn(
          "grid items-start",
          embedded ? "gap-2" : "gap-4",
          failures.length && reflectionContent && "md:grid-cols-2",
        )}>
          {failures.length ? <EvaluationSection title="Failure reasons">
          <div className={cn("grid", embedded ? "gap-2" : "gap-3")}>
            {failures.map((failure) => (
              <div
                key={failure.caseId}
                className={cn(
                  "rounded-md border border-destructive/20 bg-destructive/5",
                  embedded ? "p-2" : "p-4",
                )}
              >
                <p className="font-medium">{failure.caseId}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {failure.response}
                </p>
              </div>
            ))}
          </div>
          </EvaluationSection> : null}
          {reflectionContent ? (
            <EvaluationSection
              title="Suggestion"
              description="Evidence-backed improvements for the next Target revision."
            >
              {reflectionContent}
            </EvaluationSection>
          ) : null}
        </div>
      ) : null}
      <TestResultsBySource
        datasetName={dataset.name}
        datasetRevision={datasetRevision.revision}
        businessResults={businessResults}
        packGroups={guardrailPackGroups}
        embedded={embedded}
        projectId={projectId}
      />
      <EvaluationSection
        title="Tool Evidence"
        description="Requested, executed, succeeded, and effect-verified evidence."
      >
        <EvaluationTable density={embedded ? "compact" : "default"}>
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
            {toolEvidenceRows.map((evidence) => {
              const expanded = expandedToolEvidenceKey === evidence.key;

              return (
                <Fragment key={evidence.key}>
                  <tr>
                  <td>
                    <div className="flex items-center gap-2">
                      <span>{evidence.traceId}</span>
                      {evidence.simulated ? (
                        <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 dark:text-cyan-300">
                          Demo
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td>{evidence.toolId}</td>
                  <td>{evidence.requested ? "Yes" : "No"}</td>
                  <td>{evidence.executed ? "Yes" : "No"}</td>
                  <td>{evidence.succeeded ? "Yes" : "No"}</td>
                  <td>
                    {evidence.effectVerified === null
                      ? "Not available"
                      : evidence.effectVerified ? "Yes" : "No"}
                  </td>
                  <td>
                    <Button
                      type="button"
                      size="xs"
                      className="bg-blue-600 text-white hover:bg-blue-700"
                      aria-label={`${expanded ? "Hide output" : "View output"} for ${evidence.traceId}`}
                      aria-expanded={expanded}
                      onClick={() => setExpandedToolEvidenceKey(expanded ? undefined : evidence.key)}
                    >
                      {expanded ? "Hide output" : "View output"}
                      <span className="sr-only">{" "}for {evidence.traceId}</span>
                    </Button>
                  </td>
                  </tr>
                  {expanded ? (
                    <tr>
                      <td colSpan={7} className="bg-muted/20 p-3">
                        <JsonPreview value={evidence.output} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </EvaluationTable>
      </EvaluationSection>
      <EvaluationSection
        title="LLM Judge"
        description="Recorded Langfuse-compatible judge evidence; no live model request is made."
      >
        <div className={cn("grid md:grid-cols-2", embedded ? "gap-2" : "gap-4")}>
          {traces.map((trace) => (
            <div key={trace.id} className={cn("rounded-md border", embedded ? "p-2" : "p-4")}>
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
      <EvaluationSection title="Usage & Cost">
        <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total cost</span>
          <span className="flex items-center gap-2">
            <strong className="text-sm">{formatCost(totalCost)}</strong>
            <span className="text-xs text-muted-foreground">USD</span>
          </span>
        </div>
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
    </div>
  );
}
