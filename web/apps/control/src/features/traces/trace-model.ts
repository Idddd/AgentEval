import type { TraceSpan, TraceSpanType, TraceStatus } from "@tasklattice/contracts";

export interface TraceRow {
  depth: number;
  hasChildren: boolean;
  span: TraceSpan;
}

export const spanTypeLabels: Record<TraceSpanType, string> = {
  workflow: "Workflow",
  agent: "Agent",
  generation: "Model call",
  tool: "Tool",
  mcp: "MCP",
  retriever: "Retrieval",
  guardrail: "Guardrail",
  external: "External",
};

export const statusLabels: Record<TraceStatus, string> = {
  ok: "Succeeded",
  error: "Failed",
  running: "Running",
};

export function formatDuration(durationMs: number): string {
  if (durationMs < 1) return `${Math.round(durationMs * 1000)}µs`;
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  if (durationMs < 10_000) return `${(durationMs / 1000).toFixed(2)}s`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0)}K`;
}

export function formatCost(costUsd: number): string {
  return costUsd < 0.01 ? `$${costUsd.toFixed(4)}` : `$${costUsd.toFixed(3)}`;
}

function spanMatches(span: TraceSpan, query: string): boolean {
  const haystack = [
    span.name,
    span.serviceName,
    span.agentName,
    span.model,
    span.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query);
}

export function buildTraceRows(
  spans: readonly TraceSpan[],
  expandedSpanIds: ReadonlySet<string>,
  search: string,
): TraceRow[] {
  const spanById = new Map(spans.map((span) => [span.spanId, span]));
  const childrenByParent = new Map<string, TraceSpan[]>();
  const roots: TraceSpan[] = [];

  for (const span of spans) {
    if (!span.parentSpanId || !spanById.has(span.parentSpanId)) {
      roots.push(span);
      continue;
    }
    const children = childrenByParent.get(span.parentSpanId) ?? [];
    children.push(span);
    childrenByParent.set(span.parentSpanId, children);
  }

  const sortByStart = (left: TraceSpan, right: TraceSpan) =>
    left.startOffsetMs - right.startOffsetMs;
  roots.sort(sortByStart);
  for (const children of childrenByParent.values()) children.sort(sortByStart);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const included = new Set<string>();
  if (normalizedSearch) {
    for (const span of spans) {
      if (!spanMatches(span, normalizedSearch)) continue;
      let current: TraceSpan | undefined = span;
      while (current) {
        included.add(current.spanId);
        current = current.parentSpanId ? spanById.get(current.parentSpanId) : undefined;
      }
    }
  }

  const rows: TraceRow[] = [];
  const visit = (span: TraceSpan, depth: number) => {
    if (normalizedSearch && !included.has(span.spanId)) return;
    const children = childrenByParent.get(span.spanId) ?? [];
    rows.push({ depth, hasChildren: children.length > 0, span });
    const expanded = normalizedSearch || expandedSpanIds.has(span.spanId);
    if (expanded) children.forEach((child) => visit(child, depth + 1));
  };
  roots.forEach((root) => visit(root, 0));
  return rows;
}
