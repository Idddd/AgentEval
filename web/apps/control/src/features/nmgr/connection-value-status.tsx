import type { ConnectionValue, ConnectionValuePair } from "./connection-values";

const labels: Record<ConnectionValue["status"], string> = {
  missing: "Not received", empty: "Received but empty", unreadable: "File could not be read",
  invalid: "Read, but format is invalid", loaded: "Read successfully",
};
function Value({ label, value }: { label: string; value: ConnectionValue }) {
  return <div>
    <span>{label}: {labels[value.status]}</span>
    <span className="nm-muted"> · {value.source}{value.path ? ` · ${value.path}` : ""}</span>
    {value.preview && <code>{value.preview}</code>}
    {value.length !== undefined && <span className="nm-muted">{value.length} characters{value.trimmed ? " · surrounding whitespace trimmed" : ""}</span>}
    {value.code && <span className="nm-connection-value-error">{value.code}{value.code === "bearer_prefix" ? " · Remove the Bearer prefix." : value.code === "token_format" ? " · Use the plain token value, without JSON, quotes or whitespace." : ""}</span>}
  </div>;
}
export function ConnectionValueStatus({ value }: { value: ConnectionValuePair | undefined }) {
  if (!value) return null;
  return <div className="nm-connection-value-status">
    <Value label="Current" value={value.effective} />
    {value.overridden && <>
      <p className="nm-muted">Deployment value is overridden by saved settings.</p>
      <Value label="Deployment" value={value.deployment} />
    </>}
  </div>;
}
