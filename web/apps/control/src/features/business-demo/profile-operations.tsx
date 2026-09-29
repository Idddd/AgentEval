import { useEffect, useState } from "react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Entity } from "./model";
import { profileStages, stageEvents, runtimeMetrics, type ScanEvent, type ProfileAction } from "./profile-runtime";
import { useBusinessDemo } from "./provider";
const rate=(n:number,total:number)=>total?`${(n/total*100).toFixed(1)}%`:"—";
const stamp=(n:number)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(n);
const outcomeLabel=(decision:ScanEvent["decision"])=>decision==="allow"?"Allow":decision==="error"?"Error":"Block";
const field="rounded-md border bg-white px-3 py-2 text-sm";
export function ProfileOperations({profile,dirty,onOpenGuardrail}:{profile:Entity;dirty:boolean;onOpenGuardrail:(id:string,version:string|number)=>void}) {
 const {profileAction,runTraffic,currentOwner,busy}=useBusinessDemo();
 const [testStarted,setTestStarted]=useState<number|null>(null);
 const [now,setNow]=useState(Date.now()),[period,setPeriod]=useState("current"),[search,setSearch]=useState(""),[attention,setAttention]=useState("all"),[sort,setSort]=useState("default");
 const [expanded,setExpanded]=useState<string[]>([]),[outcomes,setOutcomes]=useState<Record<string,string>>({});
 const [selected,setSelected]=useState<ScanEvent|null>(null),[error,setError]=useState(""),[pending,setPending]=useState(false),[scenario,setScenario]=useState<"safe"|"risk"|"error">("risk");
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(timer)},[]);
 if(!profileAction)return null;
 const stages=profileStages(profile),stage=stages.find(s=>s.id===period)??stages[0]!,historical=stage.endedAt!==undefined;
 const current=stageEvents(profile,stage),metrics=runtimeMetrics(current,now),approval=profile.runtime?.approval??"off",active=profile.status==="Active";
 const blocks=metrics.blocked+metrics.wouldBlock;
 const testEvents=testStarted===null?[]:current.filter(e=>e.receivedAt>=testStarted);
 const testRunning=testStarted!==null&&(!testEvents.length||testEvents.some(e=>e.completedAt>now));
 async function sendTest(){
  if(!runTraffic)return;
  setTestStarted(Date.now());setPeriod("current");setSearch("");setAttention("all");setOutcomes({});setExpanded([]);
  await perform(async()=>{try{await runTraffic(profile.id,scenario)}catch(e){setTestStarted(null);throw e}});
 }
 async function perform(operation:()=>void|Promise<void>){setPending(true);setError("");try{await operation()}catch(e){setError(e instanceof Error?e.message:"Unable to save.")}finally{setPending(false)}}
 const action=(value:ProfileAction)=>void perform(async()=>{await profileAction!(profile.id,value);if(value==="approve"||value==="deactivate"){setTestStarted(null);setPeriod("current");setExpanded([]);setAttention("all")}});
 const toggle=(id:string)=>setExpanded([id]);
 const rows=stage.guardrails.map(ref=>({ref,events:current.filter(e=>e.guardrailId===ref.policyId)})).map(row=>({...row,m:runtimeMetrics(row.events,now)})).filter(row=>row.ref.name.toLowerCase().includes(search.toLowerCase())&&(attention!=="errors"||row.m.failed>0)).sort((a,b)=>{const key=sort.replace(/-(asc|desc)$/,""),direction=sort.endsWith("-asc")?1:-1;const delta=key==="name"?a.ref.name.localeCompare(b.ref.name):key==="scans"?a.m.count-b.m.count:key==="latency"?a.m.average-b.m.average:key==="errors"?a.m.failed-b.m.failed:key==="block"?(a.m.blocked+a.m.wouldBlock)-(b.m.blocked+b.m.wouldBlock):0;return delta*direction;});
 const focused=rows.find(r=>r.ref.policyId===expanded[0]);
 const focusId=focused?.ref.policyId??"all",traceFilter=outcomes[focusId]??"all";
 const traces=(focused?focused.events:rows.flatMap(r=>r.events)).filter(e=>traceFilter==="all"||(e.completedAt<=now&&(traceFilter==="Block"?outcomeLabel(e.decision)==="Block":e.decision===traceFilter))).sort((a,b)=>b.receivedAt-a.receivedAt);
 const columns=[["name","Guardrail"],["scans","Scans"],["latency","Avg response"],["errors","Error"],["block","Block"]];
 return <div className="space-y-4">
 <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-white p-4"><strong>{profile.policies.length} <span className="font-normal">Guardrails</span></strong><span className={`rounded px-2 py-1 text-xs font-medium ${active?"bg-emerald-50 text-emerald-700":"bg-blue-50 text-blue-700"}`}>{active?"Active":"Monitoring"}</span><div className="ml-auto flex items-center gap-2">
 {approval==="rejected"&&<span className="text-xs text-amber-700">Request rejected</span>}
 {active?<Button size="sm" variant="outline" disabled={busy||pending} onClick={()=>action("deactivate")}>Deactivate</Button>:approval==="pending"?currentOwner==="Admin"?<><Button size="sm" disabled={busy||pending||dirty} onClick={()=>action("approve")}>Approve Active</Button><Button size="sm" variant="outline" disabled={busy||pending} onClick={()=>action("reject")}>Reject</Button></>:<span className="text-sm text-amber-700">Pending approval</span>:<Button size="sm" variant="outline" disabled={busy||pending||dirty||profile.status!=="Ready"||!profile.policies.length} onClick={()=>action("request")}>Request Active</Button>}
 </div></div>
 {dirty&&<p className="text-xs text-amber-700">Save changes before requesting Active.</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 <p className="text-xs text-muted-foreground">{historical?"Historical · ":""}{stage.mode==="active"?"Active":"Monitoring"} · {stamp(stage.startedAt)} — {stage.endedAt===undefined?"Current":stamp(stage.endedAt)} · UTC+08:00</p>
 <div className="grid grid-cols-2 overflow-hidden rounded-lg border bg-white lg:grid-cols-4">
 {[["Scans",metrics.count.toLocaleString(),`${rate(metrics.count-metrics.failed,metrics.count)} success rate`,"text-emerald-700"],["Avg response",metrics.count?`${metrics.average} ms`:"—","",""],["Error",metrics.failed,rate(metrics.failed,metrics.count),"text-amber-700 bg-amber-50/50"],["Block",blocks,rate(blocks,metrics.count),"text-red-700 bg-red-50/50"]].map(([label,value,sub,color])=><div key={label} className={`space-y-2 border-r p-5 ${label==="Scans"?"":color}`}><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-semibold">{value}</div><div className={`text-sm font-semibold ${label==="Scans"?color:""}`}>{sub}</div></div>)}
 </div>
 <section className="overflow-hidden rounded-lg border bg-white">
 <header className="flex flex-wrap items-center gap-3 border-b p-4"><h2 className="flex items-center gap-2 font-medium">Guardrails <span className="rounded bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{rows.length === stage.guardrails.length ? stage.guardrails.length : `${rows.length} / ${stage.guardrails.length}`}</span></h2><Select value={stage.id} onValueChange={value=>{setTestStarted(null);setPeriod(value);setExpanded([]);setOutcomes({})}}><SelectTrigger aria-label="Statistics period" className="max-w-full bg-white"><SelectValue>{stage.endedAt===undefined?"Current":`${stage.mode==="active"?"Active":"Monitoring"} · ${stamp(stage.startedAt)} — ${stamp(stage.endedAt)}`}</SelectValue></SelectTrigger><SelectContent>{stages.map(s=><SelectItem key={s.id} value={s.id}>{s.endedAt===undefined?"Current · ":""}{s.mode==="active"?"Active":"Monitoring"} · {stamp(s.startedAt)}{s.endedAt===undefined?"":` — ${stamp(s.endedAt)}`}</SelectItem>)}</SelectContent></Select><input aria-label="Search guardrails" placeholder="Search guardrails…" className={field} value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filter attention" className={field} value={attention} onChange={e=>setAttention(e.target.value)}><option value="all">All statuses</option><option value="errors">With errors</option></select></header>
 <section aria-label="Trace list" className="border-b bg-zinc-50 p-4"><header className="mb-3 flex flex-wrap items-center gap-3"><h3 className="text-sm font-semibold">Traces</h3><span className="text-sm text-muted-foreground">{focused?.ref.name??"All guardrails"}</span>{focused&&<><button className="text-xs underline" onClick={()=>onOpenGuardrail(focused.ref.policyId,focused.ref.version)}>Guardrail details</button><button className="text-xs underline" onClick={()=>setExpanded([])}>Show all</button></>}<select aria-label="Trace outcomes" className={`${field} ml-auto`} value={traceFilter} onChange={e=>setOutcomes(xs=>({...xs,[focusId]:e.target.value}))}><option value="all">All outcomes</option><option value="error">Error</option><option value="Block">Block</option><option value="allow">Allow</option></select></header><div className="max-h-[280px] overflow-y-auto overscroll-contain rounded border bg-white" aria-label="Trace records">{traces.map(e=><button key={e.id} className="flex h-14 w-full items-center gap-3 border-b px-3 text-left last:border-0 hover:bg-zinc-50" onClick={()=>setSelected(e)}><span className="shrink-0 text-xs text-muted-foreground">{stamp(e.receivedAt)}</span><span className="min-w-0 flex-1 text-xs"><span className="block truncate">{e.traceId}</span><span className="block truncate text-muted-foreground">{e.guardrailName} · {e.errorCode??e.agent}</span></span><span className={`shrink-0 rounded px-2 py-1 text-xs ${e.completedAt>now?"bg-zinc-100":e.decision==="error"?"bg-amber-50 text-amber-700":e.decision==="allow"?"bg-emerald-50 text-emerald-700":"bg-red-50 text-red-700"}`}>{e.completedAt>now?"Pending":outcomeLabel(e.decision)}</span><span className="shrink-0 text-xs">{e.completedAt<=now?`${e.durationMs} ms`:"—"}</span></button>)}{!traces.length&&<p className="p-4 text-sm text-muted-foreground">No matching traces.</p>}</div></section>
 <div className="max-h-[600px] overflow-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="sticky top-0 z-10 bg-zinc-50 text-xs text-muted-foreground"><tr>{columns.map(([key,label])=><th key={key} className="p-4" aria-sort={sort===`${key}-asc`?"ascending":sort===`${key}-desc`?"descending":"none"}><button aria-label={`Sort by ${label}`} onClick={()=>setSort(sort===`${key}-desc`?`${key}-asc`:`${key}-desc`)}>{label} {sort===`${key}-asc`?"↑":sort===`${key}-desc`?"↓":"↕"}</button></th>)}</tr></thead><tbody>
 {rows.map(({ref,m})=><tr key={ref.policyId} className={`cursor-pointer border-t hover:bg-zinc-50 ${focused?.ref.policyId===ref.policyId?"bg-blue-50/60":""}`} onClick={()=>toggle(ref.policyId)}><td className="p-4"><button aria-pressed={focused?.ref.policyId===ref.policyId} onClick={e=>{e.stopPropagation();toggle(ref.policyId)}} className="text-left font-medium">{ref.name}</button><div className="mt-1 text-xs text-muted-foreground">v{ref.version}</div></td><td className="p-4">{m.count}</td><td className="p-4">{m.count?`${m.average} ms`:"—"}</td><td className="p-4">{m.failed?<button className="text-amber-700 underline" onClick={e=>{e.stopPropagation();setExpanded([ref.policyId]);setOutcomes(xs=>({...xs,[ref.policyId]:"error"}))}}>{m.failed}</button>:0}<div className="mt-1 text-xs text-muted-foreground">{rate(m.failed,m.count)}</div></td><td className="p-4">{m.blocked+m.wouldBlock}<div className="mt-1 text-xs text-muted-foreground">{rate(m.blocked+m.wouldBlock,m.count)}</div></td></tr>)}
 {!rows.length&&<tr><td colSpan={5} className="p-6 text-muted-foreground">No matching guardrails.</td></tr>}</tbody></table></div>
 </section>
 {!historical&&<div className="flex gap-3"><select aria-label="Traffic scenario" className={field} value={scenario} onChange={e=>setScenario(e.target.value as typeof scenario)}><option value="safe">Safe request</option><option value="risk">Rule violation</option><option value="error">Scanner timeout</option></select><Button variant="outline" disabled={busy||pending||testRunning||!runTraffic||!profile.policies.length} onClick={()=>void sendTest()}>{testRunning?"Running…":"Send test request"}</Button>{testStarted!==null&&<span role="status" className="self-center text-sm text-muted-foreground">{testRunning?"Checking guardrails…":`Completed · ${testEvents.length} checks · ${testEvents.filter(e=>e.decision==="error").length} errors`}</span>}</div>}
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Check details</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="space-y-5 p-6 text-sm">
              <p className="rounded border bg-zinc-50 p-4">
                {selected.completedAt > now
                  ? "Check in progress"
                  : selected.message}
              </p>
              <dl className="space-y-4">
                {Object.entries({
                  Guardrail: selected.guardrailName,
                  Version: `v${selected.version}`,
                  Agent: selected.agent,
                  Mode: selected.mode,
                  Outcome:
                    selected.completedAt > now
                      ? "Pending"
                      : outcomeLabel(selected.decision),
                  "Traffic blocked":
                    selected.completedAt <= now && selected.enforced
                      ? "Yes"
                      : "No",
                  "Error code":
                    selected.completedAt <= now
                      ? (selected.errorCode ?? "None")
                      : "Pending",
                  "Scan latency":
                    selected.completedAt <= now
                      ? `${selected.durationMs} ms`
                      : "Pending",
                  "Queue time": `${selected.startedAt - selected.receivedAt} ms`,
                  Time: new Date(selected.receivedAt).toLocaleString(),
                  "Trace ID": selected.traceId,
                }).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs text-muted-foreground">{key}</dt>
                    <dd className="mt-1 break-all">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>;
}
