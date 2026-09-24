import { saveEntity, type Draft, type Entity } from "./model";
import { readUnified, configError, createEvaluation, type UnifiedConfig } from './evaluation';
export type DemoRole = "User" | "Agent Wizard" | "Admin";
export type WorkflowAction = "start" | "save" | "return" | "complete" | "approve";
export function workflowStage(item: Entity) { return item.workflow?.stage ?? (item.status === "Ready" ? "Ready" : item.status === "Needs input" ? "Needs input" : "Draft"); }
// Keep transitions independent of the role-specific presentation.
export function policyStatus(item: Entity, role: DemoRole = "User") {
  const stage = workflowStage(item);
  if (stage === "Awaiting Agent Wizard" || stage === "Configuring" || stage === "Needs input") {
    return role === "User" ? "Pending implement" : "Needs input";
  }
  return stage;
}
export function saveBusinessPolicy(draft: Draft, submit: boolean, owner: string, role: DemoRole, items: Entity[], existing?: Entity) {
  if (existing && !["Draft", "Needs input", "Ready"].includes(workflowStage(existing))) throw new Error("This policy is waiting for technical configuration.");
  const now = Date.now(), id = existing?.id ?? crypto.randomUUID();
  const item = saveEntity("policies", draft, submit, now, id, existing, items, owner);
  const sources = existing?.workflow?.sources?.length ? existing.workflow.sources : [draft.source ?? existing?.source ?? 'Guard'];
  return { ...item, source: sources[0], status: "Draft" as const,
    workflow: { stage: submit ? "Awaiting Agent Wizard" as const : "Draft" as const, businessId: existing?.workflow?.businessId ?? id,
      configs: {}, sources, ...(submit ? { submittedAt: now, submittedBy: owner } : {}),
    } };
}
export function configurePolicy(items: Entity[], id: string, action: WorkflowAction, role: DemoRole, owner: string, configs: Record<string, string>, comment = "", suppliedConfig?: UnifiedConfig) {
  if (role !== "Agent Wizard" && role !== "Admin") throw new Error("Agent Wizard role is required.");
  const item = items.find((p) => p.id === id && p.kind === "policies");
  if (!item) throw new Error("Policy not found.");
  const stage = workflowStage(item), now = Date.now();
  if (stage === 'Pending approve' && (action === 'approve' || action === 'return')) {
    if (role !== 'Admin') throw new Error('Only Admin can approve or return evaluation results.');
    if (!item.workflow?.evaluation?.results.length || item.workflow.evaluation.revision !== item.workflow.revision || item.workflow.evaluation.results.some(r => r.status !== 'completed')) throw new Error('Evaluate the current configuration before approval.');
    if (action === 'return' && !comment.trim()) throw new Error('Enter a reason for returning this guardrail.');
    const next = action === 'approve' ? 'Ready' as const : 'Needs input' as const;
    return items.map(p => p.id !== id ? p : { ...p, status: next, updatedAt: now, workflow: { ...item.workflow!, stage: next, comment: action === 'return' ? comment.trim() : '', approval: action === 'approve' ? { by: owner, at: now } : undefined } });
  }
  if (action === "start" ? !["Awaiting Agent Wizard", "Needs input"].includes(stage) : stage !== "Configuring") throw new Error("Policy status changed. Reopen this policy.");
  if (action !== "start" && item.workflow?.assignedTo !== owner) throw new Error("This policy is assigned to another Agent Wizard.");
  if (action === "return" && !comment.trim()) throw new Error("Enter what the User needs to clarify.");
  const sources = Object.keys(configs).filter((s): s is "Guard" | "F5" => s === "Guard" || s === "F5");
  if (!sources.length && (action === 'start' || action === 'return')) sources.push(...(item.workflow?.sources?.length ? item.workflow.sources : [item.source ?? 'Guard']));
  if (!sources.length) throw new Error('Select at least one source.');
  if (action === "complete" && (!sources.length || sources.some((s) => !configs[s]?.trim()))) throw new Error("Select at least one source and complete its technical configuration.");
  const config = suppliedConfig ?? readUnified(configs, item.text);
  if (action === 'complete') { const error = configError(config); if (error) throw new Error(error); }
  const revision = (item.workflow?.revision ?? 0) + (action === 'complete' || action === 'save' ? 1 : 0);
  const workflow = { ...item.workflow, businessId: item.workflow?.businessId ?? id, configs: {}, config, sources, revision, approval: undefined,
    evaluation: action === 'complete' ? createEvaluation(id, revision, config, sources, now) : undefined,
    assignedTo: owner, stage: action === "start" || action === "save" ? "Configuring" as const : action === "return" ? "Needs input" as const : "Evaluating" as const,
    comment: action === "return" ? comment.trim() : "", ...(action === "complete" ? { configuredAt: now } : {}) };
  const saved: Entity = { ...item, source: sources[0], updatedAt: now, workflow, status: action === "complete" ? "Evaluating" : action === "return" ? "Needs input" : "Draft" };
  return [saved, ...items.filter((p) => p.id !== id)];
}
