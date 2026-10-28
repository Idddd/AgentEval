import { sourceLabel } from "./model";
import { useState, type ReactNode } from "react";
import { Search, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeploymentQueues } from "./deployment-queues";
import { studioStatuses } from "./studio";
import { statusLabel } from "./status-label";
import type { Entity, Kind, Role } from "./model";
import type { View } from "./shell";

export function LiveRecordList({ items, kind, view, role, title, onOpen, onCreate, renderStatus, renderBackend }: {
  items: Entity[]; kind: Kind; view: View; role: Role; title: string;
  onOpen: (id: string) => void; onCreate: () => void;
  renderStatus: (item: Entity) => ReactNode; renderBackend: (item: Entity) => ReactNode;
}) {
  const [search, setSearch] = useState(""), [status, setStatus] = useState("All"), [unit, setUnit] = useState("All"), [location, setLocation] = useState("All"), [page, setPage] = useState(1);
  const units = [...new Set(items.map(item => item.unit))].sort(), locations = [...new Set(items.map(item => item.location))].sort();
  const rows = items.filter(item => `${item.name} ${item.id} ${item.description}`.toLowerCase().includes(search.trim().toLowerCase()) && (status === "All" || item.status === status) && (unit === "All" || item.unit === unit) && (location === "All" || item.location === location || item.location === "ALL"));
  const pages = Math.max(1, Math.ceil(rows.length / 6)), current = Math.min(page, pages);
  return <>
    <section className="nm-card nm-live-list"><div className="nm-filters nm-live-list-filters">
      <div className="nm-search"><Search size={17} /><Input aria-label="Search records" placeholder={`Search ${kind}s by keywords…`} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></div>
      {([{ label: "Status", value: status, options: studioStatuses, set: setStatus }, { label: "Control Unit", value: unit, options: units, set: setUnit }, { label: "Location", value: location, options: locations, set: setLocation }]).map(filter => <label key={filter.label} className="nm-select"><span>{filter.label}</span><select aria-label={filter.label} value={filter.value} onChange={event => { filter.set(event.target.value); setPage(1); }}><option>All</option>{filter.options.map(value => <option key={value} value={value}>{filter.label === "Status" ? statusLabel(value) : value}</option>)}</select></label>)}
      {role === "User" && view === "repository" && <Button onClick={onCreate}>Create {kind}</Button>}
    </div></section>
    {view === "deploy" ? <DeploymentQueues items={rows} kind={kind} role={role} onOpen={onOpen} /> : <section className="nm-card nm-live-list mt-5">
      <div className="nm-card-head"><h3>{title}</h3><span>{rows.length} records</span></div>
      <div className="nm-scroll"><table><thead><tr><th>{kind} Name</th><th>Status</th><th>Control Unit</th><th>Last Modified</th><th>Backend Status</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{rows.slice((current - 1) * 6, current * 6).map(item => <tr key={item.id}>
        <td><button className="nm-live-record-name" onClick={() => onOpen(item.id)}>{item.name}</button><small>{item.id}</small><small>{sourceLabel(item)} · v{item.version}</small></td>
        <td>{renderStatus(item)}</td><td>{item.unit}</td><td><time dateTime={item.updated}>{new Date(item.updated).toLocaleString("en-GB", { timeZone: "Asia/Shanghai" })}</time></td>
        <td className="nm-live-backend-status">{renderBackend(item)}</td><td><Button size="icon" variant="ghost" aria-label={`View ${item.name}`} onClick={() => onOpen(item.id)}><ChevronRight size={16} /></Button></td>
      </tr>)}</tbody></table></div>
      {!rows.length && <p className="nm-empty">No matching records. This workspace contains only records saved in Marketplace V3.</p>}
      <footer className="nm-pagination"><span>{rows.length ? `${(current - 1) * 6 + 1}–${Math.min(current * 6, rows.length)}` : "0"} of {rows.length}</span><Button size="sm" variant="outline" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</Button><span>Page {current} / {pages}</span><Button size="sm" variant="outline" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</Button></footer>
    </section>}
  </>;
}
