import { evaluationFixtures } from "./fixtures";
import type { EvaluationState } from "./model";

export function cloneEvaluationFixtures(): EvaluationState {
  return structuredClone(evaluationFixtures);
}

export function validateEvaluationState(state: EvaluationState): string[] {
  const errors: string[] = [];
  const targetIds = new Set(state.targets.map((item) => item.id));
  const targetRevisionIds = new Set(state.targetRevisions.map((item) => item.id));
  const datasetIds = new Set(state.datasets.map((item) => item.id));
  const datasetRevisionIds = new Set(state.datasetRevisions.map((item) => item.id));
  const runIds = new Set(state.runs.map((item) => item.id));
  const reportIds = new Set(state.reports.map((item) => item.id));

  for (const target of state.targets) {
    const current = state.targetRevisions.find(
      (item) => item.id === target.currentRevisionId,
    );
    if (!current || current.targetId !== target.id) {
      errors.push(
        `targets.${target.id}.currentRevisionId: ${target.currentRevisionId}`,
      );
    }
  }
  for (const revision of state.targetRevisions) {
    if (!targetIds.has(revision.targetId)) {
      errors.push(
        `targetRevisions.${revision.id}.targetId: ${revision.targetId}`,
      );
    }
  }
  for (const dataset of state.datasets) {
    if (!targetIds.has(dataset.targetId)) {
      errors.push(`datasets.${dataset.id}.targetId: ${dataset.targetId}`);
    }
    if (dataset.currentRevisionId) {
      const current = state.datasetRevisions.find(
        (item) => item.id === dataset.currentRevisionId,
      );
      if (!current || current.datasetId !== dataset.id) {
        errors.push(
          `datasets.${dataset.id}.currentRevisionId: ${dataset.currentRevisionId}`,
        );
      }
    }
  }
  for (const revision of state.datasetRevisions) {
    if (!datasetIds.has(revision.datasetId)) {
      errors.push(
        `datasetRevisions.${revision.id}.datasetId: ${revision.datasetId}`,
      );
    }
  }
  for (const run of state.runs) {
    if (!targetIds.has(run.targetId)) {
      errors.push(`runs.${run.id}.targetId: ${run.targetId}`);
    }
    if (!targetRevisionIds.has(run.targetRevisionId)) {
      errors.push(
        `runs.${run.id}.targetRevisionId: ${run.targetRevisionId}`,
      );
    }
    if (!datasetRevisionIds.has(run.datasetRevisionId)) {
      errors.push(
        `runs.${run.id}.datasetRevisionId: ${run.datasetRevisionId}`,
      );
    }
    if (run.reportId && !reportIds.has(run.reportId)) {
      errors.push(`runs.${run.id}.reportId: ${run.reportId}`);
    }
  }
  for (const report of state.reports) {
    if (!runIds.has(report.runId)) {
      errors.push(`reports.${report.id}.runId: ${report.runId}`);
    }
    if (!targetIds.has(report.targetId)) {
      errors.push(`reports.${report.id}.targetId: ${report.targetId}`);
    }
  }
  for (const reflection of state.reflections) {
    if (!reportIds.has(reflection.reportId)) {
      errors.push(
        `reflections.${reflection.id}.reportId: ${reflection.reportId}`,
      );
    }
    if (
      reflection.resultingTargetRevisionId &&
      !targetRevisionIds.has(reflection.resultingTargetRevisionId)
    ) {
      errors.push(
        `reflections.${reflection.id}.resultingTargetRevisionId: ${reflection.resultingTargetRevisionId}`,
      );
    }
    for (const suggestion of reflection.suggestions) {
      if (suggestion.reportId !== reflection.reportId) {
        errors.push(
          `reflections.${reflection.id}.suggestions.${suggestion.id}.reportId: ${suggestion.reportId}`,
        );
      }
    }
  }
  return errors;
}
