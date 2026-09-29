import type { Entity } from "./model";
import { profileStages, stageEvents, runtimeMetrics, type RuntimeStage, type ScanEvent } from "./profile-runtime";
export const TRACE_LIMIT_PER_PROFILE=200;
export const TRACE_LIMIT_TOTAL=1000;
export const TRACE_MAX_AGE_MS=24*60*60*1000;
const TRACE_CHAR_BUDGET=500_000;
const STATE_CHAR_BUDGET=2_000_000;
export class StorageCapacityError extends Error {
 constructor(){super("Storage capacity reached. Automatic traffic is paused. Export or remove unused profiles before continuing.");}
}
export function assertStorageCapacity(items:Entity[]){
 if(JSON.stringify(items).length>STATE_CHAR_BUDGET)throw new StorageCapacityError();
}
export function compactTraces(items:Entity[],now=Date.now()):Entity[]{
 const candidates=items.flatMap((p,index)=>(p.runtime?.events??[]).map(event=>({index,event})));
 candidates.sort((a,b)=>b.event.receivedAt-a.event.receivedAt);
 const keep=new Set<ScanEvent>(),counts=new Map<number,number>();
 let total=0,chars=0;
 for(const {index,event} of candidates){
  // Never fold unfinished checks into completed statistics.
  if(event.completedAt>now){keep.add(event);continue;}
  const size=JSON.stringify(event).length;
  if(event.receivedAt<now-TRACE_MAX_AGE_MS || (counts.get(index)??0)>=TRACE_LIMIT_PER_PROFILE || total>=TRACE_LIMIT_TOTAL || chars+size>TRACE_CHAR_BUDGET)continue;
  keep.add(event);counts.set(index,(counts.get(index)??0)+1);total++;chars+=size;
 }
 let changed=false;
 const result=items.map(p=>{
  if(!p.runtime || p.runtime.events.every(e=>keep.has(e)))return p;
  changed=true;
  const stages=profileStages(p),rollups=(p.runtime.rollups??[]).map(r=>({...r}));
  const buckets=new Map(rollups.map(r=>[JSON.stringify([r.stageId,r.guardrailId,r.mode]),r]));
  for(const e of p.runtime.events){
   if(keep.has(e))continue;
   const stageId=e.stageId??stages.find(s=>e.receivedAt>=s.startedAt&&(s.endedAt===undefined||e.receivedAt<s.endedAt))?.id??"legacy";
   const key=JSON.stringify([stageId,e.guardrailId,e.mode]);
   let bucket=buckets.get(key);
   if(!bucket){bucket={stageId,guardrailId:e.guardrailId,mode:e.mode,count:0,failed:0,detected:0,blocked:0,wouldBlock:0,durationTotal:0};buckets.set(key,bucket);rollups.push(bucket);}
   bucket.count++;bucket.durationTotal+=e.durationMs;
   if(e.decision==="error")bucket.failed++;
   if(e.decision==="block"||e.decision==="would_block")bucket.detected++;
   if(e.enforced)bucket.blocked++;
   if(e.decision==="would_block")bucket.wouldBlock++;
  }
  return {...p,runtime:{...p.runtime,stages,rollups,events:p.runtime.events.filter(e=>keep.has(e))}};
 });
 return changed?result:items;
}
export function stageMetrics(p:Entity,stage:RuntimeStage,now:number,guardrailId?:string,mode?:ScanEvent["mode"]){
 const events=stageEvents(p,stage).filter(e=>(!guardrailId||e.guardrailId===guardrailId)&&(!mode||e.mode===mode));
 const {p95:_recentP95,...metrics}=runtimeMetrics(events,now);
 let durationTotal=events.filter(e=>e.completedAt<=now).reduce((sum,e)=>sum+e.durationMs,0);
 for(const r of p.runtime?.rollups??[]){
  const ref=stage.guardrails.find(g=>g.policyId===r.guardrailId);
  if(r.stageId!==stage.id||!ref||r.mode!==(ref.mode??stage.mode)||(guardrailId&&r.guardrailId!==guardrailId)||(mode&&r.mode!==mode))continue;
  for(const key of ["count","failed","detected","blocked","wouldBlock"] as const)metrics[key]+=r[key];
  durationTotal+=r.durationTotal;
 }
 metrics.average=metrics.count?Math.round(durationTotal/metrics.count):0;
 return metrics;
}
