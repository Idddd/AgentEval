import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { operatingModeLabel, operatingProfile } from "../profile-operations-state";
import type { Entity, State } from "../model";

export function MeasureProfileOperations({ profiles, state, now, renderOperations }: {
  profiles: Entity[]; state: State; now: number; renderOperations: (profile: Entity) => ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(profiles[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const matches = profiles.filter(profile => profile.name.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = profiles.find(profile => profile.id === selectedId) ?? profiles[0];
  const mode = (profile: Entity) => operatingModeLabel(operatingProfile(profile, state, now));
  return <div className="nm-profile-drawer">
    <div className="nm-profile-layout">
      <aside className="nm-profile-switcher" aria-label="Linked Profiles">
        <div className="nm-profile-switcher-head"><h3>Profiles <span>{profiles.length}</span></h3>
          <div className="nm-profile-search"><Search size={14} aria-hidden="true" /><Input aria-label="Search linked Profiles" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search Profiles" /></div>
        </div>
        <div className="nm-profile-list">{matches.map(profile => <button key={profile.id} type="button" className="nm-profile-choice" aria-label={`Open operations for ${profile.name}`} aria-pressed={selected?.id === profile.id} onClick={() => setSelectedId(profile.id)}>
          <span className="nm-profile-choice-name">{profile.name}</span>
          <span className="nm-profile-choice-meta"><span className="nm-profile-mode" data-mode={mode(profile)}>{mode(profile)}</span><span>{profile.deployedRefs.length} Guardrails</span></span>
          {profile.runtime?.approval === "pending" && <span className="nm-profile-pending">Pending approval</span>}
        </button>)}{!matches.length && <p className="nm-profile-empty">No matching Profiles.</p>}</div>
      </aside>
      <div className="nm-profile-workspace">{selected ? <section key={selected.id} aria-label={`Profile operations: ${selected.name}`}>
        <header className="nm-profile-workspace-head"><div><span className="nm-profile-eyebrow">Profile</span><h3>{selected.name}</h3><p>{selected.unit} · {selected.deployedRefs.length} Guardrails</p></div><span className="nm-profile-mode" data-mode={mode(selected)}>{mode(selected)}</span></header>
        {renderOperations(selected)}
      </section> : <p className="nm-profile-empty">No linked Profiles.</p>}</div>
    </div>
  </div>;
}
