import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Entity, Kind, State } from "./model";

export function toDraft(e: Entity) {
  return { id: e.id, kind: e.kind, name: e.name, description: e.description, location: e.location, mandatory: e.mandatory, refs: e.refs, attributes: e.attributes, threshold: e.threshold };
}

export function LiveForm({ kind, initial, mode, state, controlUnit, busy, onCancel, onSave }: {
  kind: Kind; initial?: Entity | undefined; mode: string; state: State;
  sources: Array<"NeMo" | "F5">; controlUnit: string; busy: boolean;
  onCancel: () => void; onSave: (draft: ReturnType<typeof toDraft>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => initial ? toDraft(initial) : { id: `${kind === "Profile" ? "pf" : "gr"}-${crypto.randomUUID()}`, kind, name: "", description: "", location: "ALL", mandatory: false, refs: [] as string[], attributes: { bu: "", agent: "", data: "" }, threshold: 5 });
  const [guardQuery, setGuardQuery] = useState("");
  const guards = state.entities.filter(e => e.kind === "Guardrail" && e.deployed != null && !e.sourcePending);
  const selectedGuard = guards.find(e => draft.refs.includes(e.id));
  const profileSource = initial ? initial.provider ?? "NeMo" : selectedGuard ? selectedGuard.provider ?? "NeMo" : undefined;
  return <section className="nm-card nm-padding nm-request-page">
    <form className={`nm-form nm-create-form nm-create-${kind.toLowerCase()}`} onSubmit={event => { event.preventDefault(); if (!busy) void onSave(draft); }}>
      <fieldset disabled={busy} className="nm-live-form-fields">
        {mode === "revise" && <p className="nm-callout">Save as revision {(initial?.version ?? 0) + 1}. The published revision stays active until this revision is approved and released.</p>}
        <label>{kind} Name<Input aria-label="Name" value={draft.name} maxLength={100} required placeholder={kind === "Guardrail" ? "e.g. Customer Support - Confidential Marker Filter" : "e.g. Customer Service Assistant"} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>{kind === "Guardrail" ? "Control Intent" : "Use Case"}<Textarea aria-label={kind === "Guardrail" ? "Control intent" : "Use case"} value={draft.description} maxLength={2000} required placeholder={kind === "Guardrail" ? "Describe the risk this Guardrail should detect and the expected protection." : "Describe the application and conversations this Profile will protect."} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
        <div className="nm-create-fields nm-live-business-fields">
          <label>Control Unit<Input value={controlUnit} readOnly /></label>
          <label>Location<Input list="live-locations" value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} /><datalist id="live-locations">{["ALL", "SG", "CN", "IN", "ID", "HK", "TW"].map(location => <option key={location} value={location} />)}</datalist></label>
        </div>
        {initial && <div className="nm-live-id-field"><label>ID<Input value={draft.id} readOnly /></label><p className="nm-muted">This record ID stays fixed across revisions.</p></div>}
        {kind === "Guardrail" ? <label className="nm-check"><input type="checkbox" checked={draft.mandatory} onChange={e => setDraft({ ...draft, mandatory: e.target.checked })} />Mandatory for this location</label> :
          <fieldset className="nm-live-guardrails"><legend>Published Guardrails</legend><p className="nm-muted">The source follows the Guardrails configured by Tech. Select Guardrails from the same source.{profileSource && ` Current source: ${profileSource}.`}</p><p className="nm-muted">{draft.refs.length} selected</p>
            <Input aria-label="Search available Guardrails" placeholder="Search Guardrails…" value={guardQuery} onChange={e => setGuardQuery(e.target.value)} />
            <div className="nm-guardrail-picker-list" role="region" aria-label="Available Guardrails" tabIndex={0}>
              {!guards.length && <p className="nm-callout">No published Guardrails are available. Publish a Guardrail before creating a Profile.</p>}
              {guards.filter(e => `${e.name} ${e.id}`.toLowerCase().includes(guardQuery.toLowerCase())).map(e => <div className="nm-guardrail-picker-card rounded-lg border p-3" key={e.id}><label className="nm-check"><input type="checkbox" checked={draft.refs.includes(e.id)} disabled={!!profileSource && (e.provider ?? "NeMo") !== profileSource} onChange={event => setDraft({ ...draft, refs: event.target.checked ? [...draft.refs, e.id] : draft.refs.filter(id => id !== e.id) })} />{e.name}{e.mandatory && <span className="nm-badge">Mandatory</span>}</label><p className="nm-muted">Published v{e.deployed} · {e.provider ?? "NeMo"} · {e.location}</p><p className="nm-muted">{e.description}</p></div>)}
            </div>
          </fieldset>}
        <div className="nm-actions"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit">{busy ? "Saving…" : "Save"}</Button></div>
      </fieldset>
    </form>
  </section>;
}
