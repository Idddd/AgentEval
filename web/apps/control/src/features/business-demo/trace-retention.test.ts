import { expect, it } from "vitest";
import { seedEntities, entitySchema } from "./model";
import { transitionProfile, trafficEvents, profileStages, stageEvents, runtimeMetrics } from "./profile-runtime";
import { compactTraces, stageMetrics, TRACE_LIMIT_PER_PROFILE, TRACE_LIMIT_TOTAL, TRACE_MAX_AGE_MS, assertStorageCapacity } from "./trace-retention";
const now=2_000_000_000_000;
function fixture(){const p=seedEntities().find(p=>p.kind==="guardrails")!;p.status="Ready";p.createdAt=now-TRACE_MAX_AGE_MS*2;p.runtime={approval:"off",events:[]};return p;}
it("bounds traces and preserves every cumulative count and latency across repeated compaction",()=>{
 const p=fixture();
 for(let i=0;i<TRACE_LIMIT_PER_PROFILE+30;i++)p.runtime!.events.push(...trafficEvents(p,now-5000-i*5000,(["safe","risk","error"] as const)[i%3]!,`t${i}`));
 const expected=runtimeMetrics(stageEvents(p,profileStages(p)[0]!),now);
 const compact=compactTraces([p],now)[0]!;
 expect(compact.runtime!.events.length).toBeLessThanOrEqual(TRACE_LIMIT_PER_PROFILE);
 const actual=stageMetrics(compact,profileStages(compact)[0]!,now);
 for(const key of ["count","failed","detected","blocked","wouldBlock","average"] as const)expect(actual[key]).toBe(expected[key]);
 const saved=entitySchema.parse(JSON.parse(JSON.stringify(compact)));
 expect(stageMetrics(compactTraces([saved],now)[0]!,profileStages(saved)[0]!,now)).toEqual(actual);
});
it("expires old detail, keeps pending checks, and enforces the global limit",()=>{
 const profiles=Array.from({length:8},(_,n)=>{const p=fixture();p.id=`p${n}`;for(let i=0;i<200;i++)p.runtime!.events.push(...trafficEvents(p,now-5000-i*5000,"risk",`${n}-${i}`));return p;});
 profiles[0]!.runtime!.events.push(...trafficEvents(profiles[0]!,now-TRACE_MAX_AGE_MS-5000,"error","expired"),...trafficEvents(profiles[0]!,now,"safe","pending"));
 const result=compactTraces(profiles,now);
 expect(result.flatMap(p=>p.runtime!.events).length).toBeLessThanOrEqual(TRACE_LIMIT_TOTAL+profiles[0]!.policies.length);
 expect(result[0]!.runtime!.events.some(e=>e.traceId==="expired")).toBe(false);
 expect(result[0]!.runtime!.events.some(e=>e.traceId==="pending")).toBe(true);
});
it("rejects oversized configuration before overwriting storage",()=>{const p=fixture();p.text="x".repeat(2_100_000);expect(()=>assertStorageCapacity([p])).toThrow(/capacity/i);});

it("keeps archived stages separate and bounds oversized trace snapshots",()=>{
 const p=fixture();p.runtime!.events=trafficEvents(p,now-5000,"risk","big").map(e=>({...e,profileSnapshot:"x".repeat(600000)}));
 const compact=compactTraces([p],now)[0]!;
 expect(compact.runtime!.events).toHaveLength(0);
 const oldStage=profileStages(compact)[0]!;
 const before=stageMetrics(compact,oldStage,now);
 const active=transitionProfile(transitionProfile(compact,"request","IT Admin",now+1),"approve","Admin",now+2);
 expect(stageMetrics(active,profileStages(active)[0]!,now+3).count).toBe(0);
 expect(stageMetrics(active,profileStages(active)[1]!,now+3)).toEqual(before);
 expect(JSON.stringify(compact).length).toBeLessThan(100000);
});
