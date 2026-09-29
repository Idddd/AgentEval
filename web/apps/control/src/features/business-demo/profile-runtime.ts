import { z } from "zod";
import type { Entity } from "./model";

export const scanEventSchema = z.object({
  stageId: z.string().optional(),
  id: z.string(),
  traceId: z.string(),
  guardrailId: z.string(),
  guardrailName: z.string(),
  version: z.union([z.string(), z.number()]),
  profileSnapshot: z.string(),
  agent: z.string(),
  mode: z.enum(["monitoring", "active"]),
  decision: z.enum(["allow", "would_block", "block", "error"]),
  enforced: z.boolean(),
  receivedAt: z.number(),
  startedAt: z.number(),
  completedAt: z.number(),
  durationMs: z.number(),
  message: z.string(),
  errorCode: z.string().optional(),
  providerScanId: z.string().optional(),
});
export const runtimeStageSchema = z.object({
  id: z.string(), mode: z.enum(["monitoring", "active"]),
  startedAt: z.number(), endedAt: z.number().optional(),
  guardrails: z.array(z.object({policyId:z.string(),name:z.string(),version:z.union([z.string(),z.number()])})),
});
export type RuntimeStage = z.infer<typeof runtimeStageSchema>;
export function profileStages(p: Entity): RuntimeStage[] {
  if (p.runtime?.stages?.length) return p.runtime.stages.map((s,i)=>i===0?{...s,guardrails:p.policies}:s);
  return [{id:"legacy",mode:p.status === "Active" ? "active" : "monitoring",startedAt:Math.min(p.createdAt,...(p.runtime?.events ?? []).map(e=>e.receivedAt)),guardrails:p.policies}];
}
export function stageEvents(p: Entity, stage: RuntimeStage) {
  return (p.runtime?.events ?? []).filter(e=>e.mode===stage.mode && (e.stageId ? e.stageId===stage.id : e.receivedAt>=stage.startedAt && (stage.endedAt===undefined || e.receivedAt<stage.endedAt)));
}
function switchStage(p: Entity, mode: RuntimeStage["mode"], now:number) {
  const stages=profileStages(p);
  if (stages[0]!.mode===mode && stages[0]!.endedAt===undefined) return stages;
  return [{id:`${mode}-${now}-${stages.length}`,mode,startedAt:now,guardrails:p.policies},...stages.map((s,i)=>i===0?{...s,endedAt:now}:s)];
}
export const profileRuntimeSchema = z.object({
  approval: z.enum(["off", "pending", "approved", "rejected"]),
  snapshot: z.string().optional(),
  requestedBy: z.string().optional(),
  requestedAt: z.number().optional(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.number().optional(),
  stages: z.array(runtimeStageSchema).optional(),
  events: z.array(scanEventSchema).default([]),
});
export type ScanEvent = z.infer<typeof scanEventSchema>;
export type ProfileAction = "request" | "approve" | "reject" | "deactivate";
export function initializeProfileRuntime(p: Entity, now: number): Entity {
  if (p.kind !== "guardrails" || p.runtime) return p;
  return {
    ...p,
    runtime: {
      approval: p.status === "Active" ? "approved" : "off",
      snapshot: profileSnapshot(p),
      events: [
        ...trafficEvents(p, now - 60000, "error", `${p.id}-timeout`),
        ...trafficEvents(p, now - 120000, "risk", `${p.id}-risk`),
        ...trafficEvents(p, now - 180000, "safe", `${p.id}-safe`),
      ],
    },
  };
}
export function profileSnapshot(p: Entity) {
  return JSON.stringify([
    p.name,
    p.useCase,
    p.source,
    p.busu,
    p.location,
    p.agentType,
    p.dataType,
    p.policies,
  ]);
}
export function transitionProfile(
  p: Entity,
  action: ProfileAction,
  actor: string,
  now: number,
): Entity {
  if (p.kind !== "guardrails") throw new Error("Select a profile.");
  const runtime = { ...(p.runtime ?? { approval: "off" as const, events: [] }), stages: profileStages(p) };
  if (action === "request") {
    if (
      p.status !== "Ready" ||
      !p.policies.length ||
      runtime.approval === "pending"
    )
      throw new Error("Save a ready profile before requesting approval.");
    return {
      ...p,
      runtime: {
        ...runtime,
        approval: "pending",
        snapshot: profileSnapshot(p),
        requestedBy: actor,
        requestedAt: now,
        reviewedBy: undefined,
        reviewedAt: undefined,
      },
    };
  }
  if (action === "deactivate")
    return { ...p, status: "Ready", runtime: { ...runtime, approval: "off", stages:switchStage(p,"monitoring",now) } };
  if (actor !== "Admin")
    throw new Error("Only Admin can approve or reject Active mode.");
  if (runtime.approval !== "pending" || runtime.snapshot !== profileSnapshot(p))
    throw new Error("Configuration changed. Request approval again.");
  return {
    ...p,
    status: action === "approve" ? "Active" : "Ready",
    runtime: {
      ...runtime,
      approval: action === "approve" ? "approved" : "rejected",
      stages: action === "approve" ? switchStage(p,"active",now) : runtime.stages,
      reviewedBy: actor,
      reviewedAt: now,
    },
  };
}
export function trafficEvents(
  p: Entity,
  now: number,
  scenario: "safe" | "risk" | "error",
  traceId: string,
): ScanEvent[] {
  const modes =
    p.status === "Active"
      ? (["active", "monitoring"] as const)
      : (["monitoring"] as const);
  return modes.flatMap((mode) =>
    p.policies.map((ref, index) => {
      const durationMs =
        scenario === "error" && index === 0 ? 1500 : 42 + index * 17;
      const startedAt = now + (mode === "monitoring" ? 800 : 0);
      const failed = scenario === "error" && index === 0;
      const risk = scenario === "risk" && index === 0;
      return {
        stageId: profileStages(p)[0]!.id,
        id: `${traceId}-${mode}-${ref.policyId}`,
        traceId,
        guardrailId: ref.policyId,
        guardrailName: ref.name,
        version: ref.version,
        profileSnapshot: profileSnapshot(p),
        agent: "Customer assistant",
        mode,
        decision: failed
          ? "error"
          : risk
            ? mode === "active"
              ? "block"
              : "would_block"
            : "allow",
        enforced: risk && mode === "active",
        receivedAt: now,
        startedAt,
        completedAt: startedAt + durationMs,
        durationMs,
        errorCode: failed ? "SCANNER_TIMEOUT" : undefined,
        message: failed
          ? "Scanner exceeded its 1500 ms deadline. Check provider availability. Traffic was allowed under the fail-open policy."
          : risk
            ? "Sensitive information detected in the request."
            : "All configured checks passed.",
      };
    }),
  );
}
export function runtimeMetrics(events: ScanEvent[], now: number) {
  const completed = events.filter((e) => e.completedAt <= now);
  const durations = completed.map((e) => e.durationMs).sort((a, b) => a - b);
  return {
    count: completed.length,
    pending: events.length - completed.length,
    failed: completed.filter((e) => e.decision === "error").length,
    blocked: completed.filter((e) => e.enforced).length,
    wouldBlock: completed.filter((e) => e.decision === "would_block").length,
    average: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0,
    p95: durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] ?? 0,
  };
}
