import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionField } from "./connection-field";
import { ConnectionValueStatus } from "./connection-value-status";
import { BrowserOriginsSettings } from "./browser-origins-settings";
import type { ConnectionValues } from "./connection-values";
import { runtimeRequest } from "@/lib/runtime-request";
import { downloadJson } from "@/lib/file-download";
import "./connection-setup.css";

type Field =
  | "nemoUrl"
  | "nemoToken"
  | "databaseUrl"
  | "workspaceId"
  | "caPem"
  | "f5Url"
  | "f5Token"
  | "f5AdminIds"
  | "evaluationUrl";
type Option = "databaseTls" | "caMode" | "f5Mode" | "nemoTls" | "f5Tls" | "evaluationTls";
type Probe = "nemoUrl" | "nemoToken" | "databaseUrl" | "f5Url" | "f5Token" | "evaluationUrl";
const probeFields: Record<Probe, Array<Field | Option>> = {
  nemoUrl: ["nemoUrl", "nemoTls", "caMode", "caPem"],
  nemoToken: ["nemoUrl", "nemoToken", "nemoTls", "caMode", "caPem"],
  databaseUrl: ["databaseUrl", "databaseTls", "caMode", "caPem"],
  f5Url: ["f5Url", "f5Tls", "f5Mode", "caMode", "caPem"],
  f5Token: ["f5Url", "f5Token", "f5Tls", "f5Mode", "caMode", "caPem"],
  evaluationUrl: ["evaluationUrl", "evaluationTls", "caMode", "caPem"],
};
type EvaluationLog = {
  time: string; action: "test" | "save" | "restore" | "start"; status: number; durationMs: number; requestId: string; code?: string;
  stage?: keyof typeof evaluationStages; message?: string; upstreamStatus?: number; contentType?: string; networkCode?: string;
};
const evaluationActions = { test: "Test connection", save: "Save connection", restore: "Use deployment URL", start: "Start evaluation" };
const evaluationStages = {
  configuration: "Configuration", destination: "Blocked before request", network: "Network or TLS",
  upstream: "Upstream HTTP", response: "Response validation", completed: "Completed",
};
type Status = {
  values?: ConnectionValues;
  saved?: boolean;
  configured?: Partial<Record<Field, boolean>>;
  connectionRevision?: string;
  manualConfiguration?: boolean;
  persistence?: string;
  advanced?: Partial<Record<Option, string>>;
  evaluationLogs?: EvaluationLog[];
  evaluationPolicy?: { manualSetup?: boolean; deploymentUrl: "missing" | "invalid" | "configured"; approvedAlternates: number; invalidAlternates: number; tokenPinned: boolean };
};
const fields: Array<{ key: Field; label: string; hint: string }> = [
  {
    key: "nemoUrl",
    label: "NeMo URL",
    hint: "Controller API address ending in /api/v1. Enter a Token when changing this address.",
  },
  {
    key: "nemoToken",
    label: "NeMo Token",
    hint: "Business API token, without the Bearer prefix",
  },
  {
    key: "databaseUrl",
    label: "Database URL",
    hint: "PostgreSQL or MariaDB connection URL including credentials",
  },
  {
    key: "workspaceId",
    label: "Workspace ID",
    hint: "Default: uat. Use 1–24 lowercase letters, numbers or hyphens.",
  },
  {
    key: "caPem",
    label: "Trusted CA certificate",
    hint: "PEM certificate bundle for verified NeMo, F5, Evaluate and database TLS connections.",
  },
  {
    key: "f5Url",
    label: "F5 URL",
    hint: "Optional HTTPS address ending in /backend/v1. Enter a Token when changing this address.",
  },
  {
    key: "f5Token",
    label: "F5 Token",
    hint: "F5 backend API token, without the Bearer prefix",
  },
  {
    key: "f5AdminIds",
    label: "F5 project admin IDs",
    hint: "Comma-separated F5 user IDs, when required by your token for project creation",
  },
  {
    key: "evaluationUrl",
    label: "Evaluate URL",
    hint: "Enter the service URL or its /api/v1/evaluations address. Token and project, if required, are managed by the deployment.",
  },
];
const emptyValues: Record<Field, string> = {
  nemoUrl: "",
  nemoToken: "",
  databaseUrl: "",
  workspaceId: "",
  caPem: "",
  f5Url: "",
  f5Token: "",
  f5AdminIds: "",
  evaluationUrl: "",
};
const emptyOptions: Record<Option, string> = {
  nemoTls: "",
  evaluationTls: "",
  f5Tls: "",
  databaseTls: "",
  caMode: "",
  f5Mode: "",
};

export function ConnectionSetup({
  initialError = "",
  onConnected,
  onRetry,
  onCancel,
  retryLabel = "Retry",
}: {
  initialError?: string;
  onConnected: () => void;
  onRetry: () => void;
  onCancel?: () => void;
  retryLabel?: string;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [testing, setTesting] = useState<Probe | null>(null);
  const [savingEvaluation, setSavingEvaluation] = useState<"save" | "restore" | null>(null);
  const [backupAction, setBackupAction] = useState<"export" | "import" | null>(null);
  const [backupNotice, setBackupNotice] = useState("");
  const backupInput = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<Partial<Record<Probe, { ok: boolean; message: string }>>>({});
  const [values, setValues] = useState(emptyValues),
    [options, setOptions] = useState(emptyOptions);
  const working = busy || !!testing || !!savingEvaluation || !!backupAction;
  useEffect(() => {
    let active = true;
    runtimeRequest<Status>("/api/nmgr/connection", { cache: "no-store" })
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((e) => {
        if (active && !initialError) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function apply(remove = false) {
    if (working) return;
    setBusy(true);
    setError("");
    try {
      await runtimeRequest<Status>("/api/nmgr/connection", {
        method: remove ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(status?.connectionRevision
            ? { "X-Marketplace-Connection": status.connectionRevision }
            : {}),
        },
        ...(!remove
          ? {
              body: JSON.stringify(
                Object.fromEntries(
                  Object.entries({ ...values, ...options }).filter(
                    ([key, value]) => key !== "evaluationUrl" && !!value.trim(),
                  ),
                ),
              ),
            }
          : {}),
      });
      setValues(emptyValues);
      setOptions(emptyOptions);
      onConnected();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Connection could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function refreshStatus() {
    setLoading(true);
    setResults({});
    try {
      setStatus(await runtimeRequest<Status>("/api/nmgr/connection", { cache: "no-store" }));
      setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not read configuration status."); }
    finally { setLoading(false); }
  }
  async function test(target: Probe) {
    if (working) return;
    setTesting(target);
    setResults(current => ({ ...current, [target]: undefined }));
    try {
      const entered = { ...values, ...options };
      const result = await runtimeRequest<{ message: string; durationMs: number }>("/api/nmgr/connection/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(status?.connectionRevision ? { "X-Marketplace-Connection": status.connectionRevision } : {}) },
        body: JSON.stringify({ target, settings: Object.fromEntries(probeFields[target].filter(key => entered[key].trim()).map(key => [key, entered[key]])) }),
      });
      setResults(current => ({ ...current, [target]: { ok: true, message: `${result.message} (${result.durationMs} ms)` } }));
    } catch (error) {
      setResults(current => ({ ...current, [target]: { ok: false, message: error instanceof Error ? error.message : "Connection test failed." } }));
    } finally {
      if (target === "evaluationUrl") {
        // Keep the test result even if refreshing the optional log fails.
        try {
          const next = await runtimeRequest<Status>("/api/nmgr/connection", { cache: "no-store" });
          setStatus(next);
        } catch { /* The preceding result is still valid. */ }
      }
      setTesting(null);
    }
  }
  async function updateEvaluation(restore = false) {
    if (working || (!restore && !values.evaluationUrl.trim())) return;
    setSavingEvaluation(restore ? "restore" : "save");
    setResults(current => {
      const next = { ...current };
      delete next.evaluationUrl;
      return next;
    });
    try {
      await runtimeRequest<Status>("/api/nmgr/connection/evaluation", {
        method: restore ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json", ...(status?.connectionRevision ? { "X-Marketplace-Connection": status.connectionRevision } : {}) },
        ...(!restore ? { body: JSON.stringify({ evaluationUrl: values.evaluationUrl.trim(), ...(options.evaluationTls && { evaluationTls: options.evaluationTls }) }) } : {}),
      });
      setValues(current => ({ ...current, evaluationUrl: "" }));
      setOptions(current => ({ ...current, evaluationTls: "" }));
      setResults(current => ({ ...current, evaluationUrl: { ok: true, message: restore ? (status?.evaluationPolicy?.manualSetup ? "Saved Evaluate URL cleared." : "Saved fallback cleared. See the deployment URL below.") : "Evaluate URL verified and saved. It is now active for this workspace." } }));
    } catch (error) {
      setResults(current => ({ ...current, evaluationUrl: { ok: false, message: error instanceof Error ? error.message : "Evaluate settings could not be updated." } }));
    } finally {
      try { setStatus(await runtimeRequest<Status>("/api/nmgr/connection", { cache: "no-store" })); }
      catch { /* Retain the response from the update. */ }
      setSavingEvaluation(null);
    }
  }
  async function transferBackup(action: "export" | "import", file?: File) {
    if (working || (action === "import" && !file)) return;
    setBackupAction(action);
    setBackupNotice("");
    setError("");
    try {
      if (file && file.size > 165_000) throw new Error("The connection backup JSON exceeds the size limit.");
      const body = file ? await file.text() : undefined;
      const result = await runtimeRequest("/api/nmgr/connection/backup", {
        method: file ? "POST" : "GET",
        cache: "no-store",
        headers: {
          ...(file ? { "Content-Type": "application/json" } : {}),
          ...(status?.connectionRevision ? { "X-Marketplace-Connection": status.connectionRevision } : {}),
        },
        ...(body !== undefined ? { body } : {}),
      });
      if (file) {
        setValues(emptyValues);
        setOptions(emptyOptions);
        onConnected();
      } else {
        downloadJson(result, "marketplace-connection-backup.json");
        setBackupNotice("Saved connection settings exported.");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not import or export the connection backup.");
    } finally {
      setBackupAction(null);
    }
  }
  const disabled = working || loading || status?.manualConfiguration === false;
  const evaluationOverride = status?.values?.evaluationUrl;
  const field = (key: Field) => {
    const definition = fields.find((item) => item.key === key)!;
    return (
      <ConnectionField
        key={key}
        field={key}
        label={definition.label}
        hint={definition.hint}
        value={values[key]}
        configured={status?.configured?.[key]}
        disabled={disabled}
        loading={loading}
        multiline={key === "caPem"}
        onChange={(value) => {
          setValues((current) => ({ ...current, [key]: value }));
          setResults({});
        }}
      >
        <ConnectionValueStatus value={status?.values?.[key]} />
        {key === "databaseUrl" && <ConnectionValueStatus value={status?.values?.databasePassword} />}
        {key in probeFields && <div className="nm-connection-probe">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void test(key as Probe)}>
            {testing === key ? "Testing…" : `Test ${definition.label}`}
          </Button>
          {results[key as Probe] && <pre role={results[key as Probe]!.ok ? "status" : "alert"} className={`nm-connection-result ${results[key as Probe]!.ok ? "is-success" : "is-error"}`}>
            {results[key as Probe]!.message}
          </pre>}
        </div>}
      </ConnectionField>
    );
  };
  const choice = (
    key: Option,
    label: string,
    choices: Array<[string, string]>,
  ) => (
    <label className="nm-connection-option">
      <span>{label}</span>
      <select
        aria-label={label}
        value={options[key]}
        disabled={disabled}
        onChange={(event) => {
          setOptions((current) => ({ ...current, [key]: event.target.value }));
          setResults({});
        }}
      >
        <option value="">
          Keep current ({status?.advanced?.[key] ?? "deployment default"})
        </option>
        {choices.map(([value, name]) => (
          <option key={value} value={value}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  const tlsChoices: Array<[string, string]> = [
    ["skip", "Skip verification (demo default)"],
    ["verify", "Verify certificate"],
  ];
  const caMode = options.caMode || status?.advanced?.caMode;
  const f5Mode = options.f5Mode || status?.advanced?.f5Mode;
  return (
    <main className="nm-app nm-live-login nm-connection-login">
      <section className="nm-card nm-padding nm-live-panel">
        <header className="nm-connection-title">
          <span>
            <Settings2 size={22} aria-hidden="true" />
          </span>
          <div>
            <h1>Marketplace V3</h1>
            <p className="nm-muted">Demo integration connection</p>
          </div>
        </header>
        <div className="nm-connection-probe">
          <Button type="button" variant="outline" size="sm" disabled={loading || working} onClick={() => void refreshStatus()}>Refresh configuration status</Button>
          <p className="nm-muted">Values received by this server. Tokens are masked; read success does not confirm authentication. Test the connection to verify.</p>
        </div>
        {error && (
          <p role="alert" className="nm-callout nm-connection-error">
            {error}
          </p>
        )}
        <form
          className="nm-connection-form"
          onSubmit={(event) => {
            event.preventDefault();
            void apply();
          }}
          autoComplete="off"
        >
          <fieldset className="nm-connection-group">
            <legend>NeMo connection</legend>
            {field("nemoUrl")}
            {choice("nemoTls", "NeMo certificate verification", tlsChoices)}
            {field("nemoToken")}
          </fieldset>
          <fieldset className="nm-connection-group">
            <legend>F5 connection</legend>
            {choice("f5Mode", "F5 integration", [
              ["disabled", "Disabled — NeMo only"],
              ["enabled", "Enabled"],
            ])}
            {f5Mode === "enabled" ? <>
              {field("f5Url")}
              {choice("f5Tls", "F5 certificate verification", tlsChoices)}
              {field("f5Token")}
              {field("f5AdminIds")}
            </> : <>
              <p className="nm-muted">Enable F5 to configure its URL and API token.</p>
              <ConnectionValueStatus value={status?.values?.f5Url} />
              <ConnectionValueStatus value={status?.values?.f5Token} />
            </>}
          </fieldset>
          <fieldset className="nm-connection-group">
            <legend>Independent Evaluate</legend>
            {field("evaluationUrl")}
            {choice("evaluationTls", "Evaluate certificate verification", tlsChoices)}
            {status?.manualConfiguration !== false && <>
              {status?.evaluationPolicy && !status.evaluationPolicy.manualSetup && <p className="nm-muted">
                Deployment Evaluate URL {status.evaluationPolicy.deploymentUrl} · {status.evaluationPolicy.approvedAlternates} approved fallback addresses
                {status.evaluationPolicy.invalidAlternates ? ` · ${status.evaluationPolicy.invalidAlternates} invalid entries` : ""}
                {status.evaluationPolicy.tokenPinned ? " · Token restricted to the deployment URL" : ""}
              </p>}
              <p className="nm-muted">{evaluationOverride?.overridden
                ? evaluationOverride.effective.status === "invalid" ? "Saved fallback is no longer allowed. Restore the deployment URL or save another approved address." : "Using the saved Evaluate URL."
                : status?.evaluationPolicy?.manualSetup ? "Enter the HTTPS service hostname or API base on port 443, then test and save." : "Using deployment settings. Enter an approved URL to test and save a manual fallback."}</p>
              <div className="nm-actions">
                <Button type="button" variant="outline" size="sm" disabled={disabled || !values.evaluationUrl.trim()} onClick={() => void updateEvaluation()}>
                  {savingEvaluation === "save" ? "Saving Evaluate…" : status?.evaluationPolicy?.manualSetup ? "Save Evaluate URL" : "Save Evaluate fallback"}
                </Button>
                {evaluationOverride?.overridden && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => void updateEvaluation(true)}>
                  {savingEvaluation === "restore" ? "Restoring…" : "Use deployment Evaluate URL"}
                </Button>}
              </div>
            </>}
            {status?.manualConfiguration !== false && <p className="nm-muted">Shared Demo: anyone who can access this workspace can run evaluations and view its reports. Use a dedicated test project.</p>}
            {status?.manualConfiguration !== false && <details className="nm-evaluation-log">
              <summary>Evaluate activity log{status?.evaluationLogs?.length ? ` · ${status.evaluationLogs.length}` : ""}</summary>
              {!status?.evaluationLogs?.length ? <p className="nm-muted">No events on this server yet.</p> : <ul aria-label="Evaluate activity">
                {status.evaluationLogs.map((entry, index) => <li key={`${entry.requestId}:${index}`}>
                  <strong>{evaluationActions[entry.action]}</strong>
                  <span className={entry.status < 400 ? "nm-connection-configured" : "nm-connection-value-error"}>{entry.status < 400 ? "Success" : "Failed"} · Marketplace HTTP {entry.status} · {entry.durationMs} ms</span>
                  {entry.stage && <small>{evaluationStages[entry.stage]}{entry.upstreamStatus ? ` · Upstream HTTP ${entry.upstreamStatus}` : ""}{entry.contentType ? ` · ${entry.contentType}` : ""}{entry.networkCode ? ` · ${entry.networkCode}` : ""}</small>}
                  {entry.message && <small>{entry.message}</small>}
                  <small>{new Date(entry.time).toLocaleString()} · <code>{entry.requestId}</code>{entry.code ? ` · ${entry.code}` : ""}</small>
                </li>)}
              </ul>}
            </details>}
          </fieldset>
          <fieldset className="nm-connection-group">
            <legend>Database connection</legend>
            {field("databaseUrl")}
          </fieldset>
          <details className="nm-connection-advanced">
            <summary>Advanced settings (optional)</summary>
            <div className="nm-connection-form">
              <p className="nm-muted">
                Configure workspace identity and trusted certificates for your environment.
              </p>
              {field("workspaceId")}
              {choice("databaseTls", "Database TLS", [
                ["url", "Use database URL settings"],
                ["true", "Require verified TLS"],
              ])}
              {choice("caMode", "Trusted CA", [
                ["system", "Use built-in trusted certificates"],
                ["custom", "Add a trusted CA certificate"],
              ])}
              {caMode === "custom" && field("caPem")}
              {status?.manualConfiguration === false && <BrowserOriginsSettings />}
            </div>
          </details>
          {status?.manualConfiguration === true && <fieldset className="nm-connection-group">
            <legend>Connection backup</legend>
            <p className="nm-muted">Export saved manual settings as encrypted JSON. Import validates the backup and replaces saved settings. Use an instance with the same connection key.</p>
            <input ref={backupInput} hidden type="file" accept=".json,application/json" aria-label="Choose connection backup JSON"
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void transferBackup("import", file);
              }} />
            <div className="nm-actions">
              <Button type="button" size="sm" variant="outline" disabled={disabled || !status.saved} onClick={() => void transferBackup("export")}>
                {backupAction === "export" ? "Exporting…" : "Export saved JSON"}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => backupInput.current?.click()}>
                {backupAction === "import" ? "Checking backup…" : "Import connection JSON"}
              </Button>
            </div>
            {backupNotice && <p role="status">{backupNotice}</p>}
          </fieldset>}
          <p className="nm-connection-note nm-muted">
            Saved for all users of this demo instance. Secret and YAML values
            are not overwritten.{" "}
            {status?.persistence === "persistent"
              ? "Persistent storage is enabled."
              : "To retain saved settings after this Pod is replaced, mount persistent connection storage."}
          </p>
          <div className="nm-actions">
            <Button type="submit" disabled={disabled}>
              {busy ? "Checking connection…" : "Save & connect"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={onRetry}
            >
              {retryLabel}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                disabled={working}
                onClick={onCancel}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
        <div className="nm-connection-footer">
          {status?.saved && (
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => void apply(true)}
            >
              Use deployment settings
            </Button>
          )}
          <a href="/v2/guardrails" className="underline">
            Open Mock workspace
          </a>
          <a href="/api/docs" className="underline">API documentation</a>
        </div>
      </section>
    </main>
  );
}
