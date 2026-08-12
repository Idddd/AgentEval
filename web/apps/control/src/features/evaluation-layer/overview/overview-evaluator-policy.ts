import type {
  EvaluationLayerEvaluator,
  EvaluationLayerTrace,
} from "../model";

export type TraceEvaluatorDetail = {
  evaluatorId: string;
  evaluatorName: string;
  normalizedScore: number | null;
  passed: boolean | null;
  rawScores: Record<string, number> | null;
};

export type TraceEvaluatorSummary = {
  passed: number;
  evaluated: number;
  totalEnabled: number;
  allPassed: boolean;
  evaluatedAny: boolean;
  details: TraceEvaluatorDetail[];
};

function normalizedAverage(values: number[], scale: 1 | 5) {
  if (!values.length) return null;
  const normalized = values.map((value) =>
    Math.min(100, Math.max(0, scale === 1 ? value * 100 : value * 20)),
  );
  return normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
}

function evaluatorScores(
  trace: EvaluationLayerTrace,
  evaluator: EvaluationLayerEvaluator,
) {
  if (evaluator.provider === "BUILT_IN") {
    return trace.deterministicScores;
  }
  return trace.judge?.scores ?? null;
}

export function traceEvaluatorSummary(
  trace: EvaluationLayerTrace,
  evaluators: EvaluationLayerEvaluator[],
  threshold: number,
): TraceEvaluatorSummary {
  const details = evaluators
    .filter((evaluator) => evaluator.enabled)
    .map((evaluator): TraceEvaluatorDetail => {
      const rawScores = evaluatorScores(trace, evaluator);
      const average = rawScores
        ? normalizedAverage(
            Object.values(rawScores),
            evaluator.provider === "BUILT_IN" ? 1 : 5,
          )
        : null;
      return {
        evaluatorId: evaluator.id,
        evaluatorName: evaluator.name,
        normalizedScore: average === null ? null : Math.round(average * 10) / 10,
        passed: average === null ? null : average >= threshold,
        rawScores,
      };
    });
  const evaluated = details.filter((detail) => detail.passed !== null).length;
  const passed = details.filter((detail) => detail.passed).length;
  const totalEnabled = details.length;
  const evaluatedAny = evaluated > 0;

  return {
    passed,
    evaluated,
    totalEnabled,
    allPassed:
      evaluatedAny && evaluated === totalEnabled && passed === totalEnabled,
    evaluatedAny,
    details,
  };
}

export function overviewTraceStatus(
  trace: EvaluationLayerTrace,
  evaluators: EvaluationLayerEvaluator[],
  threshold: number,
): "PASS" | "FAIL" | "ERROR" {
  if (trace.status === "ERROR") return "ERROR";
  const summary = traceEvaluatorSummary(trace, evaluators, threshold);
  return summary.evaluatedAny && !summary.allPassed ? "FAIL" : "PASS";
}

export function traceEvaluatorAlertTriggered(
  trace: EvaluationLayerTrace,
  evaluators: EvaluationLayerEvaluator[],
  threshold: number,
  sendAlert: boolean,
) {
  if (!sendAlert) return false;
  const summary = traceEvaluatorSummary(trace, evaluators, threshold);
  return summary.evaluatedAny && !summary.allPassed;
}
