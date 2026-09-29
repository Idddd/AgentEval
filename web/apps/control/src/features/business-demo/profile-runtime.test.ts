import { expect, it } from "vitest";
import { seedEntities, saveEntity, entitySchema } from "./model";
import {
  transitionProfile,
  setGuardrailMode,
  guardrailMode,
  trafficEvents,
  runtimeMetrics,
  profileStages,
  stageEvents,
} from "./profile-runtime";
const profile = () => ({
  ...seedEntities().find((x) => x.kind === "guardrails")!,
  status: "Ready" as const,
});
it("requires an Admin approval of the requested configuration", () => {
  const pending = transitionProfile(profile(), "request", "ISS", 100);
  expect(pending.runtime?.approval).toBe("pending");
  expect(() =>
    transitionProfile(pending, "approve", "IT Admin", 101),
  ).toThrow();
  expect(transitionProfile(pending, "approve", "Admin", 102).status).toBe(
    "Active",
  );
  expect(() =>
    transitionProfile({ ...pending, name: "changed" }, "approve", "Admin", 102),
  ).toThrow();
});
it("monitoring records risk asynchronously without enforcing a block", () => {
  const events = trafficEvents(profile(), 1000, "risk", "trace-1");
  expect(events.length).toBeGreaterThan(0);
  expect(
    events.every(
      (x) =>
        x.mode === "monitoring" && !x.enforced && x.decision === "would_block",
    ),
  ).toBe(true);
  expect(runtimeMetrics(events, 1001).count).toBe(0);
  expect(runtimeMetrics(events, 5000).wouldBlock).toBe(events.length);
});
it("active and monitoring correlate but have separate enforcement counts", () => {
  const active = transitionProfile(
    transitionProfile(profile(), "request", "ISS", 100),
    "approve",
    "Admin",
    101,
  );
  const events = trafficEvents(active, 1000, "risk", "trace-2");
  expect(new Set(events.map((x) => x.traceId)).size).toBe(1);
  expect(
    events.filter((x) => x.mode === "active").every((x) => x.enforced),
  ).toBe(true);
  expect(
    runtimeMetrics(
      events.filter((x) => x.mode === "monitoring"),
      5000,
    ).blocked,
  ).toBe(0);
});
it("saving invalidates approval and preserves prior scan evidence through storage", () => {
  const original = profile();
  const pending = transitionProfile(original, "request", "ISS", 100);
  pending.runtime!.events = trafficEvents(pending, 10, "safe", "persisted");
  const edited = saveEntity(
    "guardrails",
    { ...pending, name: "Edited profile" },
    false,
    200,
    pending.id,
    pending,
  );
  expect(edited.runtime?.approval).toBe("off");
  expect(
    entitySchema.parse(JSON.parse(JSON.stringify(edited))).runtime?.events,
  ).toHaveLength(pending.policies.length);
  expect(() => transitionProfile(edited, "approve", "Admin", 201)).toThrow();
});
it("scanner failures are neither risk detections nor enforced blocks", () => {
  const events = trafficEvents(profile(), 1000, "error", "failure");
  const metrics = runtimeMetrics(events, 5000);
  expect(metrics.failed).toBe(1);
  expect(metrics.blocked).toBe(0);
  expect(metrics.wouldBlock).toBe(0);
});

it("starts empty Active statistics and preserves Monitoring history through storage",()=>{
 const p=profile();p.runtime={approval:"off",events:trafficEvents(p,10,"risk","old")};
 const pending=transitionProfile(p,"request","ISS",100);
 const active=transitionProfile(pending,"approve","Admin",200);
 const stages=profileStages(active);
 expect(stages).toHaveLength(2);
 expect(stages[1]!.endedAt).toBe(200);
 expect(stageEvents(active,stages[0]!)).toHaveLength(0);
 expect(stageEvents(active,stages[1]!)).toHaveLength(p.policies.length);
 const saved=entitySchema.parse(JSON.parse(JSON.stringify(active)));
 saved.runtime!.events.push(...trafficEvents(saved,300,"safe","new"));
 expect(stageEvents(saved,profileStages(saved)[0]!).every(e=>e.mode==="active")).toBe(true);
 const stopped=transitionProfile(saved,"deactivate","IT Admin",400);
 expect(profileStages(stopped)).toHaveLength(3);
 expect(stageEvents(stopped,profileStages(stopped)[0]!)).toHaveLength(0);
 expect(stageEvents(stopped,profileStages(stopped)[2]!)).toHaveLength(p.policies.length);
});
it("pending and rejected requests do not reset the stage",()=>{
 const pending=transitionProfile(profile(),"request","ISS",100);
 const rejected=transitionProfile(pending,"reject","Admin",200);
 expect(profileStages(rejected)).toEqual(profileStages(pending));
});

it("approves final per-profile guardrail modes together without applying drafts",()=>{
 const base=profile();base.policies=[base.policies[0]!,{...base.policies[0]!,policyId:"second",name:"Second"}];
 let draft=setGuardrailMode(base,base.policies[0]!.policyId,"active");
 draft=setGuardrailMode(draft,"second","active");
 draft=setGuardrailMode(draft,"second","monitoring");
 expect(guardrailMode(draft,base.policies[0]!.policyId)).toBe("monitoring");
 const pending=transitionProfile(draft,"request","IT Admin",100);
 const approved=transitionProfile(pending,"approve","Admin",200);
 expect(guardrailMode(approved,base.policies[0]!.policyId)).toBe("active");
 expect(guardrailMode(approved,"second")).toBe("monitoring");
 expect(guardrailMode(base,base.policies[0]!.policyId)).toBe("monitoring");
 expect(profileStages(approved)[0]!.mode).toBe("mixed");
 approved.runtime!.events=trafficEvents(approved,300,"safe","mixed");
 expect(stageEvents(approved,profileStages(approved)[0]!)).toHaveLength(2);
 const edited=setGuardrailMode(pending,"second","active");
 expect(()=>transitionProfile(edited,"approve","Admin",400)).toThrow();
 expect(guardrailMode(entitySchema.parse(JSON.parse(JSON.stringify(approved))),"second")).toBe("monitoring");
});

it("bypasses every guardrail and resumes all in Monitoring with approval cleared",()=>{
 const base=profile();base.policies=[base.policies[0]!,{...base.policies[0]!,policyId:"second",name:"Second"}];
 const draft=setGuardrailMode(base,base.policies[0]!.policyId,"active");
 const active=transitionProfile(transitionProfile(draft,"request","IT Admin",100),"approve","Admin",200);
 active.runtime!.events=trafficEvents(active,300,"risk","history");
 const bypass=transitionProfile(active,"bypass","IT Admin",400);
 expect(bypass.runtime?.bypass).toBe(true);
 for(const scenario of ["safe","risk","error"] as const)expect(trafficEvents(bypass,500,scenario,"skip")).toEqual([]);
 expect(bypass.runtime?.events).toEqual(active.runtime?.events);
 expect(()=>setGuardrailMode(bypass,"second","active")).toThrow();
 expect(()=>transitionProfile(bypass,"request","IT Admin",600)).toThrow();
 const restored=transitionProfile(entitySchema.parse(JSON.parse(JSON.stringify(bypass))),"resume","IT Admin",700);
 expect(restored.runtime?.bypass).toBe(false);
 expect(restored.status).toBe("Ready");
 expect(restored.runtime?.approval).toBe("off");
 expect(restored.runtime?.draftModes).toBeUndefined();
 expect(restored.runtime?.events).toEqual(active.runtime?.events);
 expect(()=>transitionProfile(restored,"approve","Admin",750)).toThrow();
 expect(guardrailMode(restored,base.policies[0]!.policyId)).toBe("monitoring");
 expect(guardrailMode(restored,"second")).toBe("monitoring");
 expect(trafficEvents(restored,800,"safe","restored")).toHaveLength(2);
});

it("counts detections in both modes without duplicating Preventing shadow checks",()=>{
 const base=profile();
 const monitoring=trafficEvents(base,1000,"risk","monitor");
 expect(runtimeMetrics(monitoring,5000).detected).toBe(base.policies.length);
 expect(runtimeMetrics(monitoring,5000).blocked).toBe(0);
 const active=transitionProfile(transitionProfile(base,"request","IT Admin",100),"approve","Admin",200);
 active.runtime!.events=trafficEvents(active,1000,"risk","prevent");
 const metrics=runtimeMetrics(stageEvents(active,profileStages(active)[0]!),5000);
 expect(metrics.detected).toBe(base.policies.length);
 expect(metrics.blocked).toBe(base.policies.length);
 expect(runtimeMetrics(trafficEvents(base,1000,"error","err"),5000).detected).toBe(0);
});
