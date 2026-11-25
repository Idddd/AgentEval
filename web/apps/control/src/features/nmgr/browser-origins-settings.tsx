import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { runtimeRequest } from "@/lib/runtime-request";
import { downloadJson } from "@/lib/file-download";

type OriginSettings = {
  origins: string[];
  deploymentOrigins: string[];
  source: "deployment" | "saved";
};

export function BrowserOriginsSettings() {
  const [token, setToken] = useState("");
  const [origins, setOrigins] = useState("");
  const [settings, setSettings] = useState<OriginSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const importInput = useRef<HTMLInputElement>(null);

  async function update(method: "GET" | "PUT" | "DELETE", file?: File) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let nextOrigins = origins.split("\n").map(line => line.trim()).filter(Boolean);
      if (file) {
        if (file.size > 18_000) throw new Error("The browser origins JSON exceeds the size limit.");
        const backup = JSON.parse(await file.text());
        if (backup?.format !== "marketplace-browser-origins" || backup.version !== 1 ||
          !Array.isArray(backup.origins) || backup.origins.some((value: unknown) => typeof value !== "string"))
          throw new Error("Choose a JSON file exported from Allowed browser origins.");
        nextOrigins = backup.origins;
      }
      const result = await runtimeRequest<OriginSettings>("/api/nmgr/connection/allowed-origins", {
        method,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
        },
        ...(method === "PUT" ? { body: JSON.stringify({ origins: nextOrigins }) } : {}),
      });
      setOrigins(result.origins.join("\n"));
      setSettings(result);
      setMessage({
        GET: "Allowed origins loaded.",
        PUT: "Allowed origins saved.",
        DELETE: "Deployment origins restored.",
      }[method]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read or save allowed origins.");
    } finally {
      setBusy(false);
    }
  }

  return <fieldset className="nm-connection-group">
    <legend>Allowed browser origins</legend>
    <p className="nm-muted">Allow an external frontend to call the Marketplace resource API with a user Bearer token.</p>
    <label className="nm-connection-option">
      <span>Tech user token</span>
      <Input type="password" autoComplete="off" value={token} disabled={busy} onChange={event => {
        setToken(event.target.value);
        setSettings(null);
      }} />
    </label>
    <label className="nm-connection-option">
      <span>Allowed frontend origins</span>
      <Textarea rows={4} value={origins} disabled={!settings || busy} placeholder="https://portal.example.internal"
        onChange={event => setOrigins(event.target.value)} />
    </label>
    <p className="nm-muted">Enter one HTTPS origin per line, including any non-default port. Save an empty list to revoke access.</p>
    {settings && <p className="nm-muted">
      {settings.source === "deployment" ? "Using deployment settings." : "Using a saved override."}
    </p>}
    {settings?.source === "saved" && <p className="nm-muted">Deployment origins: {settings.deploymentOrigins.join(", ") || "None"}</p>}
    <div className="nm-actions">
      <Button type="button" size="sm" variant="outline" disabled={busy || !token.trim()} onClick={() => void update("GET")}>Load allowed origins</Button>
      <Button type="button" size="sm" disabled={busy || !settings || !token.trim()} onClick={() => void update("PUT")}>Save allowed origins</Button>
      {settings?.source === "saved" && <Button type="button" size="sm" variant="outline" disabled={busy || !token.trim()} onClick={() => void update("DELETE")}>Restore deployment origins</Button>}
    </div>
    <div className="nm-actions">
      <input ref={importInput} hidden type="file" accept=".json,application/json" aria-label="Choose allowed origins JSON"
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void update("PUT", file);
        }} />
      <Button type="button" size="sm" variant="outline" disabled={busy || !settings} onClick={() => {
        if (settings) downloadJson({ format: "marketplace-browser-origins", version: 1, origins: settings.origins }, "marketplace-allowed-origins.json");
      }}>Export origins JSON</Button>
      <Button type="button" size="sm" variant="outline" disabled={busy || !token.trim()} onClick={() => importInput.current?.click()}>Import origins JSON</Button>
    </div>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="nm-callout nm-connection-error">{error}</p>}
  </fieldset>;
}
