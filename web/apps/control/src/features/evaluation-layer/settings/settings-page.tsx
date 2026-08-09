import { useState, type FormEvent } from "react";
import { CheckCircle2, Database, FlaskConical, Orbit, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEvaluationLayerState, useEvaluationLayerStore } from "../mock-provider";
import { EvaluationLayerStatusBadge } from "../shared/evaluation-status";
import { EvaluationSection, KeyValueGrid } from "../shared/evaluation-ui";

export function EvaluationSettingsPage() {
  const state = useEvaluationLayerState();
  const store = useEvaluationLayerStore();
  const [form, setForm] = useState(state.settings);
  const [tested, setTested] = useState(false);
  const [message, setMessage] = useState("Not tested in this UI session");
  const update = (field: "provider" | "baseUrl" | "model" | "apiKey", value: string) => { setForm((current) => { const { testFingerprint: _fingerprint, ...rest } = current; return { ...rest, [field]: value, testOutcome: "NOT_TESTED" }; }); setTested(false); setMessage("Settings changed — test again"); };
  const test = () => { store.saveSettings(form); const result = store.testSettingsConnection(); if (result.ok) { setTested(true); setMessage(`Connection succeeded in ${result.value.latencyMs} ms`); setForm(store.getState().settings); } };
  const save = (event: FormEvent) => { event.preventDefault(); if (!tested) return; store.saveSettings(form); setMessage("Saved for this mock session"); };
  return <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]"><EvaluationSection title="Service status" description="All status values are frontend-only demo fixtures."><div className="grid gap-3">{[[Orbit, "LLM", tested ? "Connected" : "Not tested"], [PlugZap, "Langfuse", "Recorded demo"], [Database, "Database", "Fixture memory"], [FlaskConical, "Demo fixture", "Loaded"]].map(([Icon, label, value]) => { const StatusIcon = Icon as typeof Orbit; return <div key={String(label)} className="flex items-center justify-between rounded-md border p-4"><span className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-md bg-muted"><StatusIcon className="size-4" /></span><span><span className="block font-medium">{String(label)}</span><span className="text-xs text-muted-foreground">{String(value)}</span></span></span><EvaluationLayerStatusBadge status={label === "LLM" && !tested ? "NOT_TESTED" : "SUCCESS"} /></div>; })}</div></EvaluationSection><EvaluationSection title="Judge provider" description="Configure the recorded judge UI. Nothing is transmitted or saved to browser storage."><form onSubmit={save} className="grid gap-5"><Label data-evaluation-settings-field="Provider" className="grid gap-2">Provider<Input value={form.provider} onChange={(event) => update("provider", event.target.value)} /></Label><Label data-evaluation-settings-field="Base URL" className="grid gap-2">Base URL<Input value={form.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} /></Label><Label data-evaluation-settings-field="Model" className="grid gap-2">Model<Input value={form.model} onChange={(event) => update("model", event.target.value)} /></Label><Label data-evaluation-settings-field="API key" className="grid gap-2">API key<Input type="password" autoComplete="off" value={form.apiKey} placeholder="Stored only in memory" onChange={(event) => update("apiKey", event.target.value)} /></Label><KeyValueGrid items={[["Test outcome", tested ? <span className="inline-flex items-center gap-2 text-emerald-700"><CheckCircle2 className="size-4" />Success</span> : "Not tested"], ["Feedback", message], ["Fingerprint", form.testFingerprint ?? "Not available"]]} /><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={test}>Test connection</Button><Button type="submit" disabled={!tested}>Save and use</Button></div></form></EvaluationSection></div>;
}
