export type EvaluationLayerTargetKind = "agent" | "mcp" | "kb" | "skill" | "guardrail";

export interface EvaluationLayerTarget {
  id: string;
  kind: EvaluationLayerTargetKind;
  name: string;
  description: string;
  /** Agent Garden catalog icon key (e.g. "briefcase", "headphones"). */
  icon?: string;
  currentRevisionId: string;
  /** Live-monitoring demo: simulated online status, mutated by tickSimulation. */
  liveStatus: "ONLINE" | "DEGRADED" | "OFFLINE";
  /** Live-monitoring demo: last simulated activity, drives list ordering. */
  lastActivityAt: string;
  createdAt: string;
}

export interface EvaluationLayerTool {
  id: string;
  name: string;
  description: string;
  connectionType: "agent" | "http" | "python";
  verificationRequired: boolean;
  enabled: boolean;
  tags: string[];
  testRequirements?: string[];
}

export interface EvaluationLayerTargetRevision {
  id: string;
  targetId: string;
  kind: EvaluationLayerTargetKind;
  revision: number;
  model?: string;
  adapter?: string;
  prompt?: string;
  endpoint?: string;
  sources?: EvaluationLayerResource[];
  version?: string;
  guardrailStages?: Array<"INPUT" | "OUTPUT" | "TOOL_CALL">;
  policyCount?: number;
  sourceStatus?: "CONNECTED" | "OFFLINE";
  tools: EvaluationLayerTool[];
  createdAt: string;
}

export interface EvaluationLayerResource {
  id: string;
  name: string;
}

export interface EvaluationLayerDatasetColumn {
  name: string;
  kind: 'input' | 'output';
  dataType: 'string' | 'number' | 'boolean' | 'json';
  required: boolean;
  description: string;
  locked?: boolean;
}

export interface EvaluationLayerCase {
  id: string;
  input: Record<string, unknown>;
  expectedOutput: Record<string, unknown>;
  tags: string[];
  source: string;
  referenceAnswer?: string;
  metadata?: Record<string, unknown>;
}

export interface EvaluationLayerDataset {
  id: string;
  targetId: string;
  name: string;
  description: string;
  currentRevisionId: string;
  createdAt: string;
  schema?: EvaluationLayerDatasetColumn[];
}

export interface EvaluationLayerDatasetRevision {
  id: string;
  datasetId: string;
  targetId: string;
  revision: number;
  status: "DRAFT" | "PUBLISHED";
  cases: EvaluationLayerCase[];
  createdAt: string;
}

/** A runnable snapshot of the test cases maintained by Guard Governance. */
export interface EvaluationLayerGuardrailTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  applicableTargetKinds: EvaluationLayerTargetKind[];
  cases: EvaluationLayerCase[];
  /** Target kinds for which the UI should preselect this template. */
  defaultFor: EvaluationLayerTargetKind[];
  /** The owning Guardrail. New packs are created and edited in Guardrails. */
  sourceGuardrailId?: string;
  /** Historical snapshots remain resolvable by reports but are not selectable. */
  available?: boolean;
  required?: boolean;
}

export interface EvaluationLayerRun {
  id: string;
  targetId: string;
  targetRevisionId: string;
  datasetId: string;
  datasetRevisionId: string;
  guardrailTemplateIds: string[];
  evaluatorIds: string[];
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";
  startedAt: string;
  completedAt?: string;
  results: EvaluationLayerRunResult[];
}

export interface EvaluationLayerRunResult {
  caseId: string;
  /** Present when this result came from a built-in Guardrail Test Pack. */
  guardrailTemplateId?: string;
  status: "PENDING" | "PASS" | "FAIL" | "ERROR";
  traceId?: string;
  response?: string;
}

export interface EvaluationLayerReport {
  id: string;
  runId: string;
  status: "READY" | "FAILED";
  summary: string;
  createdAt: string;
}

export interface EvaluationLayerRevisionDecision {
  id: string;
  reportId: string;
  targetRevisionId: string;
  status: "APPROVED" | "REJECTED";
  actor: string;
  decidedAt: string;
  reason?: string;
}

export interface EvaluationLayerReflection {
  id: string;
  reportId: string;
  targetId: string;
  suggestion: string;
  status: "OPEN" | "APPLIED" | "DISMISSED";
  createdAt: string;
}

export interface EvaluationLayerToolEvidence {
  id: string;
  toolId: string;
  requested: boolean;
  executed: boolean;
  succeeded: boolean;
  effectVerified: boolean | null;
  verificationRequired: boolean;
  requestedArguments: Record<string, unknown>;
  executedArguments: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  traceId?: string;
  observationId?: string | null;
  startedAt: string | null;
  endedAt: string | null;
  latencyMs: number | null;
  receipt: Record<string, unknown> | null;
}

export interface EvaluationLayerJudge {
  scores: Record<string, number>;
  reasons: Record<string, string>;
  summary: string;
  model: string;
  promptVersion: string;
  traceId?: string;
  observationId?: string | null;
  usageCost?: EvaluationLayerUsageCost;
}

export interface EvaluationLayerUsageCost {
  category: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  costUsd: number;
}

export interface EvaluationLayerSpan {
  id: string;
  parentSpanId?: string;
  name: string;
  kind: "TRACE" | "AGENT" | "TOOL" | "JUDGE";
  status: "OK" | "ERROR";
  startedAt: string;
  endedAt?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  metadata?: Record<string, unknown>;
  observationType?: string;
  level?: string;
  statusMessage?: string;
  model?: string;
  usageDetails?: Record<string, number>;
  costDetails?: Record<string, number>;
}

export interface EvaluationLayerTrace {
  id: string;
  runId: string;
  caseId: string;
  targetId: string;
  status: "PASS" | "FAIL" | "ERROR";
  startedAt: string;
  latencyMs?: number;
  costUsd: number;
  response: string;
  deterministicScores: Record<string, number>;
  deterministicReasons: Record<string, string>;
  toolEvidence: EvaluationLayerToolEvidence[];
  judge?: EvaluationLayerJudge;
  usageCosts?: EvaluationLayerUsageCost[];
  spans: EvaluationLayerSpan[];
  markedFailed: boolean;
}

export interface EvaluationLayerEvaluator {
  id: string;
  name: string;
  provider: "BUILT_IN" | "LANGFUSE";
  version: string;
  enabled: boolean;
  /** This evaluator's normalized pass threshold (0-100). */
  minimumScore: number;
  /** Frontend-only alert preview for failures from this evaluator. */
  sendAlert: boolean;
}

export interface EvaluationLayerSettings {
  activeTargetId: string;
  activeDatasetId: string;
  selectedRunId: string;
  showRawSpans: boolean;
  /** Trace sampling rate (0-100); what-if preview only, no data is dropped. */
  samplingRate: number;
  provider: string;
  baseUrl: string;
  model: string;
  /** In-memory form state only; fixtures never seed a credential. */
  apiKey: string;
  testOutcome: "NOT_TESTED" | "SUCCESS" | "FAILURE";
  testFingerprint?: string;
}

export interface EvaluationLayerActivityEvent {
  id: string;
  at: string;
  targetId: string;
  kind: "TRACE" | "STATUS";
  message: string;
  traceId?: string;
  status?: "PASS" | "FAIL" | "ERROR" | "ONLINE" | "DEGRADED" | "OFFLINE";
}

/**
 * Structured execution-log entry (pure frontend mock). One data source with
 * three renderings: the run terminal UI, the report audit log, and analysis.
 */
export interface EvaluationLayerLogEntry {
  id: string;
  runId: string;
  at: string;
  caseId?: string;
  actor: "agent" | "tool" | "judge" | "system";
  action:
    | "run_started"
    | "case_started"
    | "tool_requested"
    | "tool_executed"
    | "tool_blocked"
    | "judge_scored"
    | "case_completed"
    | "run_completed";
  outcome: "allowed" | "blocked" | "violation" | "error" | "info";
  detail: string;
  traceId?: string;
}

export interface EvaluationLayerState {
  targets: EvaluationLayerTarget[];
  targetRevisions: EvaluationLayerTargetRevision[];
  datasets: EvaluationLayerDataset[];
  datasetRevisions: EvaluationLayerDatasetRevision[];
  guardrailTemplates: EvaluationLayerGuardrailTemplate[];
  runs: EvaluationLayerRun[];
  reports: EvaluationLayerReport[];
  revisionDecisions: EvaluationLayerRevisionDecision[];
  reflections: EvaluationLayerReflection[];
  traces: EvaluationLayerTrace[];
  evaluators: EvaluationLayerEvaluator[];
  /** Execution logs per run, append-only, kept after the run completes. */
  logs: EvaluationLayerLogEntry[];
  /** Live-monitoring demo feed, newest first, capped by the store. */
  activity: EvaluationLayerActivityEvent[];
  settings: EvaluationLayerSettings;
}
