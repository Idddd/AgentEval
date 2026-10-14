import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDemoState } from "./demo-storage";
import { importConfigurationJson, maxImportBytes, parseConfigurationJson } from "./configuration-import";
import type { Entity } from "./model";

// Deliberately absent from the workbench navigation. This local utility is
// reachable only by entering /v2/import directly.
export function ConfigurationImportPage() {
  const [notice, setNotice] = useState("");
  const { state, ready, updateState } = useDemoState(setNotice);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Entity[] | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const upload = useRef(0);
  const message = (error: unknown) => error instanceof Error ? error.message : "Unable to import configurations.";

  function validate(value = text) {
    setError(""); setNotice(""); setPreview(null);
    try { setPreview(parseConfigurationJson(value, state)); }
    catch (error) { setError(message(error)); }
  }
  async function readFile(file: File | undefined) {
    if (!file) return;
    const request = ++upload.current;
    setReading(true); setPreview(null); setError(""); setNotice("");
    try {
      if (file.size > maxImportBytes) throw new Error("Maximum JSON file size is 1 MB.");
      const value = await file.text();
      if (request !== upload.current) return;
      setText(value); validate(value);
    } catch (error) {
      if (request === upload.current) setError(message(error));
    } finally {
      if (request === upload.current) setReading(false);
    }
  }
  function confirm() {
    if (!preview) return;
    try {
      let count = 0;
      const saved = updateState((latest) => {
        const next = importConfigurationJson(latest, text);
        count = next.entities.length - latest.entities.length;
        return next;
      }, true);
      if (!saved) {
        setNotice("");
        setError("Import was not saved. The workspace could not be read or written; existing data was retained. Refresh or enable browser storage and retry.");
        return;
      }
      setPreview(null); setError("");
      setNotice(`Imported ${count} configuration${count === 1 ? "" : "s"} as Draft. Existing records were retained.`);
    } catch (error) { setError(message(error)); }
  }
  return (
    <main className="mx-auto min-h-svh w-full max-w-4xl space-y-6 p-6 sm:p-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Import Guardrail / Profile JSON</h1>
        <p className="text-sm text-muted-foreground">Configurations are added as drafts. Existing records, approvals and active versions are retained. New Guardrails must be deployed before a referencing Profile can be approved.</p>
      </header>
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Choose JSON file
          <input aria-label="Choose JSON file" type="file" accept=".json,application/json" disabled={!ready || reading}
            onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        <p className="text-xs text-muted-foreground">Up to 1 MB and 200 configurations. Use an array, an entities array, or separate guardrails / profiles arrays. <a className="underline" href="/nmgr-import-example.json" download>Download JSON template</a></p>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Configuration JSON
          <Textarea aria-label="Configuration JSON" className="min-h-56 font-mono text-xs" value={text} disabled={reading}
            onChange={(event) => { setText(event.target.value); setPreview(null); setError(""); setNotice(""); }} />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={!ready || reading || !text.trim()} onClick={() => validate()}>{reading ? "Reading file…" : "Validate and preview"}</Button>
        </div>
      </div>
      {error && <div role="alert" className="whitespace-pre-wrap rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{error}</div>}
      {notice && <div role="status" className="rounded-lg border bg-muted p-4 text-sm">{notice}</div>}
      {preview && (
        <section aria-label="Import preview" className="space-y-4 rounded-xl border p-5">
          <h2 className="font-semibold">Preview · {preview.length} configurations</h2>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead><tr><th className="p-2">Kind</th><th className="p-2">Name / ID</th><th className="p-2">Control unit</th><th className="p-2">References</th></tr></thead>
              <tbody>{preview.map((item) => <tr key={item.id} className="border-t"><td className="p-2">{item.kind}</td><td className="p-2">{item.name}<small className="block text-muted-foreground">{item.id}</small></td><td className="p-2">{item.unit}</td><td className="p-2">{item.refs.join(", ") || "—"}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => { ++upload.current; setPreview(null); }}>Cancel preview</Button>
            <Button onClick={confirm}>Confirm import</Button>
          </div>
        </section>
      )}
      <a className="inline-block text-sm underline" href="/v2/guardrails">Back to V2</a>
    </main>
  );
}
