import { expect, it } from "vitest";
import { seedEntities, saveEntity, entitySchema } from "./model";
import {
  transitionProfile,
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
