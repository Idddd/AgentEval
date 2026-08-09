export const traceStatuses = ["ok", "error", "running"] as const;
export type TraceStatus = (typeof traceStatuses)[number];

export const traceSpanTypes = [
  "workflow",
  "agent",
  "generation",
  "tool",
  "mcp",
  "retriever",
  "guardrail",
  "external",
] as const;
export type TraceSpanType = (typeof traceSpanTypes)[number];

export type TraceAttributeValue =
  | boolean
  | number
  | string
  | null
  | TraceAttributeValue[]
  | { [key: string]: TraceAttributeValue };

export interface TraceScore {
  name: string;
  value: boolean | number | string;
  source: "evaluator" | "human" | "user";
}

export interface TraceEvent {
  name: string;
  offsetMs: number;
  severity: "info" | "warning" | "error";
  attributes?: Record<string, TraceAttributeValue>;
}

export interface TraceLink {
  traceId: string;
  spanId: string;
  relationship: string;
}

export interface TraceTokenUsage {
  input: number;
  output: number;
}

export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  type: TraceSpanType;
  serviceName: string;
  agentName?: string;
  startOffsetMs: number;
  durationMs: number;
  status: TraceStatus;
  model?: string;
  tokenUsage?: TraceTokenUsage;
  costUsd?: number;
  input?: TraceAttributeValue;
  output?: TraceAttributeValue;
  attributes: Record<string, TraceAttributeValue>;
  events?: TraceEvent[];
  links?: TraceLink[];
}

export interface TraceSummary {
  traceId: string;
  flowId?: string;
  title: string;
  rootAgentName: string;
  startTime: string;
  durationMs: number;
  status: TraceStatus;
  spanCount: number;
  agentCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  coveragePercent: number;
  scores: TraceScore[];
}

export interface TraceDetail extends TraceSummary {
  source: "fixture" | "otel";
  spans: TraceSpan[];
}

export interface TraceListResponse {
  data: TraceSummary[];
  source: "fixture" | "otel";
}
