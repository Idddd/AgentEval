import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "../resizable-sheet";
import { deployedEntity, type Entity, type State } from "../model";
import { useScanNavigation } from "./use-scan-navigation";
import { MeasureCard } from "./measure-shared";
import "./scan-journey.css";

type Scan = { id: string; profile: string; guardrail: string; result: string; time: string; latency: number };
export function DashboardMeasureOverview({ state, profiles, scans, now, renderOperations, renderAction }: {
  state: State; profiles: Entity[]; scans: Scan[]; now: number; renderOperations: (profile: Entity) => ReactNode;
  renderAction: (profile: Entity, guardrail: Entity) => ReactNode;
}) {
  const navigation = useScanNavigation();
  const { route } = navigation;
  const [operations, setOperations] = useState<{ title: string; profiles: Entity[] } | null>(null);
  const decision = (scan: Scan) => scan.result === "Transferred" ? "Modified" : scan.result;
  const recent = scans.filter(scan => { const age = now - Date.parse(scan.time); return age >= 0 && age <= 600_000; });
  const filtered = recent.filter(scan => route.decision === "all" || decision(scan) === route.decision);
  const guards = state.entities.filter(item => item.kind === "Guardrail" && item.deployed !== null && profiles.some(profile => profile.deployedRefs.includes(item.id))).map(deployedEntity);
  const hits = (id: string) => filtered.filter(scan => scan.guardrail === id);
  const guardRows = [...guards].sort((a, b) => hits(b.id).length - hits(a.id).length || a.name.localeCompare(b.name));
  const agentRows = [...profiles].sort((a, b) => filtered.filter(s => s.profile === b.id).length - filtered.filter(s => s.profile === a.id).length || a.name.localeCompare(b.name));
  const open = (view: "guardrails" | "agents" | "guardrail" | "agent", id = "") => {
    navigation.go({ view, guardrail: view === "guardrail" ? id : "", agent: view === "agent" ? id : "", policy: "", event: "", origin: route.view === "overview" ? "overview" : view === "guardrail" ? "guardrails" : "agents" });
    (document.scrollingElement ?? document.documentElement).scrollTop = 0;
  };
  const overview = route.view === "overview";
  const selected = route.view === "guardrail" ? guards.find(g => g.id === route.guardrail) : profiles.find(p => p.id === route.agent);
  const table = (headers: string[], rows: ReactNode[][]) => <div className="nm-scroll"><table><thead><tr>{headers.map(label => <th key={label} data-decision={label === "Passed" ? "passed" : label === "Blocked" ? "blocked" : undefined}>{label}</th>)}</tr></thead><tbody>{rows.map((cells, i) => <tr key={i}>{cells.map((cell, j) => <td key={j} data-decision={headers[j] === "Passed" ? "passed" : headers[j] === "Blocked" ? "blocked" : undefined}>{cell}</td>)}</tr>)}{!rows.length && <tr><td colSpan={headers.length} className="nm-scan-empty">No matching records.</td></tr>}</tbody></table></div>;
  const guardTable = <MeasureCard title={overview ? "Top-10 Triggered Guardrails" : "All Guardrails"} aside={overview && <Button variant="outline" size="sm" onClick={() => open("guardrails")}>All Guardrails <ArrowRight size={14} /></Button>}>
    {table(["Guardrail Name", "Profiles", "Passed", "Blocked", "Modified", "Switch Mode"], (overview ? guardRows.slice(0, 10) : guardRows).map(guard => {
      const bound = profiles.filter(profile => profile.deployedRefs.includes(guard.id));
      return [<button className="nm-link" onClick={() => open("guardrail", guard.id)}>{guard.name}</button>, bound.length,
        ...["Passed", "Blocked", "Modified"].map(status => hits(guard.id).filter(scan => decision(scan) === status).length),
        bound.length === 1 ? renderAction(bound[0]!, guard) : <Button variant="outline" size="sm" onClick={() => setOperations({ title: guard.name, profiles: bound })}>Actions</Button>];
    }))}
  </MeasureCard>;
  const agentTable = <MeasureCard title={overview ? "High-Hits Agents" : "All Agents"} aside={overview && <Button variant="outline" size="sm" onClick={() => open("agents")}>All Agents <ArrowRight size={14} /></Button>}>
    {table(["Agent name", ""], (overview ? agentRows.slice(0, 10) : agentRows).map(profile => [<button className="nm-link" onClick={() => open("agent", profile.id)}>{profile.name}</button>, <Button variant="outline" size="sm" onClick={() => setOperations({ title: profile.name, profiles: [profile] })}>Kill Instance</Button>]))}
  </MeasureCard>;
  return <div className="nm-scan-journey nm-dashboard-measure">
    <div className="nm-scan-page-head"><div><p className="nm-muted">Measure / {overview ? "Overview" : route.view === "guardrails" ? "All Guardrails" : route.view === "agents" ? "All Agents" : route.view === "guardrail" ? "Guardrail Scans" : "Agent Scans"}</p><h2>{overview ? "Scan Overview" : selected?.name ?? (route.view === "guardrails" ? "All Guardrails" : "All Agents")}</h2></div>{!overview && <Button variant="outline" size="sm" onClick={() => navigation.back()}><ArrowLeft size={14} /> Back</Button>}</div>
    {overview && <section className="nm-scan-metrics" aria-label="Scan Overview">{(["all", "Passed", "Blocked", "Modified"] as const).map(value => <button key={value} aria-label={`${value === "all" ? "Total Scans" : value} scans`} aria-pressed={route.decision === value} data-decision={value === "Passed" ? "passed" : value === "Blocked" ? "blocked" : undefined} onClick={() => navigation.go({ decision: value }, true)}><span>{value === "all" ? "Total Scans" : value}</span><strong>{(value === "all" ? recent.length : recent.filter(scan => decision(scan) === value).length).toLocaleString()}</strong><small>In Last 10 Minutes</small></button>)}</section>}
    {!overview && <div className="nm-scan-filters"><label className="nm-select"><span>Decision</span><select aria-label="Decision" value={route.decision} onChange={event => navigation.go({ decision: event.target.value as typeof route.decision }, true)}>{["all", "Passed", "Blocked", "Modified"].map(value => <option key={value} value={value}>{value === "all" ? "All decisions" : value}</option>)}</select></label></div>}
    {overview ? <div className="nm-measure-overview-columns">{guardTable}{agentTable}</div> : route.view === "guardrails" ? guardTable : route.view === "agents" ? agentTable : <MeasureCard title={route.view === "guardrail" ? "Guardrail Scans" : "Agent Scans"}>{table(["Event", "Timestamp", "Decision", "Response time"], filtered.filter(scan => route.view === "guardrail" ? scan.guardrail === route.guardrail : scan.profile === route.agent).slice(0, 100).map(scan => [scan.id, new Date(scan.time).toLocaleString(), decision(scan), `${scan.latency} ms`]))}</MeasureCard>}
    <Sheet open={!!operations} onOpenChange={open => { if (!open) setOperations(null); }}><ResizableSheetContent storageKey="nmgr-operations-width" aria-describedby={undefined} className="nm-app nm-drawer gap-0 bg-white"><div className="border-b px-6 py-5 pr-14"><SheetTitle className="text-xl">{operations?.title}</SheetTitle><p className="nm-muted">Profile operations</p></div><div className="nm-detail-scroll overflow-y-auto px-6 py-5">{operations?.profiles.map(profile => { const current = profiles.find(item => item.id === profile.id); return current ? <section key={profile.id}><h3>{current.name}</h3>{renderOperations(current)}</section> : null; })}</div></ResizableSheetContent></Sheet>
  </div>;
}
