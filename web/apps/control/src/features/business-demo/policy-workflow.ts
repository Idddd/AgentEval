import { saveEntity, type Draft, type Entity } from "./model";
export type DemoRole = "User" | "Agent Wizard" | "Admin";
export type WorkflowAction = "start" | "save" | "return" | "complete";
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
  return { ...item, source: existing?.source, status: "Draft" as const,
    workflow: { stage: submit ? "Awaiting Agent Wizard" as const : "Draft" as const, businessId: existing?.workflow?.businessId ?? id,
      configs: {}, ...(submit ? { submittedAt: now, submittedBy: owner } : {}),
    } };
}
export function configurePolicy(items: Entity[], id: string, action: WorkflowAction, role: DemoRole, owner: string, configs: Record<string, string>, comment = "") {
  if (role !== "Agent Wizard" && role !== "Admin") throw new Error("Agent Wizard role is required.");
  const item = items.find((p) => p.id === id && p.kind === "policies");
  if (!item) throw new Error("Policy not found.");
  const stage = workflowStage(item), now = Date.now();
  if (action === "start" ? !["Awaiting Agent Wizard", "Needs input"].includes(stage) : stage !== "Configuring") throw new Error("Policy status changed. Reopen this policy.");
  if (action !== "start" && item.workflow?.assignedTo !== owner) throw new Error("This policy is assigned to another Agent Wizard.");
  if (action === "return" && !comment.trim()) throw new Error("Enter what the User needs to clarify.");
  const sources = Object.keys(configs).filter((s): s is "Guard" | "F5" => s === "Guard" || s === "F5");
  if (action === "complete" && (!sources.length || sources.some((s) => !configs[s]?.trim()))) throw new Error("Select at least one source and complete its technical configuration.");
  if (item.source && sources.some((s) => s !== item.source)) throw new Error("An existing source policy keeps its source.");
  const workflow = { ...item.workflow, businessId: item.workflow?.businessId ?? id, configs,
    assignedTo: owner, stage: action === "start" || action === "save" ? "Configuring" as const : action === "return" ? "Needs input" as const : "Ready" as const,
    comment: action === "return" ? comment.trim() : "", ...(action === "complete" ? { configuredAt: now } : {}) };
  const saved: Entity = { ...item, updatedAt: now, workflow, status: action === "complete" ? "Ready" : action === "return" ? "Needs input" : "Draft" };
  const results = action === "complete" ? sources.map((source, index) => ({ ...saved, id: index ? crypto.randomUUID() : id, source, workflow: { ...workflow, configs: { [source]: configs[source]! } } })) : [saved];
  return [...results, ...items.filter((p) => p.id !== id)];
}
