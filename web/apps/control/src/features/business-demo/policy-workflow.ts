import { saveEntity, type Draft, type Entity } from "./model";
import { readUnified, configError, createEvaluation, type UnifiedConfig } from './evaluation';
export type DemoRole = "User" | "Agent Wizard" | "Admin";
export type WorkflowAction = "start" | "save" | "return" | "complete" | "approve" | "revise";
export function workflowStage(item: Entity) { return item.workflow?.stage ?? (item.status === "Ready" ? "Ready" : item.status === 'Submitted' ? 'Submitted' : item.status === "Needs input" ? "Needs input" : "Draft"); }
// Keep transitions independent of the role-specific presentation.
export function policyStatus(item: Entity, role: DemoRole = "User") {
  const stage = workflowStage(item);
  if (stage === "Awaiting Agent Wizard" || stage === "Configuring" || stage === "Needs input" || stage === 'Submitted') {
    return 'Submitted';
  }
  return stage;
}
export function saveBusinessPolicy(draft: Draft, submit: boolean, owner: string, role: DemoRole, items: Entity[], existing?: Entity) {
  if (existing && role === 'Agent Wizard') throw new Error('Only User or Admin can edit business requirements.');
  if (existing && !["Draft", "Needs input", "Submitted", "Ready"].includes(workflowStage(existing))) throw new Error("This policy is waiting for technical configuration.");
  const now = Date.now(), id = existing?.id ?? crypto.randomUUID();
  const item = saveEntity("policies", draft, submit, now, id, existing, items, owner);
  const sources = existing?.workflow?.sources?.length ? existing.workflow.sources : [draft.source ?? existing?.source ?? 'Guard'];
  return { ...item, source: sources[0], status: "Draft" as const,
    workflow: { stage: submit ? "Awaiting Agent Wizard" as const : "Draft" as const, businessId: existing?.workflow?.businessId ?? id,
      configs: {}, sources, ...(submit ? { submittedAt: now, submittedBy: owner } : {}),
    } };
}
export function configurePolicy(items: Entity[], id: string, action: WorkflowAction, role: DemoRole, owner: string, configs: Record<string, string>, comment = "", suppliedConfig?: UnifiedConfig, business?: Pick<Entity, 'name' | 'text'>) {
  if (role !== "Agent Wizard" && role !== "Admin" && action !== 'revise') throw new Error("Agent Wizard role is required.");
  const item = items.find((p) => p.id === id && p.kind === "policies");
  if (!item) throw new Error("Policy not found.");
  const stage = workflowStage(item), now = Date.now();
  if (action === 'revise') {
    if (stage !== 'Ready') throw new Error('Only a ready guardrail can create a configuration version.');
    const originalConfig = item.workflow?.config ?? readUnified(item.workflow?.configs ?? {},item.text);
    const config = suppliedConfig ?? originalConfig;
    if (role === 'User' && JSON.stringify(config) !== JSON.stringify(originalConfig)) throw new Error('Only Tech or Admin can edit technical configuration.');
    if (role === 'Agent Wizard' && business && (business.name !== item.name || business.text !== item.text)) throw new Error('Only User or Admin can edit business requirements.');
    const problem = role === 'User' ? null : configError(config);
    if (problem) throw new Error(problem);
    if (business && !business.name.trim()) throw new Error('Enter a name.');
    if (business && !business.text.trim()) throw new Error('Enter a requirement.');
    const version = Math.max(0,...[item.version,...item.revisions.map(r=>r.version)].map(v=>Number(String(v).replace(/^v/,'')) || 0)) + 1;
    const saved: Entity = {...item,...(business ? {name:business.name.trim(),text:business.text.trim()} : {}),version,updatedAt:now,status:'Draft',
      revisions:[...item.revisions.filter(r=>String(r.version)!==String(item.version)),{version:item.version,name:item.name,text:item.text,workflow:item.workflow}],
      workflow:{businessId:item.workflow?.businessId ?? id,stage:role === 'User' ? 'Awaiting Agent Wizard' : 'Configuring',assignedTo:role === 'User' ? undefined : owner,configs:{},config,sources:['Guard'],revision:(item.workflow?.revision ?? 0)+1}};
    return items.map(p=>p.id===id?saved:p);
  }
  if (stage === 'Pending approve' && (action === 'approve' || action === 'return')) {
    if (role !== 'Admin') throw new Error('Only Admin can approve or return evaluation results.');
    if (!item.workflow?.evaluation?.results.length || item.workflow.evaluation.revision !== item.workflow.revision || item.workflow.evaluation.results.some(r => r.status !== 'completed')) throw new Error('Evaluate the current configuration before approval.');
    if (action === 'return' && !comment.trim()) throw new Error('Enter a reason for returning this guardrail.');
    const next = action === 'approve' ? 'Ready' as const : 'Submitted' as const;
    return items.map(p => p.id !== id ? p : { ...p, status: next, updatedAt: now, workflow: { ...item.workflow!, stage: next, comment: action === 'return' ? comment.trim() : '', approval: action === 'approve' ? { by: owner, at: now } : undefined } });
  }
  if (action === "start" ? !["Awaiting Agent Wizard", "Needs input", "Submitted"].includes(stage) : stage !== "Configuring") throw new Error("Policy status changed. Reopen this policy.");
  if (role !== 'Admin' && action !== "start" && item.workflow?.assignedTo !== owner) throw new Error("This policy is assigned to another Agent Wizard.");
  if (action === "return" && !comment.trim()) throw new Error("Enter what the User needs to clarify.");
  const sources: Array<'Guard' | 'F5'> = ['Guard']; // Legacy storage key; the demo now has one evaluator.
  const config = suppliedConfig ?? readUnified(configs, item.text);
  if (action === 'complete') { const error = configError(config); if (error) throw new Error(error); }
  const revision = (item.workflow?.revision ?? 0) + (action === 'complete' || action === 'save' ? 1 : 0);
  const workflow = { ...item.workflow, businessId: item.workflow?.businessId ?? id, configs: {}, config, sources, revision, approval: undefined,
    evaluation: action === 'complete' ? createEvaluation(id, revision, config, sources, now) : undefined,
    assignedTo: owner, stage: action === "start" || action === "save" ? "Configuring" as const : action === "return" ? "Submitted" as const : "Evaluating" as const,
    comment: action === "return" ? comment.trim() : "", ...(action === "complete" ? { configuredAt: now } : {}) };
  const saved: Entity = { ...item, source: sources[0], updatedAt: now, workflow, status: action === "complete" ? "Evaluating" : action === "return" ? "Submitted" : "Draft" };
  return [saved, ...items.filter((p) => p.id !== id)];
}
