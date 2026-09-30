import { z } from "zod";
import type { Entity } from "./model";

export const scanEventSchema = z.object({
  direction: z.enum(['request','response']).optional(),
  scannedContent: z.string().optional(),
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
  id: z.string(), mode: z.enum(["monitoring", "active", "mixed"]),
  startedAt: z.number(), endedAt: z.number().optional(),
  guardrails: z.array(z.object({policyId:z.string(),name:z.string(),version:z.union([z.string(),z.number()]),mode:z.enum(["monitoring","active"]).optional()})),
});
export type RuntimeStage = z.infer<typeof runtimeStageSchema>;
export type GuardrailMode = "monitoring" | "active";
export function guardrailMode(p: Entity, id:string): GuardrailMode {
 return p.runtime?.modes?.[id] ?? (p.runtime?.modes ? "monitoring" : p.status==="Active"?"active":"monitoring");
}
function modeRefs(p:Entity) { return p.policies.map(ref=>({...ref,mode:guardrailMode(p,ref.policyId)})); }
function combinedMode(refs:{mode?:GuardrailMode}[]):RuntimeStage["mode"] {
 const active=refs.filter(r=>r.mode==="active").length;
 return active===0?"monitoring":active===refs.length?"active":"mixed";
}
export function setGuardrailMode(p:Entity,id:string,mode:GuardrailMode):Entity {
 if(p.runtime?.bypass)throw new Error("Resume this profile before changing modes.");
 if(p.kind!=="guardrails"||!p.policies.some(r=>r.policyId===id))throw new Error("Select a linked guardrail.");
 const runtime=p.runtime??{approval:"off" as const,events:[]};
 const draftModes={...Object.fromEntries(modeRefs(p).map(r=>[r.policyId,r.mode])),...runtime.draftModes,[id]:mode};
 return {...p,runtime:{...runtime,draftModes,approval:"off",snapshot:undefined}};
}
export function profileStages(p: Entity): RuntimeStage[] {
 if(p.runtime?.stages?.length)return p.runtime.stages.map((s,i)=>i===0?{...s,guardrails:modeRefs(p)}:s);
 const guardrails=modeRefs(p);
 return [{id:"legacy",mode:combinedMode(guardrails),startedAt:Math.min(p.createdAt,...(p.runtime?.events??[]).map(e=>e.receivedAt)),guardrails}];
}
export function stageEvents(p: Entity, stage: RuntimeStage) {
 return (p.runtime?.events??[]).filter(e=>{
  const ref=stage.guardrails.find(r=>r.policyId===e.guardrailId);
  return ref && e.mode===(ref.mode??stage.mode) && (e.stageId?e.stageId===stage.id:e.receivedAt>=stage.startedAt&&(stage.endedAt===undefined||e.receivedAt<stage.endedAt));
 });
}
function switchStage(p:Entity,modes:Record<string,GuardrailMode>,now:number) {
 const stages=profileStages(p),guardrails=p.policies.map(r=>({...r,mode:modes[r.policyId]??"monitoring" as GuardrailMode}));
 const unchanged=guardrails.length===stages[0]!.guardrails.length && guardrails.every(r=>{
  const old=stages[0]!.guardrails.find(g=>g.policyId===r.policyId);
  return old && (old.mode??stages[0]!.mode)===r.mode && old.version===r.version;
 });
 if(unchanged)return stages;
 const mode=combinedMode(guardrails);
 return [{id:`${mode}-${now}-${stages.length}`,mode,startedAt:now,guardrails},...stages.map((s,i)=>i===0?{...s,endedAt:now}:s)];
}
export const traceRollupSchema=z.object({
 stageId:z.string(),guardrailId:z.string(),mode:z.enum(["monitoring","active"]),
 count:z.number().nonnegative(),failed:z.number().nonnegative(),detected:z.number().nonnegative(),blocked:z.number().nonnegative(),wouldBlock:z.number().nonnegative(),durationTotal:z.number().nonnegative(),
});
export const profileRuntimeSchema = z.object({
  rollups:z.array(traceRollupSchema).optional(),
  bypass: z.boolean().optional(),
  bypassChangedAt: z.number().optional(),
  bypassChangedBy: z.string().optional(),
  approval: z.enum(["off", "pending", "approved", "rejected"]),
  modes: z.record(z.string(),z.enum(["monitoring","active"])).optional(),
  draftModes: z.record(z.string(),z.enum(["monitoring","active"])).optional(),
  snapshot: z.string().optional(),
  requestedBy: z.string().optional(),
  requestedAt: z.number().optional(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.number().optional(),
  stages: z.array(runtimeStageSchema).optional(),
  events: z.array(scanEventSchema).default([]),
});
export type ScanEvent = z.infer<typeof scanEventSchema>;
export type ProfileAction = "request" | "approve" | "reject" | "deactivate" | "bypass" | "resume";
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
    p.runtime?.draftModes,
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
  if(action === "bypass") return {...p,runtime:{...runtime,bypass:true,bypassChangedAt:now,bypassChangedBy:actor}};
  if(action === "resume") {
    if(!runtime.bypass)return p;
    const modes=Object.fromEntries(p.policies.map(r=>[r.policyId,"monitoring" as const]));
    return {...p,status:"Ready",runtime:{...runtime,bypass:false,bypassChangedAt:now,bypassChangedBy:actor,modes,approval:"off",draftModes:undefined,snapshot:undefined,requestedBy:undefined,requestedAt:undefined,reviewedBy:undefined,reviewedAt:undefined,stages:switchStage(p,modes,now)}};
  }
  if(runtime.bypass)throw new Error("Resume this profile before changing its configuration.");
  if (action === "request") {
    if (
      (p.status !== "Ready" && p.status !== "Active") ||
      !p.policies.length ||
      runtime.approval === "pending"
    )
      throw new Error("Save a ready profile before requesting approval.");
    return {
      ...p,
      runtime: {
        ...runtime,
        approval: "pending",
        snapshot: profileSnapshot({...p,runtime:{...runtime,draftModes:runtime.draftModes??Object.fromEntries(p.policies.map(r=>[r.policyId,"active" as const]))}}),
        draftModes: runtime.draftModes??Object.fromEntries(p.policies.map(r=>[r.policyId,"active" as const])),
        requestedBy: actor,
        requestedAt: now,
        reviewedBy: undefined,
        reviewedAt: undefined,
      },
    };
  }
  if (action === "deactivate") {
    const modes=Object.fromEntries(p.policies.map(r=>[r.policyId,"monitoring" as const]));
    return {...p,status:"Ready",runtime:{...runtime,approval:"off",modes,draftModes:undefined,stages:switchStage(p,modes,now)}};
  }
  if (actor !== "Admin")
    throw new Error("Only Admin can approve or reject Preventing mode.");
  if (runtime.approval !== "pending" || runtime.snapshot !== profileSnapshot(p))
    throw new Error("Configuration changed. Request approval again.");
  const modes=runtime.draftModes??Object.fromEntries(modeRefs(p).map(r=>[r.policyId,r.mode]));
  return {
    ...p,
    status: action === "approve" ? (Object.values(modes).includes("active")?"Active":"Ready") : p.status,
    runtime: {
      ...runtime,
      approval: action === "approve" ? "approved" : "rejected",
      modes: action === "approve" ? modes : runtime.modes,
      draftModes: action === "approve" ? undefined : runtime.draftModes,
      stages: action === "approve" ? switchStage(p,modes,now) : runtime.stages,
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
  if(p.runtime?.bypass)return [];
  return p.policies.flatMap((ref,index)=>{
    const modes=guardrailMode(p,ref.policyId)==="active" ? (["active","monitoring"] as const):(["monitoring"] as const);
    return modes.map(mode=>{
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
    });
  });
}
export function runtimeMetrics(events: ScanEvent[], now: number) {
  const completed = events.filter((e) => e.completedAt <= now);
  const durations = completed.map((e) => e.durationMs).sort((a, b) => a - b);
  return {
    count: completed.length,
    pending: events.length - completed.length,
    failed: completed.filter((e) => e.decision === "error").length,
    detected: completed.filter(e=>e.decision==="would_block"||e.decision==="block").length,
    blocked: completed.filter((e) => e.enforced).length,
    wouldBlock: completed.filter((e) => e.decision === "would_block").length,
    average: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0,
    p95: durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] ?? 0,
  };
}
