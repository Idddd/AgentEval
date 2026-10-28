import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProtectionSummary } from "./protection-summary";
import { EnforcementList } from "./enforcement-list";
import { deployedEntity, type Entity, type Role, type State } from "./model";
import type { NmgrBinding } from "../../../marketplace-server/nmgr";

export function LiveDashboard({ state, bindings, role, onCreate, onOpen }: {
  state: State; bindings: Record<string, NmgrBinding>; role: Role; onCreate: () => void; onOpen: (item: Entity) => void;
}) {
  const [unit, setUnit] = useState("All");
  const units = [...new Set(state.entities.map(item => item.unit))].sort();
  const activeUnit = units.includes(unit) ? unit : "All";
  const published = state.entities.filter(item => item.deployed != null).map(deployedEntity).filter(item => activeUnit === "All" || item.unit === activeUnit);
  const profiles = published.filter(item => item.kind === "Profile");
  return <>
    <div className="nm-card nm-padding mb-4"><label className="nm-select nm-live-unit-filter"><span>Control Unit</span>
      <select aria-label="Control Unit" value={activeUnit} onChange={event => setUnit(event.target.value)}>
        {["All", ...units].map(value => <option key={value}>{value}</option>)}
      </select></label></div>
    <ProtectionSummary scans={[]} profiles={profiles.length} guardrails={published.filter(item => item.kind === "Guardrail").length} onNewGuardrail={role === "User" ? onCreate : undefined} />
    <p className="nm-muted nm-live-metrics-note">Traffic metrics are not connected. Unconnected metrics display 0. Resource counts show published configurations; runtime protection is not verified.</p>
    <EnforcementList profiles={profiles} state={state} role={role} alertCounts={new Map()} onModeChange={() => {}} runtimeConnected={false}
      renderOperations={profile => <LiveProfileOperations profile={profile} state={state} bindings={bindings} onOpen={onOpen} />} />
  </>;
}

function publishedGuardrail(guardrail: Entity | undefined, profile: Entity, bindings: Record<string, NmgrBinding>) {
  if (!guardrail) return undefined;
  const pinned = bindings[`${profile.id}@${profile.deployed}`]?.publishedRefs?.[guardrail.id];
  if (!pinned) return guardrail.deployed != null ? deployedEntity(guardrail) : undefined;
  // Profiles keep the approved remote version even after a Guardrail is published again.
  const candidates = Object.keys(guardrail.revisions ?? {});
  if (guardrail.version === guardrail.deployed) candidates.push(String(guardrail.version));
  const revision = candidates.find(version => {
    const binding = bindings[`${guardrail.id}@${version}`];
    return binding && (guardrail.provider === "F5"
      ? binding.f5?.scannerId === pinned.policyId && binding.f5?.versionId === pinned.policyVersion
      : binding.policyId === pinned.policyId && binding.publishedVersion === pinned.policyVersion);
  });
  return revision ? guardrail.revisions?.[Number(revision)] ?? (Number(revision) === guardrail.version ? guardrail : undefined) : undefined;
}

function LiveProfileOperations({ profile, state, bindings, onOpen }: { profile: Entity; state: State; bindings: Record<string, NmgrBinding>; onOpen: (item: Entity) => void }) {
  return <section className="nm-dashboard-profile-operations space-y-4" aria-label={`Operations for ${profile.name}`}>
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" size="sm" disabled>Bypass Profile</Button><Button variant="outline" size="sm" disabled>Submit for approval</Button></div>
    <p className="nm-muted">Runtime control is not connected. Monitoring, Preventing and Bypass are unavailable; all traffic metrics below display 0.</p>
    <div className="nm-operation-cards" data-profile-layout="cards">
      {profile.deployedRefs.map(id => {
        const guardrail = state.entities.find(item => item.id === id && item.kind === "Guardrail");
        const published = publishedGuardrail(guardrail, profile, bindings);
        return <article key={id} className="nm-operation-card rounded-lg border bg-white" aria-label={published?.name ?? id}>
          <header className="nm-operation-card-header"><div className="min-w-0 flex-1 space-y-2">
            <strong>{published?.name ?? id}</strong><div className="flex flex-wrap gap-2 text-xs"><span className="nm-badge">{published?.provider ?? profile.provider ?? "NeMo"}</span><span className="nm-badge">Not connected</span>{!published && <span className="nm-muted">Published metadata unavailable</span>}</div>
          </div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled>Monitoring</Button><Button size="sm" variant="outline" disabled>Preventing</Button><Button size="sm" variant="outline" disabled>Bypass</Button></div></header>
          <dl className="nm-operation-card-metrics">{["Scans", "Avg response", "Error", "Detected", "Block"].map(label => <div key={label}><dt>{label}</dt><dd>{label === "Avg response" ? "0 ms" : "0"}{!["Scans", "Avg response"].includes(label) && <small>0.00%</small>}</dd></div>)}</dl>
          <div className="border-t p-4 space-y-3"><p className="nm-muted text-xs">Guardrail Bypass applies only within this Profile. Other Guardrails and Profiles are unaffected.</p>{guardrail && <Button size="sm" variant="outline" onClick={() => onOpen(guardrail)}>View Guardrail</Button>}</div>
        </article>;
      })}
      {!profile.deployedRefs.length && <p className="nm-empty">No published Guardrail references.</p>}
    </div>
    <Button variant="outline" onClick={() => onOpen(profile)}>View Profile configuration</Button>
  </section>;
}
