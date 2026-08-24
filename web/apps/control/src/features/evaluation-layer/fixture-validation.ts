import { evaluationLayerFixtures } from "./fixtures";
import type { EvaluationLayerState } from "./model";

export function cloneEvaluationLayerFixtures(): EvaluationLayerState {
  return structuredClone(evaluationLayerFixtures);
}

export function validateEvaluationLayerState(state: EvaluationLayerState): string[] {
  const errors: string[] = [];
  const targetIds = new Set(state.targets.map((target) => target.id));
  const targetRevisionIds = new Set(state.targetRevisions.map((revision) => revision.id));
  const datasetIds = new Set(state.datasets.map((dataset) => dataset.id));
  const datasetRevisionIds = new Set(state.datasetRevisions.map((revision) => revision.id));
  const guardrailTemplateIds = new Set(
    state.guardrailTemplates.map((template) => template.id),
  );
  const runIds = new Set(state.runs.map((run) => run.id));
  const reportIds = new Set(state.reports.map((report) => report.id));
  const evaluatorIds = new Set(state.evaluators.map((evaluator) => evaluator.id));

  const requireReference = (path: string, id: string, ids: Set<string>) => {
    if (!ids.has(id)) errors.push(`${path}: ${id}`);
  };

  for (const target of state.targets) {
    requireReference(`targets.${target.id}.currentRevisionId`, target.currentRevisionId, targetRevisionIds);
    const revision = state.targetRevisions.find((item) => item.id === target.currentRevisionId);
    if (revision?.targetId !== target.id) errors.push(`targets.${target.id}.currentRevisionId: ${target.currentRevisionId}`);
    if (!["agent", "mcp", "kb", "skill", "guardrail"].includes(target.kind)) {
      errors.push(`targets.${target.id}.kind: ${target.kind}`);
    }
    if (revision?.kind !== target.kind) {
      errors.push(`targets.${target.id}.kind: revision kind mismatch`);
    }
  }
  for (const revision of state.targetRevisions) requireReference(`targetRevisions.${revision.id}.targetId`, revision.targetId, targetIds);
  for (const dataset of state.datasets) {
    requireReference(`datasets.${dataset.id}.targetId`, dataset.targetId, targetIds);
    requireReference(`datasets.${dataset.id}.currentRevisionId`, dataset.currentRevisionId, datasetRevisionIds);
    const revision = state.datasetRevisions.find((item) => item.id === dataset.currentRevisionId);
    if (revision?.datasetId !== dataset.id) errors.push(`datasets.${dataset.id}.currentRevisionId: ${dataset.currentRevisionId}`);
  }
  for (const revision of state.datasetRevisions) {
    requireReference(`datasetRevisions.${revision.id}.datasetId`, revision.datasetId, datasetIds);
    requireReference(`datasetRevisions.${revision.id}.targetId`, revision.targetId, targetIds);
    const dataset = state.datasets.find((item) => item.id === revision.datasetId);
    if (dataset?.targetId !== revision.targetId) {
      errors.push(`datasetRevisions.${revision.id}.targetId: ${revision.targetId}`);
    }
  }
  for (const template of state.guardrailTemplates) {
    if (!template.cases.length) {
      errors.push(`guardrailTemplates.${template.id}.cases: empty`);
    }
    for (const kind of template.defaultFor) {
      if (!template.applicableTargetKinds.includes(kind)) {
        errors.push(`guardrailTemplates.${template.id}.defaultFor: ${kind}`);
      }
    }
  }
  for (const run of state.runs) {
    if (!run.guardrailTemplateIds.length) {
      errors.push(`runs.${run.id}.guardrailTemplateIds: empty`);
    }
    requireReference(`runs.${run.id}.targetId`, run.targetId, targetIds);
    requireReference(`runs.${run.id}.targetRevisionId`, run.targetRevisionId, targetRevisionIds);
    requireReference(`runs.${run.id}.datasetId`, run.datasetId, datasetIds);
    requireReference(`runs.${run.id}.datasetRevisionId`, run.datasetRevisionId, datasetRevisionIds);
    for (const templateId of run.guardrailTemplateIds) {
      requireReference(
        `runs.${run.id}.guardrailTemplateIds`,
        templateId,
        guardrailTemplateIds,
      );
    }
    for (const evaluatorId of run.evaluatorIds) requireReference(`runs.${run.id}.evaluatorIds`, evaluatorId, evaluatorIds);
    const targetRevision = state.targetRevisions.find((item) => item.id === run.targetRevisionId);
    if (targetRevision?.targetId !== run.targetId) {
      errors.push(`runs.${run.id}.targetRevisionId: ${run.targetRevisionId}`);
    }
    for (const templateId of run.guardrailTemplateIds) {
      const template = state.guardrailTemplates.find((item) => item.id === templateId);
      if (
        targetRevision &&
        template &&
        !template.applicableTargetKinds.includes(targetRevision.kind)
      ) {
        errors.push(`runs.${run.id}.guardrailTemplateIds: ${templateId}`);
      }
    }
    const dataset = state.datasets.find((item) => item.id === run.datasetId);
    if (dataset?.targetId !== run.targetId) {
      errors.push(`runs.${run.id}.datasetId: ${run.datasetId}`);
    }
    const datasetRevision = state.datasetRevisions.find((item) => item.id === run.datasetRevisionId);
    if (datasetRevision?.datasetId !== run.datasetId || datasetRevision?.targetId !== run.targetId) {
      errors.push(`runs.${run.id}.datasetRevisionId: ${run.datasetRevisionId}`);
    }
    for (const result of run.results) {
      if (result.guardrailTemplateId) {
        const template = state.guardrailTemplates.find(
          (item) => item.id === result.guardrailTemplateId,
        );
        if (
          !run.guardrailTemplateIds.includes(result.guardrailTemplateId) ||
          !template?.cases.some((item) => item.id === result.caseId)
        ) {
          errors.push(`runs.${run.id}.results.${result.caseId}.caseId: ${result.caseId}`);
        }
      } else if (!datasetRevision?.cases.some((item) => item.id === result.caseId)) {
        errors.push(`runs.${run.id}.results.${result.caseId}.caseId: ${result.caseId}`);
      }
      if (result.traceId) {
        const trace = state.traces.find((item) => item.id === result.traceId);
        if (trace?.runId !== run.id) {
          errors.push(`runs.${run.id}.results.${result.caseId}.traceId: ${result.traceId}`);
        }
      }
    }
  }
  for (const report of state.reports) requireReference(`reports.${report.id}.runId`, report.runId, runIds);
  for (const decision of state.revisionDecisions) {
    requireReference(`revisionDecisions.${decision.id}.reportId`, decision.reportId, reportIds);
    requireReference(`revisionDecisions.${decision.id}.targetRevisionId`, decision.targetRevisionId, targetRevisionIds);
    const report = state.reports.find((item) => item.id === decision.reportId);
    const run = report ? state.runs.find((item) => item.id === report.runId) : undefined;
    if (run && decision.targetRevisionId !== run.targetRevisionId) {
      errors.push(`revisionDecisions.${decision.id}.targetRevisionId: ${decision.targetRevisionId}`);
    }
  }
  for (const reflection of state.reflections) {
    requireReference(`reflections.${reflection.id}.reportId`, reflection.reportId, reportIds);
    requireReference(`reflections.${reflection.id}.targetId`, reflection.targetId, targetIds);
  }
  for (const trace of state.traces) {
    requireReference(`traces.${trace.id}.runId`, trace.runId, runIds);
    requireReference(`traces.${trace.id}.targetId`, trace.targetId, targetIds);
    const run = state.runs.find((item) => item.id === trace.runId);
    const datasetRevision = state.datasetRevisions.find((item) => item.id === run?.datasetRevisionId);
    const isGuardrailTemplateCase = run?.guardrailTemplateIds.some((templateId) =>
      state.guardrailTemplates
        .find((template) => template.id === templateId)
        ?.cases.some((item) => item.id === trace.caseId),
    );
    if (run?.targetId !== trace.targetId) errors.push(`traces.${trace.id}.targetId: ${trace.targetId}`);
    if (
      !datasetRevision?.cases.some((item) => item.id === trace.caseId) &&
      !isGuardrailTemplateCase
    ) {
      errors.push(`traces.${trace.id}.caseId: ${trace.caseId}`);
    }
    const targetRevision = state.targetRevisions.find((item) => item.id === run?.targetRevisionId);
    const toolIds = new Set(targetRevision?.tools.map((tool) => tool.id) ?? []);
    for (const evidence of trace.toolEvidence) {
      requireReference(`traces.${trace.id}.toolEvidence.${evidence.id}.toolId`, evidence.toolId, toolIds);
    }
    const spanIds = new Set(trace.spans.map((span) => span.id));
    for (const span of trace.spans) if (span.parentSpanId) requireReference(`traces.${trace.id}.spans.${span.id}.parentSpanId`, span.parentSpanId, spanIds);
  }
  requireReference("settings.activeTargetId", state.settings.activeTargetId, targetIds);
  requireReference("settings.activeDatasetId", state.settings.activeDatasetId, datasetIds);
  requireReference("settings.selectedRunId", state.settings.selectedRunId, runIds);
  if (
    !Number.isFinite(state.settings.samplingRate) ||
    state.settings.samplingRate < 0 ||
    state.settings.samplingRate > 100
  ) {
    errors.push(`settings.samplingRate: ${state.settings.samplingRate}`);
  }
  for (const evaluator of state.evaluators) {
    if (
      !Number.isFinite(evaluator.minimumScore) ||
      evaluator.minimumScore < 0 ||
      evaluator.minimumScore > 100
    ) {
      errors.push(
        `evaluators.${evaluator.id}.minimumScore: ${evaluator.minimumScore}`,
      );
    }
    if (typeof evaluator.sendAlert !== "boolean") {
      errors.push(`evaluators.${evaluator.id}.sendAlert: ${evaluator.sendAlert}`);
    }
  }
  const traceIds = new Set(state.traces.map((trace) => trace.id));
  for (const event of state.activity) {
    requireReference(`activity.${event.id}.targetId`, event.targetId, targetIds);
    if (event.traceId) requireReference(`activity.${event.id}.traceId`, event.traceId, traceIds);
  }
  for (const entry of state.logs) {
    requireReference(`logs.${entry.id}.runId`, entry.runId, runIds);
    if (entry.traceId) requireReference(`logs.${entry.id}.traceId`, entry.traceId, traceIds);
    if (entry.caseId) {
      const run = state.runs.find((item) => item.id === entry.runId);
      const revision = state.datasetRevisions.find(
        (item) => item.id === run?.datasetRevisionId,
      );
      const isGuardrailTemplateCase = run?.guardrailTemplateIds.some((templateId) =>
        state.guardrailTemplates
          .find((template) => template.id === templateId)
          ?.cases.some((item) => item.id === entry.caseId),
      );
      if (
        !revision?.cases.some((item) => item.id === entry.caseId) &&
        !isGuardrailTemplateCase
      ) {
        errors.push(`logs.${entry.id}.caseId: ${entry.caseId}`);
      }
    }
  }
  return errors;
}
