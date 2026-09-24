import { type Entity } from './model';
import { readUnified } from './evaluation';

export function unifiedEvaluation(run: NonNullable<Entity['workflow']>['evaluation']) {
  if (!run || !run.results.length) return run;
  const results = run.results;
  return { ...run, results: [{ source: 'Guard' as const,
    status: results.some(r => r.status === 'running') ? 'running' as const : results.some(r => r.status === 'error') ? 'error' as const : 'completed' as const,
    success: results.reduce((n, r) => n + r.success, 0), fail: results.reduce((n, r) => n + r.fail, 0),
    responseTimeMs: Math.max(...results.map(r => r.responseTimeMs)), finishedAt: Math.max(...results.map(r => r.finishedAt)),
    details: results.flatMap(r => r.details),
  }] };
}

export function normalizeDemo(items: Entity[]): Entity[] {
  const unit = (value: string) => value === 'Compliance' ? 'LCS' : value === 'Security' ? 'Admin' : value;
  return items.map(item => ({
    ...item, owner: unit(item.owner), status: item.status === 'Needs input' ? 'Submitted' : item.status,
    name: item.id.startsWith('demo-') ? item.name.replace(/Needs input/g, 'Submitted') : item.name,
    ...(item.workflow ? { workflow: {
      ...item.workflow,
      evaluation: unifiedEvaluation(item.workflow.evaluation),
      config: item.workflow.config ?? (Object.keys(item.workflow.configs).length ? readUnified(item.workflow.configs, item.text) : undefined),
      stage: item.workflow.stage === 'Needs input' ? 'Submitted' : item.workflow.stage,
      ...(item.workflow.assignedTo ? { assignedTo: unit(item.workflow.assignedTo) } : {}),
      ...(item.workflow.submittedBy ? { submittedBy: unit(item.workflow.submittedBy) } : {}),
      ...(item.workflow.approval ? { approval: { ...item.workflow.approval, by: unit(item.workflow.approval.by) } } : {}),
    } } : {}),
  }));
}
