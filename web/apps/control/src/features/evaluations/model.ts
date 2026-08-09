export type EvaluationStatus =
  | "DRAFT"
  | "QUEUED"
  | "RUNNING"
  | "PASS"
  | "FAIL";
export type WorkflowStage =
  | "setup"
  | "evaluate"
  | "report"
  | "reflect"
  | "complete";
export type CaseStatus = "PENDING" | "RUNNING" | "PASS" | "FAIL" | "BLOCKED";
export type ReflectionStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "SUBMITTED"
  | "NO_CHANGES";

export interface TargetRecord {
  id: string;
  name: string;
  description: string;
  currentRevisionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TargetRevision {
  id: string;
  targetId: string;
  revision: number;
  model: { id: string; name: string };
  systemPrompt: string;
  tools: string[];
  mcpServers: string[];
  knowledgeBases: string[];
  createdAt: string;
}

export interface DatasetCase {
  id: string;
  input: { query: string; headers?: Record<string, string> };
  expected: {
    outcome: "ALLOW" | "DENY";
    tool?: string;
    reason: string;
  };
  source: "MANUAL" | "IMPORTED" | "GENERATED";
}

export interface DatasetRecord {
  id: string;
  targetId: string;
  name: string;
  description: string;
  currentRevisionId?: string;
  draftCases: DatasetCase[];
  updatedAt: string;
}

export interface DatasetRevision {
  id: string;
  datasetId: string;
  revision: number;
  schema: Array<{
    name: string;
    role: "INPUT" | "EXPECTED";
    type: "STRING" | "JSON";
  }>;
  cases: DatasetCase[];
  createdAt: string;
}

export interface ToolEvidence {
  tool: string;
  requested: boolean;
  allowed: boolean;
  called: boolean;
}

export interface CaseResult {
  caseId: string;
  status: CaseStatus;
  actualOutcome?: "ALLOW" | "DENY";
  reason?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  toolEvidence?: ToolEvidence[];
  judge?: { score: number; rationale: string };
}

export interface EvaluationRun {
  id: string;
  targetId: string;
  targetRevisionId: string;
  datasetRevisionId: string;
  status: EvaluationStatus;
  stage: WorkflowStage;
  results: CaseResult[];
  reportId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ReportRecord {
  id: string;
  runId: string;
  targetId: string;
  status: "PASS" | "FAIL";
  metrics: {
    passRate: number;
    passed: number;
    failed: number;
    blocked: number;
  };
  costs: { agent: number; judge: number; evaluationTotal: number };
  createdAt: string;
}

export interface ReflectionSuggestion {
  id: string;
  reportId: string;
  area: "SYSTEM_PROMPT" | "TOOLS" | "MCP" | "KNOWLEDGE";
  evidence: string;
  current: string;
  suggested: string;
}

export interface ReflectionRecord {
  id: string;
  reportId: string;
  status: ReflectionStatus;
  suggestions: ReflectionSuggestion[];
  acceptedSuggestionIds: string[];
  resultingTargetRevisionId?: string;
}

export interface EvaluationState {
  targets: TargetRecord[];
  targetRevisions: TargetRevision[];
  datasets: DatasetRecord[];
  datasetRevisions: DatasetRevision[];
  runs: EvaluationRun[];
  reports: ReportRecord[];
  reflections: ReflectionRecord[];
}
