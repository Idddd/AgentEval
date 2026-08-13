import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useEvaluationLayerState } from "../mock-provider";
import type { EvaluationLayerTrace } from "../model";
import { EvaluationLayerStatusBadge } from "../shared/evaluation-status";
import { EvaluationMetric, EvaluationSection, EvaluationTable } from "../shared/evaluation-ui";

type RiskKind = "PROMPT_INJECTION" | "DATA_LEAK" | "UNSAFE_TOOL" | "EXECUTION_ERROR";
type BehaviorFilter = "ALL" | RiskKind;

const RISK_AGENT_ID = "demo-risk-agent";

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

function riskKind(trace: EvaluationLayerTrace): RiskKind | null {
  const evidence = `${trace.caseId} ${trace.response} ${trace.judge?.summary ?? ""}`;
  if (/prompt.injection|jailbreak|system policy|hidden instructions/i.test(evidence)) return "PROMPT_INJECTION";
  if (/pii|data.exfiltration|sensitive.*(?:data|customer)|leak|redaction/i.test(evidence)) return "DATA_LEAK";
  if (/unsafe.*tool|privileged tool|tool.*despite|destructive.tool/i.test(evidence)) return "UNSAFE_TOOL";
  if (trace.status === "ERROR" || /timeout|failed open|connection failed/i.test(evidence)) return "EXECUTION_ERROR";
  return null;
}

const riskLabels: Record<RiskKind, string> = {
  PROMPT_INJECTION: "Prompt injection",
  DATA_LEAK: "Sensitive data leak",
  UNSAFE_TOOL: "Unsafe tool calls",
  EXECUTION_ERROR: "Execution errors",
};

export function BehaviorPage() {
  const state = useEvaluationLayerState();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BehaviorFilter>("ALL");
  const allTraces = useMemo(() => [...RISK_AGENT_TRACES, ...state.traces], [state.traces]);
  const targetById = useMemo(() => {
    const targets = new Map(state.targets.map((target) => [target.id, target] as const));
    targets.set(RISK_AGENT_ID, {
      id: RISK_AGENT_ID,
      kind: "agent",
      name: "Risk Agent",
      description: "Intentionally unsafe mock agent used to demonstrate risk detection.",
      currentRevisionId: "risk-agent-r1",
      liveStatus: "DEGRADED",
      lastActivityAt: "2026-08-13T09:30:04.000Z",
      createdAt: "2026-08-13T09:00:00.000Z",
    });
    return targets;
  }, [state.targets]);
  const runById = useMemo(() => new Map(state.runs.map((run) => [run.id, run] as const)), [state.runs]);
  const revisionById = useMemo(() => new Map(state.targetRevisions.map((revision) => [revision.id, revision] as const)), [state.targetRevisions]);

  const filteredTraces = allTraces.filter((trace) => {
    const target = targetById.get(trace.targetId);
    const text = `${trace.caseId} ${trace.response} ${target?.name ?? ""}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (filter !== "ALL") return riskKind(trace) === filter;
    return true;
  });

  const riskCounts = (Object.keys(riskLabels) as RiskKind[]).reduce<Record<RiskKind, number>>(
    (counts, kind) => ({ ...counts, [kind]: allTraces.filter((trace) => riskKind(trace) === kind).length }),
    { PROMPT_INJECTION: 0, DATA_LEAK: 0, UNSAFE_TOOL: 0, EXECUTION_ERROR: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(riskLabels) as RiskKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={filter === kind}
            className="rounded-lg text-left outline-none transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-destructive/50"
            onClick={() => setFilter((current) => current === kind ? "ALL" : kind)}
          >
            <EvaluationMetric
              compact
              className={filter === kind ? "border-destructive bg-destructive/10 ring-2 ring-destructive/20" : "border-destructive/35 bg-destructive/5"}
              label={riskLabels[kind]}
              value={riskCounts[kind]}
              detail={kind === "PROMPT_INJECTION" ? "Instruction override or jailbreak" : kind === "DATA_LEAK" ? "PII or confidential output exposure" : kind === "UNSAFE_TOOL" ? "Denied or privileged tool execution" : "Timeouts and fail-open execution"}
            />
          </button>
        ))}
      </div>

      <EvaluationSection
        title="Model call history"
        description="Inspect dangerous model behavior, policy failures, and execution errors. Risk Agent is an intentionally failing mock example."
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input aria-label="Search model calls" className="h-9 w-60 pl-8" placeholder="Search calls or targets" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
          </div>
        )}
      >
        <EvaluationTable density="compact">
          <thead><tr><th>Time</th><th>Target</th><th>Case / call</th><th>Model</th><th>Status</th><th>Behavior</th><th>Risk type</th></tr></thead>
          <tbody>
            {filteredTraces.map((trace) => {
              const target = targetById.get(trace.targetId);
              const run = runById.get(trace.runId);
              const revision = run ? revisionById.get(run.targetRevisionId) : undefined;
              const kind = riskKind(trace);
              return (
                <tr key={trace.id} className={trace.targetId === RISK_AGENT_ID ? "bg-destructive/5" : undefined}>
                  <td>{new Date(trace.startedAt).toLocaleString()}</td>
                  <td><p className="font-medium">{target?.name ?? trace.targetId}</p><p className="text-[11px] text-muted-foreground">{target?.kind ?? "Target"}</p></td>
                  <td><p className="max-w-56 truncate font-medium" title={trace.caseId}>{trace.caseId}</p><p className="max-w-56 truncate text-[11px] text-muted-foreground" title={trace.response}>{trace.response}</p></td>
                  <td>{trace.targetId === RISK_AGENT_ID ? "Risk behavior simulator" : revision?.model ?? revision?.version ?? "Recorded demo"}</td>
                  <td><EvaluationLayerStatusBadge status={trace.status} /></td>
                  <td>{traceIsFlagged(trace) ? <Badge variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive">Flagged</Badge> : <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">Clear</Badge>}</td>
                  <td>{kind ? <Badge variant="outline" className="border-destructive/30 text-destructive">{riskLabels[kind]}</Badge> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </EvaluationTable>
        {!filteredTraces.length ? <p className="py-8 text-center text-sm text-muted-foreground">No model calls match these filters.</p> : null}
      </EvaluationSection>
    </div>
  );
}
