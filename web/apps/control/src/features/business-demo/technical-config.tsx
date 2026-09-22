import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// Field names and enum values mirror the local Guard programmablePolicyDraftSchema
// and F5 custom scanner API. This form stores a mock draft, never runs evaluation.
const requiredText = z.string().trim().min(1);
const railSchema = z.object({
  rail_type: z.enum(["input", "output"]), flow_name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  execution_mode: z.enum(["detect", "mutate"]),
  on_unsafe: z.enum(["pass", "redact", "rewrite", "regenerate", "redirect", "reject", "fallback", "clarify"]),
  timeout_ms: z.number().int().min(1).max(120000), failure_mode: z.enum(["fail_open", "fail_closed"]),
  required: z.boolean(),
});
const nemoSchema = z.object({
  colang_version: z.enum(["1.0", "2.x"]),
  sources: z.array(z.object({ path: requiredText, content: requiredText })).min(1),
  rail_bindings: z.array(railSchema).min(1),
  parameter_schema: z.array(z.object({ name: requiredText, kind: z.enum(["string", "number", "boolean", "secret"]), required: z.boolean(), default: z.string().nullable(), description: z.string() })),
  action_references: z.array(z.object({ name: requiredText, version: requiredText })),
  model_dependencies: z.array(requiredText), prompt_dependencies: z.array(requiredText),
});
const f5Schema = z.object({ direction: z.literal("both"), version: z.object({ name: requiredText, description: z.string() }), config: z.discriminatedUnion("type", [
  z.object({ type: z.literal("custom"), input: requiredText }),
  z.object({ type: z.literal("regex"), pattern: requiredText }),
  z.object({ type: z.literal("keyword"), words: z.array(requiredText).min(1) }),
]) });
export type NemoConfig = z.infer<typeof nemoSchema>;
export type F5Config = z.infer<typeof f5Schema>;
const newRail = (): NemoConfig["rail_bindings"][number] => ({ rail_type: "input", flow_name: "", execution_mode: "detect", on_unsafe: "reject", timeout_ms: 2000, failure_mode: "fail_closed", required: true });
export function defaultTechnicalConfig(source: string) {
  return JSON.stringify(source === "F5" ? { direction: "both", version: { name: "v1", description: "" }, config: { type: "custom", input: "" } } : { colang_version: "2.x", sources: [{ path: "policy.co", content: "" }], rail_bindings: [newRail()], parameter_schema: [], action_references: [], model_dependencies: [], prompt_dependencies: [] });
}
export function technicalConfigError(source: string, value: string): string | null {
  try {
    const parsed = JSON.parse(value);
    const result = (source === "F5" ? f5Schema : nemoSchema).safeParse(parsed);
    if (!result.success) return `${source === "Guard" ? "Nemo" : "F5"}: complete ${result.error.issues[0]?.path.join(" → ")} with a valid value.`;
    return null;
  } catch { return `${source === "Guard" ? "Nemo" : "F5"}: complete the technical configuration form.`; }
}
function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm">{label}<select className="h-10 min-w-0 rounded-md border bg-white px-3" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
function Field({ label, value, onChange, number = false }: { label: string; value: string | number; onChange: (value: string) => void; number?: boolean }) {
  return <label className="grid gap-2 text-sm">{label}<Input type={number ? "number" : "text"} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
export function TechnicalConfigForm({ source, value, onChange, disabled = false }: { source: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  let data: NemoConfig | F5Config;
  let legacy = false;
  try { data = JSON.parse(value); if (!data || (source === "F5" ? !("config" in data) : !("rail_bindings" in data))) throw new Error(); }
  catch { data = JSON.parse(defaultTechnicalConfig(source)); legacy = !!value; }
  const save = (next: NemoConfig | F5Config) => onChange(JSON.stringify(next));
  if (source === "F5") {
    const cfg = data as F5Config;
    return <fieldset disabled={disabled} className="space-y-4 rounded-md border p-4"><legend className="px-1 font-medium">F5 configuration</legend>
      {legacy && <details className="text-xs text-amber-700"><summary>Previous configuration notes</summary><p className="mt-2 whitespace-pre-wrap">{value}</p></details>}
      <Select label="Scanner type" value={cfg.config.type} options={["custom", "regex", "keyword"]} onChange={(type) => save({ ...cfg, config: type === "regex" ? { type, pattern: "" } : type === "keyword" ? { type, words: [] } : { type: "custom", input: "" } })} />
      {cfg.config.type === "custom" && <Field label="Detection description (GenAI)" value={cfg.config.input} onChange={(input) => save({ ...cfg, config: { type: "custom", input } })} />}
      {cfg.config.type === "regex" && <Field label="Regex pattern" value={cfg.config.pattern} onChange={(pattern) => save({ ...cfg, config: { type: "regex", pattern } })} />}
      {cfg.config.type === "keyword" && <Field label="Keywords (comma separated)" value={cfg.config.words.join(",")} onChange={(words) => save({ ...cfg, config: { type: "keyword", words: words.split(",") } })} />}
      <Field label="Version name" value={cfg.version.name} onChange={(name) => save({ ...cfg, version: { ...cfg.version, name } })} />
      <Field label="Version description" value={cfg.version.description} onChange={(description) => save({ ...cfg, version: { ...cfg.version, description } })} />
    </fieldset>;
  }
  const cfg = data as NemoConfig;
  return <fieldset disabled={disabled} className="space-y-5 rounded-md border p-4"><legend className="px-1 font-medium">Nemo configuration</legend>
    {legacy && <details className="text-xs text-amber-700"><summary>Previous configuration notes</summary><p className="mt-2 whitespace-pre-wrap">{value}</p></details>}
    <Select label="Colang version" value={cfg.colang_version} options={["1.0", "2.x"]} onChange={(v) => save({ ...cfg, colang_version: v as NemoConfig["colang_version"] })} />
    <section className="space-y-3"><h4 className="text-sm font-medium">Source files</h4>{cfg.sources.map((file, i) => <div key={i} className="space-y-3 rounded border p-3"><Field label="File path" value={file.path} onChange={(path) => save({ ...cfg, sources: cfg.sources.map((s, n) => n === i ? { ...s, path } : s) })} /><label className="grid gap-2 text-sm">Colang source<Textarea className="min-h-32 font-mono text-xs" value={file.content} onChange={(e) => save({ ...cfg, sources: cfg.sources.map((s, n) => n === i ? { ...s, content: e.target.value } : s) })} /></label><Button variant="ghost" onClick={() => save({ ...cfg, sources: cfg.sources.filter((_, n) => n !== i) })}>Remove file</Button></div>)}<Button variant="outline" onClick={() => save({ ...cfg, sources: [...cfg.sources, { path: "", content: "" }] })}>Add file</Button></section>
    <section className="space-y-3"><h4 className="text-sm font-medium">Rail bindings</h4>{cfg.rail_bindings.map((rail, i) => {
      const patch = (update: Partial<typeof rail>) => save({ ...cfg, rail_bindings: cfg.rail_bindings.map((r, n) => n === i ? { ...r, ...update } : r) });
      return <div key={i} className="grid gap-3 rounded border p-3 sm:grid-cols-2">
        <Select label="Rail" value={rail.rail_type} options={["input", "output"]} onChange={(rail_type) => patch({ rail_type: rail_type as typeof rail.rail_type })} />
        <Field label="Flow name" value={rail.flow_name} onChange={(flow_name) => patch({ flow_name })} />
        <Select label="Execution mode" value={rail.execution_mode} options={["detect", "mutate"]} onChange={(v) => patch({ execution_mode: v as typeof rail.execution_mode })} />
        <Select label="On unsafe" value={rail.on_unsafe} options={["pass", "redact", "rewrite", "regenerate", "redirect", "reject", "fallback", "clarify"]} onChange={(v) => patch({ on_unsafe: v as typeof rail.on_unsafe })} />
        <Field label="Timeout (ms)" number value={rail.timeout_ms} onChange={(v) => patch({ timeout_ms: Number(v) })} />
        <Select label="Failure mode" value={rail.failure_mode} options={["fail_open", "fail_closed"]} onChange={(v) => patch({ failure_mode: v as typeof rail.failure_mode })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rail.required} onChange={(e) => patch({ required: e.target.checked })} />Required</label>
        <Button variant="ghost" onClick={() => save({ ...cfg, rail_bindings: cfg.rail_bindings.filter((_, n) => n !== i) })}>Remove rail</Button>
      </div>;
    })}<Button variant="outline" onClick={() => save({ ...cfg, rail_bindings: [...cfg.rail_bindings, newRail()] })}>Add rail</Button></section>
    <details className="space-y-3"><summary className="cursor-pointer text-sm font-medium">Parameters and dependencies</summary>
      {cfg.parameter_schema.map((param, i) => {
        const patch = (update: Partial<typeof param>) => save({ ...cfg, parameter_schema: cfg.parameter_schema.map((p, n) => n === i ? { ...p, ...update } : p) });
        return <div key={i} className="grid gap-3 rounded border p-3 sm:grid-cols-2"><Field label="Parameter name" value={param.name} onChange={(name) => patch({ name })} /><Select label="Parameter type" value={param.kind} options={["string", "number", "boolean", "secret"]} onChange={(v) => patch({ kind: v as typeof param.kind, default: null })} />{param.kind !== "secret" && <Field label="Default value" value={param.default ?? ""} onChange={(v) => patch({ default: v })} />}<Field label="Parameter description" value={param.description} onChange={(description) => patch({ description })} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={param.required} onChange={(e) => patch({ required: e.target.checked })} />Required parameter</label><Button variant="ghost" onClick={() => save({ ...cfg, parameter_schema: cfg.parameter_schema.filter((_, n) => n !== i) })}>Remove parameter</Button></div>;
      })}<Button variant="outline" onClick={() => save({ ...cfg, parameter_schema: [...cfg.parameter_schema, { name: "", kind: "string", required: false, default: null, description: "" }] })}>Add parameter</Button>
      {cfg.action_references.map((action, i) => <div key={i} className="grid gap-3 sm:grid-cols-2"><Field label="Action name" value={action.name} onChange={(name) => save({ ...cfg, action_references: cfg.action_references.map((a, n) => n === i ? { ...a, name } : a) })} /><Field label="Action version" value={action.version} onChange={(version) => save({ ...cfg, action_references: cfg.action_references.map((a, n) => n === i ? { ...a, version } : a) })} /><Button variant="ghost" onClick={() => save({ ...cfg, action_references: cfg.action_references.filter((_, n) => n !== i) })}>Remove action</Button></div>)}
      <Button variant="outline" onClick={() => save({ ...cfg, action_references: [...cfg.action_references, { name: "", version: "" }] })}>Add action</Button>
      <Field label="Model dependencies (comma separated)" value={cfg.model_dependencies.join(",")} onChange={(v) => save({ ...cfg, model_dependencies: v ? v.split(",") : [] })} />
      <Field label="Prompt dependencies (comma separated)" value={cfg.prompt_dependencies.join(",")} onChange={(v) => save({ ...cfg, prompt_dependencies: v ? v.split(",") : [] })} />
    </details>
  </fieldset>;
}
