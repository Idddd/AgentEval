import { Fragment, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { stageMetrics, StorageCapacityError } from "./trace-retention";
import type { Entity } from "./model";
import { guardrailMode, profileStages, stageEvents, type ScanEvent, type ProfileAction } from "./profile-runtime";
import { useBusinessDemo } from "./provider";
const rate=(n:number,total:number)=>total?`${(n/total*100).toFixed(1)}%`:"—";
const stamp=(n:number)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(n);
const outcomeLabel=(decision:ScanEvent["decision"])=>decision==="allow"?"Success":decision==="error"?"Error":decision==="would_block"?"Detected":"Block";
const modeLabel=(mode:string)=>mode==="active"?"Preventing":mode==="mixed"?"Mixed":"Monitoring";
const field="rounded-md border bg-white px-3 py-2 text-sm";
export function ProfileApprovalActions({profile,dirty}:{profile:Entity;dirty:boolean}) {
 const {profileAction,currentOwner,busy}=useBusinessDemo();
 const [pending,setPending]=useState(false),[error,setError]=useState("");
 const [confirmBypass,setConfirmBypass]=useState(false);
 const approval=profile.runtime?.approval??"off",draftModes=profile.runtime?.draftModes;
 const bypass=!!profile.runtime?.bypass;
 const modeChanges=profile.policies.filter(r=>draftModes?.[r.policyId]&&draftModes[r.policyId]!==guardrailMode(profile,r.policyId));
 async function action(value:ProfileAction){
  if(!profileAction||pending)return;
  setPending(true);setError("");
  try{await profileAction(profile.id,value);if(value==="bypass")setConfirmBypass(false)}catch(e){setError(e instanceof Error?e.message:"Unable to save.")}finally{setPending(false)}
 }
 return <div className="space-y-2"> <div className="flex flex-wrap items-center justify-end gap-2">
 <Button size="sm" variant="outline" className={bypass?"border-amber-300 bg-amber-50 text-amber-800":""} disabled={busy||pending||dirty} onClick={()=>bypass?void action("resume"):setConfirmBypass(true)}>{bypass?"Resume monitoring":"Bypass"}</Button>
 {approval==="rejected"&&<span className="text-xs text-amber-700">Request rejected</span>}
 {approval==="pending"?<><span className="text-sm text-amber-700">Profile pending approval</span>{currentOwner==="Admin"&&<><Button size="sm" disabled={bypass||busy||pending||dirty} onClick={()=>action("approve")}>Approve Profile</Button><Button size="sm" variant="outline" disabled={bypass||busy||pending} onClick={()=>action("reject")}>Reject</Button></>}</>:<><Button size="sm" variant="outline" disabled={bypass||busy||pending||dirty||!modeChanges.length||!profile.policies.length} onClick={()=>action("request")}>Submit for approval</Button></>}
 </div>{error&&!confirmBypass&&<p role="alert" className="text-xs text-red-700">{error}</p>}
 <Dialog open={confirmBypass} onOpenChange={open=>{if(!pending){setConfirmBypass(open);setError("")}}}>
 <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
 <div className="space-y-3 p-6"><DialogTitle className="pr-8 text-lg font-semibold">Bypass this profile?</DialogTitle>
 <DialogDescription className="text-sm leading-6 text-muted-foreground">All guardrails in <strong className="font-semibold text-foreground">{profile.name}</strong> will be skipped. Requests will go directly to the original upstream service, without checks, blocking, or new traces.</DialogDescription>
 <p className="text-xs text-muted-foreground">Existing history is kept. Resume returns all guardrails to Monitoring. Preventing requires a new approval.</p>
 {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</div>
 <div className="flex justify-end gap-2 border-t bg-muted/30 px-6 py-4"><Button variant="outline" disabled={pending} onClick={()=>setConfirmBypass(false)}>Cancel</Button><Button className="bg-amber-600 text-white hover:bg-amber-700" disabled={pending||busy||dirty} onClick={()=>void action("bypass")}>{pending?"Applying…":"Confirm bypass"}</Button></div>
 </DialogContent></Dialog></div>;
}
export function ProfileOperations({profile,dirty,onOpenGuardrail}:{profile:Entity;dirty:boolean;onOpenGuardrail:(id:string,version:string|number)=>void}) {
 const {profileAction,setProfileMode,runTraffic,busy,mode}=useBusinessDemo();
 const [now,setNow]=useState(Date.now()),[sort,setSort]=useState("default");
 const [expanded,setExpanded]=useState<string[]>([]),[outcomes,setOutcomes]=useState<Record<string,string>>({});
 const [selected,setSelected]=useState<ScanEvent|null>(null),[error,setError]=useState(""),[pending,setPending]=useState(false);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(timer)},[]);
 const trafficRef=useRef({runTraffic,busy,dirty,bypass:!!profile.runtime?.bypass});
 trafficRef.current={runTraffic,busy,dirty,bypass:!!profile.runtime?.bypass};
 useEffect(()=>{
  if(mode!=="mock"||!profile.policies.length)return;
  let tick=0,inFlight=false,cancelled=false,capacityPaused=false;
  const scenarios=["safe","risk","error"] as const;
  const timer=setInterval(async()=>{
   const latest=trafficRef.current;
   if(capacityPaused||document.visibilityState==="hidden"||latest.bypass||latest.busy||latest.dirty||inFlight||!latest.runTraffic)return;
   inFlight=true;
   try{await latest.runTraffic(profile.id,scenarios[tick%scenarios.length]!);tick++;if(!cancelled)setError("")}
   catch(e){if(e instanceof StorageCapacityError || (e instanceof Error && /capacity/i.test(e.message)))capacityPaused=true;if(!cancelled)setError(e instanceof Error?e.message:"Unable to generate traffic.")}
   finally{inFlight=false}
  },5000);
  return()=>{cancelled=true;clearInterval(timer)};
 },[mode,profile.id,profile.policies.length]);
 if(!profileAction)return null;
 const bypass=!!profile.runtime?.bypass;
 const stage=profileStages(profile)[0]!,historical=false;
 const current=stageEvents(profile,stage),metrics=stageMetrics(profile,stage,now),approval=profile.runtime?.approval??"off";
 const blocks=metrics.blocked;
 const preventingMetrics=stageMetrics(profile,stage,now,undefined,"active");
 const hasPreventing=stage.guardrails.some(r=>r.mode==="active");
 const draftModes=profile.runtime?.draftModes;
 async function perform(operation:()=>void|Promise<void>){setPending(true);setError("");try{await operation()}catch(e){setError(e instanceof Error?e.message:"Unable to save.")}finally{setPending(false)}}
 const toggle=(id:string)=>setExpanded(current=>current[0]===id?[]:[id]);
 const rows=stage.guardrails.map(ref=>({ref,events:current.filter(e=>e.guardrailId===ref.policyId)})).map(row=>({...row,m:stageMetrics(profile,stage,now,row.ref.policyId)})).sort((a,b)=>{const key=sort.replace(/-(asc|desc)$/,""),direction=sort.endsWith("-asc")?1:-1;const delta=key==="name"?a.ref.name.localeCompare(b.ref.name):key==="scans"?a.m.count-b.m.count:key==="latency"?a.m.average-b.m.average:key==="errors"?a.m.failed-b.m.failed:key==="block"?a.m.blocked-b.m.blocked:key==="detected"?a.m.detected-b.m.detected:0;return delta*direction;});
 const focused=rows.find(r=>r.ref.policyId===expanded[0]);
 const focusId=focused?.ref.policyId??"all",traceFilter=outcomes[focusId]??"all";
 const traces=(focused?focused.events:rows.flatMap(r=>r.events)).filter(e=>traceFilter==="all"||(e.completedAt<=now&&(traceFilter==="Block"?outcomeLabel(e.decision)==="Block":e.decision===traceFilter))).sort((a,b)=>b.receivedAt-a.receivedAt);
 const columns=[["name","Guardrail"],["mode","Mode"],["scans","Scans"],["latency","Avg response"],["errors","Error"],["detected","Detected"],["block","Block"]];
 return <div className="space-y-4">
 {approval==="pending"&&<div aria-label="Profile approval configuration" className="flex flex-wrap gap-2 border-t pt-3">{profile.policies.map(ref=><span key={ref.policyId} className="rounded border px-2 py-1 text-xs">{ref.name} · v{ref.version} · {modeLabel(draftModes?.[ref.policyId]??guardrailMode(profile,ref.policyId))}</span>)}</div>}
 {dirty&&<p className="text-xs text-amber-700">Save changes before submitting for approval.</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 <p className="text-xs text-muted-foreground">{historical?"Historical · ":""}{bypass?"Bypass":modeLabel(stage.mode)} · {stamp(stage.startedAt)} — {stage.endedAt===undefined?"Current":stamp(stage.endedAt)} · UTC+08:00</p>
 <div className="grid grid-cols-2 overflow-hidden rounded-lg border bg-white lg:grid-cols-5">
 {[["Scans",metrics.count.toLocaleString(),`${rate(metrics.count-metrics.failed,metrics.count)} success rate`,"text-emerald-700"],["Avg response",metrics.count?`${metrics.average} ms`:"—","",""],["Error",metrics.failed,rate(metrics.failed,metrics.count),"text-amber-700 bg-amber-50/50"],["Detected",metrics.detected,rate(metrics.detected,metrics.count),"text-blue-700 bg-blue-50/50"],["Block",hasPreventing?blocks:"—",hasPreventing?rate(blocks,preventingMetrics.count):"—","text-red-700 bg-red-50/50"]].map(([label,value,sub,color])=><div key={label} className={`space-y-2 border-r p-5 ${label==="Scans"?"":color}`}><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-semibold">{value}</div><div className={`text-sm font-semibold ${label==="Scans"?color:""}`}>{sub}</div></div>)}
 </div>
 <section className="overflow-hidden rounded-lg border bg-white">


 <div className="max-h-[600px] overflow-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead className="sticky top-0 z-10 bg-zinc-50 text-xs text-muted-foreground"><tr>{columns.map(([key,label])=><th key={key} className="p-4" aria-sort={sort===`${key}-asc`?"ascending":sort===`${key}-desc`?"descending":"none"}>{key==="mode"?label:<button aria-label={`Sort by ${label}`} onClick={()=>setSort(sort===`${key}-desc`?`${key}-asc`:`${key}-desc`)}>{label} {sort===`${key}-asc`?"↑":sort===`${key}-desc`?"↓":"↕"}</button>}</th>)}</tr></thead><tbody>
 {rows.map(({ref,m})=><Fragment key={ref.policyId}><tr className={`cursor-pointer border-t hover:bg-zinc-50 ${focused?.ref.policyId===ref.policyId?"bg-blue-50/60":""}`} onClick={()=>toggle(ref.policyId)}><td className="p-4"><button aria-expanded={focused?.ref.policyId===ref.policyId} aria-controls={`traces-${ref.policyId}`} onClick={e=>{e.stopPropagation();toggle(ref.policyId)}} className="text-left font-medium"><span aria-hidden="true" className="mr-2 text-muted-foreground">{focused?.ref.policyId===ref.policyId?"▾":"▸"}</span>{ref.name}</button><div className="mt-1 text-xs text-muted-foreground">v{ref.version}</div></td><td className="p-4" onClick={e=>e.stopPropagation()}>{historical?<span className={`text-xs ${ref.mode==="active"?"text-emerald-700":"text-blue-700"}`}>{modeLabel(ref.mode??stage.mode)}</span>:<div className="flex flex-col-reverse items-start gap-2"><div className="flex flex-wrap items-center gap-2"><select className={`rounded-md border px-3 py-2 text-sm ${draftModes?.[ref.policyId] && draftModes[ref.policyId]!==guardrailMode(profile,ref.policyId)?"border-amber-400 bg-amber-50 font-semibold text-amber-900 ring-1 ring-amber-200":"border-input bg-white"}`} aria-label={`Mode for ${ref.name}`} disabled={bypass||busy||pending||dirty||!setProfileMode} value={draftModes?.[ref.policyId]??guardrailMode(profile,ref.policyId)} onChange={e=>void perform(()=>setProfileMode!(profile.id,ref.policyId,e.target.value as "active"|"monitoring"))}><option value="monitoring">Monitoring</option><option value="active">Preventing</option></select>{draftModes?.[ref.policyId] && draftModes[ref.policyId]!==guardrailMode(profile,ref.policyId)&&<span className="text-xs font-semibold text-amber-700">{approval==="pending"?"Pending approval":"Not submitted"}</span>}</div><div><span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-sm font-semibold ${bypass?"border-amber-300 bg-amber-50 text-amber-800":guardrailMode(profile,ref.policyId)==="active"?"border-emerald-200 bg-emerald-50 text-emerald-800":"border-blue-200 bg-blue-50 text-blue-800"}`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />Current: {bypass?"Bypass":modeLabel(guardrailMode(profile,ref.policyId))}</span></div></div>}</td><td className="p-4">{m.count}</td><td className="p-4">{m.count?`${m.average} ms`:"—"}</td><td className="p-4">{m.failed?<button className="text-amber-700 underline" onClick={e=>{e.stopPropagation();setExpanded([ref.policyId]);setOutcomes(xs=>({...xs,[ref.policyId]:"error"}))}}>{m.failed}</button>:0}<div className="mt-1 text-xs text-muted-foreground">{rate(m.failed,m.count)}</div></td><td className="p-4 text-blue-700">{m.detected}<div className="mt-1 text-xs">{rate(m.detected,m.count)}</div></td><td className="p-4 text-red-700">{ref.mode==="active"?m.blocked:"—"}<div className="mt-1 text-xs">{ref.mode==="active"?rate(m.blocked,m.count):"—"}</div></td></tr>{focused?.ref.policyId===ref.policyId&&<tr id={`traces-${ref.policyId}`}><td colSpan={7} className="p-0"><section aria-label="Trace list" className="border-b bg-zinc-50 p-4"><header className="mb-3 flex flex-wrap items-center gap-3"><h3 className="text-sm font-semibold">Recent traces</h3><span className="text-sm text-muted-foreground">{ref.name}</span>{focused&&<><button className="text-xs underline" onClick={()=>onOpenGuardrail(focused.ref.policyId,focused.ref.version)}>Guardrail details</button></>}<select aria-label="Trace outcomes" className={`${field} ml-auto`} value={traceFilter} onChange={e=>setOutcomes(xs=>({...xs,[focusId]:e.target.value}))}><option value="all">All outcomes</option><option value="error">Error</option><option value="Block">Block</option><option value="allow">Success</option><option value="would_block">Detected</option></select></header><div className="max-h-[280px] overflow-y-auto overscroll-contain rounded border bg-white" aria-label="Trace records">{traces.map(e=><button key={e.id} className="flex h-14 w-full items-center gap-3 border-b px-3 text-left last:border-0 hover:bg-zinc-50" onClick={()=>setSelected(e)}><span className="shrink-0 text-xs text-muted-foreground">{stamp(e.receivedAt)}</span><span className="min-w-0 flex-1 text-xs"><span className="block truncate">{e.traceId}</span><span className="block truncate text-muted-foreground">{e.guardrailName} · {e.errorCode??e.agent}</span></span><span className={`shrink-0 rounded px-2 py-1 text-xs ${e.completedAt>now?"bg-zinc-100":e.decision==="error"?"bg-amber-50 text-amber-700":e.decision==="allow"?"bg-emerald-50 text-emerald-700":e.decision==="would_block"?"bg-blue-50 text-blue-700":"bg-red-50 text-red-700"}`}>{e.completedAt>now?"Pending":outcomeLabel(e.decision)}</span><span className="shrink-0 text-xs">{e.completedAt<=now?`${e.durationMs} ms`:"—"}</span></button>)}{!traces.length&&<p className="p-4 text-sm text-muted-foreground">No matching traces.</p>}</div></section></td></tr>}</Fragment>)}
 {!rows.length&&<tr><td colSpan={7} className="p-6 text-muted-foreground">No matching guardrails.</td></tr>}</tbody></table></div>
 </section>
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
                  Mode: modeLabel(selected.mode),
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
