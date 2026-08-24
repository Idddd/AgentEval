import type {
  EvaluationLayerEvaluator,
  EvaluationLayerSpan,
  EvaluationLayerToolEvidence,
  EvaluationLayerTrace,
} from '../model';

export interface TraceRecommendation {
  title: string;
  evidence: string;
  target: string;
  change: string;
}

export interface TraceSpanRow {
  span: EvaluationLayerSpan;
  depth: number;
  isLast: boolean;
  latencyMs: number | undefined;
  leftPercent: number;
  widthPercent: number;
}

export function observationCount(trace: EvaluationLayerTrace) {
  return trace.toolEvidence.length + (trace.judge ? 1 : 0);
}

export function traceLatency(trace: EvaluationLayerTrace) {
  const values = trace.toolEvidence
    .map((item) => item.latencyMs)
    .filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : undefined;
}

export function traceCost(trace: EvaluationLayerTrace) {
  return trace.usageCosts?.length
    ? trace.usageCosts.reduce((sum, item) => sum + item.costUsd, 0)
    : trace.costUsd;
}

export function judgeAverage(trace: EvaluationLayerTrace) {
  if (!trace.judge) return undefined;
  const scores = Object.values(trace.judge.scores);
  return scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : 0;
}

/**
 * Per-evaluator scores for one trace, keyed by evaluator name, ready for JSON
 * display. An evaluator appears only if it actually scored the trace (a
 * Built-in evaluator needs deterministic scores, a Langfuse evaluator needs a
 * judge observation). Returns null when nothing scored the trace.
 */
export function traceScoreJson(
  trace: EvaluationLayerTrace,
  evaluators: EvaluationLayerEvaluator[],
): Record<string, Record<string, number>> | null {
  const scores: Record<string, Record<string, number>> = {};
  for (const evaluator of evaluators) {
    if (evaluator.provider === 'BUILT_IN') {
      if (Object.keys(trace.deterministicScores).length) {
        scores[evaluator.name] = { ...trace.deterministicScores };
      }
    } else if (trace.judge) {
      scores[evaluator.name] = { ...trace.judge.scores };
    }
  }
  return Object.keys(scores).length ? scores : null;
}

export function spanObservationType(span: EvaluationLayerSpan) {
  if (span.observationType) return span.observationType;
  return {
    TRACE: 'agent',
    AGENT: 'agent',
    TOOL: 'tool',
    JUDGE: 'evaluator',
  }[span.kind];
}

export function spanLevel(span: EvaluationLayerSpan) {
  return span.level ?? (span.status === 'ERROR' ? 'ERROR' : 'DEFAULT');
}

export function spanLatency(span: EvaluationLayerSpan) {
  if (!span.endedAt) return undefined;
  return Math.max(0, Date.parse(span.endedAt) - Date.parse(span.startedAt));
}

export function spanRows(trace: EvaluationLayerTrace): TraceSpanRow[] {
  if (!trace.spans.length) return [];
  const children = new Map<string, EvaluationLayerSpan[]>();
  const ids = new Set(trace.spans.map((span) => span.id));
  for (const span of trace.spans) {
    if (!span.parentSpanId || !ids.has(span.parentSpanId)) continue;
    children.set(span.parentSpanId, [...(children.get(span.parentSpanId) ?? []), span]);
  }
  for (const entries of children.values()) {
    entries.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  }
  const roots = trace.spans
    .filter((span) => !span.parentSpanId || !ids.has(span.parentSpanId))
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const flattened: Array<{ span: EvaluationLayerSpan; depth: number; isLast: boolean }> = [];
  const visited = new Set<string>();
  const visit = (span: EvaluationLayerSpan, depth: number, isLast: boolean) => {
    if (visited.has(span.id)) return;
    visited.add(span.id);
    flattened.push({ span, depth, isLast });
    const nested = children.get(span.id) ?? [];
    nested.forEach((child, index) => visit(child, depth + 1, index === nested.length - 1));
  };
  roots.forEach((root, index) => visit(root, 0, index === roots.length - 1));
  trace.spans.forEach((span) => {
    if (!visited.has(span.id)) visit(span, 0, true);
  });

  const starts = flattened.map(({ span }) => Date.parse(span.startedAt));
  const ends = flattened.map(({ span }) => Date.parse(span.endedAt ?? span.startedAt));
  const traceStart = Math.min(...starts);
  const traceEnd = Math.max(...ends);
  const totalMs = Math.max(traceEnd - traceStart, 0.01);
  return flattened.map(({ span, depth, isLast }) => {
    const latencyMs = spanLatency(span);
    const leftPercent = Math.max(
      0,
      Math.min(100, ((Date.parse(span.startedAt) - traceStart) / totalMs) * 100),
    );
    const widthPercent = Math.max(
      1.2,
      Math.min(100 - leftPercent, ((latencyMs ?? 0) / totalMs) * 100),
    );
    return { span, depth, isLast, latencyMs, leftPercent, widthPercent };
  });
}

export function toolEffectStatus(item: EvaluationLayerToolEvidence) {
  if (!item.verificationRequired) return 'NOT REQUIRED';
  return item.effectVerified ? 'VERIFIED' : 'UNVERIFIED';
}

export function toolPassed(item: EvaluationLayerToolEvidence) {
  return (
    item.requested &&
    item.executed &&
    item.succeeded &&
    (!item.verificationRequired || item.effectVerified === true)
  );
}

export function legacyToolEvidence(item: EvaluationLayerToolEvidence) {
  return {
    call_id: item.id,
    tool_id: item.toolId,
    requested: item.requested,
    executed: item.executed,
    succeeded: item.succeeded,
    effect_verified: item.effectVerified,
    verification_required: item.verificationRequired,
    requested_arguments: item.requestedArguments,
    executed_arguments: item.executedArguments,
    output: item.output,
    error: item.error,
    trace_id: item.traceId ?? null,
    observation_id: item.observationId ?? null,
    started_at: item.startedAt,
    ended_at: item.endedAt,
    latency_ms: item.latencyMs,
    receipt: item.receipt,
  };
}

export function legacyJudge(trace: EvaluationLayerTrace) {
  if (!trace.judge) return null;
  return {
    scores: trace.judge.scores,
    reasons: trace.judge.reasons,
    summary: trace.judge.summary,
    model: trace.judge.model,
    prompt_version: trace.judge.promptVersion,
    trace_id: trace.judge.traceId ?? null,
    observation_id: trace.judge.observationId ?? null,
    usage_cost: trace.judge.usageCost ?? null,
  };
}

export function recommendations(trace: EvaluationLayerTrace): TraceRecommendation[] {
  const suggestions: TraceRecommendation[] = [];
  for (const [name, reason] of Object.entries(trace.deterministicReasons)) {
    const score = trace.deterministicScores[name] ?? 1;
    if (score >= 1) continue;
    const normalized = `${name} ${reason}`.toLowerCase();
    if (['tool', 'execution', 'evidence'].some((token) => normalized.includes(token))) {
      suggestions.push({
        title: `Fix failed check: ${name}`,
        evidence: reason,
        target: 'Agent tool policy',
        change:
          'State when this Tool must be called, validate its required arguments before execution, and require a successful Tool receipt before the final answer.',
      });
    } else if (
      ['permission', 'safety', 'role', 'unauthor'].some((token) => normalized.includes(token))
    ) {
      suggestions.push({
        title: `Fix failed check: ${name}`,
        evidence: reason,
        target: 'Agent system prompt / guard policy',
        change:
          'Add an explicit allow/deny rule for this case, check identity and role before any sensitive action, and return a refusal without calling the Tool when denied.',
      });
    } else {
      suggestions.push({
        title: `Fix failed check: ${name}`,
        evidence: reason,
        target: 'Agent system prompt',
        change:
          'Add a decision rule covering this failed condition and include the expected behavior as a short example; rerun this case as a regression test.',
      });
    }
  }

  for (const item of trace.toolEvidence) {
    if (toolPassed(item)) continue;
    let change: string;
    if (!item.executed) {
      // A PASS trace with a blocked Tool is the expected outcome, not a
      // broken path: the permission denial was enforced by design.
      if (trace.status === "PASS") continue;
      change = `Make the trigger condition for ${item.toolId} explicit and require the Agent to call it before answering when that condition matches.`;
    } else if (!item.succeeded) {
      change = `Validate ${item.toolId} arguments against its schema, surface the Tool error to the Agent, and add a bounded retry or fallback path.`;
    } else {
      change = `Capture and validate the receipt from ${item.toolId} before claiming success; treat a missing or invalid receipt as a failed action.`;
    }
    suggestions.push({
      title: `Repair Tool path: ${item.toolId}`,
      evidence: item.error ?? `Tool evidence status is ${toolEffectStatus(item)}.`,
      target: 'Tool binding / execution policy',
      change,
    });
  }

  if (trace.judge) {
    const changes: Record<string, string> = {
      correctness:
        'Add the expected decision criteria and require the response to verify each criterion against Tool evidence.',
      relevance:
        'Instruct the Agent to answer the requested action first and remove unrelated explanation.',
      completeness:
        'Define a response checklist for required outcome, evidence, and next step before producing the final answer.',
      safety:
        'Move authorization checks before every sensitive Tool call and define an explicit safe refusal response.',
    };
    for (const [dimension, score] of Object.entries(trace.judge.scores)) {
      if (score >= 4) continue;
      suggestions.push({
        title: `Improve ${dimension} (${score}/5)`,
        evidence: trace.judge.reasons[dimension] ?? trace.judge.summary,
        target: 'Agent system prompt',
        change:
          changes[dimension] ??
          changes.correctness ??
          'Add explicit evaluation criteria to the Agent response contract.',
      });
    }
  }

  for (const span of trace.spans) {
    if (spanLevel(span) !== 'ERROR' && !span.statusMessage && !span.error) continue;
    suggestions.push({
      title: `Handle span failure: ${span.name}`,
      evidence: span.statusMessage ?? span.error ?? 'The span completed at ERROR level.',
      target: 'Runtime error handling',
      change:
        'Catch this failure at the span boundary, record a stable error code, and define whether to retry, fall back, or stop before composing the response.',
    });
  }

  if (!trace.response.trim()) {
    suggestions.push({
      title: 'Prevent empty final responses',
      evidence: 'The recorded final response is empty.',
      target: 'Agent response contract',
      change:
        'Validate the final response and emit a clear failure or fallback message when no answer was generated.',
    });
  }

  return suggestions.filter(
    (item, index) =>
      suggestions.findIndex(
        (candidate) => candidate.title === item.title && candidate.target === item.target,
      ) === index,
  );
}
