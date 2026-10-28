import { randomUUID } from "node:crypto";
import { StoreError } from "./marketplace-db";

export type Component = "runtime" | "origin" | "database" | "identity" | "nemo" | "f5" | "workspace";
export const componentSettings: Record<Component, string[]> = {
  runtime: ["MARKETPLACE_DATA_MODE"], origin: ["MARKETPLACE_PUBLIC_ORIGIN"],
  database: ["MARKETPLACE_DATABASE_URL", "MARKETPLACE_DATABASE_PASSWORD", "MARKETPLACE_DB_TLS", "MARKETPLACE_DB_CA_FILE"],
  identity: ["MARKETPLACE_V2_ACCOUNTS_FILE", "MARKETPLACE_V2_ACCOUNTS_JSON", "MARKETPLACE_V2_LOCAL_ACTOR_ID"],
  nemo: ["GUARD_API_URL", "GUARD_API_TOKEN_FILE", "GUARD_API_TOKEN", "GUARD_USERNAME", "GUARD_PASSWORD_FILE", "GUARD_PASSWORD", "GUARD_AUTH_ORIGIN", "NODE_EXTRA_CA_CERTS"],
  f5: ["F5_API_URL", "F5_API_TOKEN_FILE", "F5_API_TOKEN", "NODE_EXTRA_CA_CERTS"], workspace: ["MARKETPLACE_WORKSPACE_ID"],
};
export class DeploymentError extends StoreError {
  readonly requestId = randomUUID();
  constructor(public component: Component, public code: string, message: string, public settings = componentSettings[component], status = 503) { super(status, message); }
}

// Only allowlisted metadata is logged. Never log an Error/cause, headers, bodies,
// environment values, driver errors, upstream URLs or upstream response bodies.
export function reportFailure(error: unknown, component: Component, operation: string, fallback: string) {
  let categorized = error;
  if (!(error instanceof DeploymentError) && component === "database") {
    const driverCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const groups: Array<[string[], string, string]> = [
      [["28P01", "28000", "ER_ACCESS_DENIED_ERROR"], "database_auth_failed", "Database authentication failed. Check the database user, password and Secret key mapping."],
      [["3D000", "ER_BAD_DB_ERROR"], "database_not_found", "The configured database does not exist. Check the database name in MARKETPLACE_DATABASE_URL."],
      [["42501", "ER_DBACCESS_DENIED_ERROR", "ER_TABLEACCESS_DENIED_ERROR"], "database_permission_denied", "Database user lacks schema/table permissions. Grant create and read/write permissions on the Marketplace database."],
      [["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET"], "database_unreachable", "Cannot reach the database. Check database host/port, DNS, network policy and service availability."],
      [["CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID"], "database_tls_failed", "Database TLS verification failed. Check the trusted CA, certificate hostname and MARKETPLACE_DB_TLS."],
    ];
    const group = groups.find(([codes]) => codes.includes(driverCode));
    if (group) categorized = new DeploymentError("database", group[1], group[2]);
  }
  const failure = categorized instanceof DeploymentError ? categorized : new DeploymentError(component,
    error instanceof StoreError ? `${component}_${error.status}` : `${component}_unavailable`,
    error instanceof StoreError && !["nemo", "f5"].includes(component) ? error.message : fallback, componentSettings[component], error instanceof StoreError ? error.status : 503);
  const metadata = { code: failure.code, component: failure.component, settings: failure.settings, requestId: failure.requestId };
  console.error(JSON.stringify({ time: new Date().toISOString(), level: "error", service: "marketplace", event: "dependency_failure", operation, status: failure.status, ...metadata }));
  return { ...metadata, message: failure.message, status: failure.status };
}
export function diagnosticResponse(error: unknown, component: Component, operation: string, fallback: string) {
  const { status, ...details } = reportFailure(error, component, operation, fallback);
  return Response.json({ error: details }, { status, headers: { "Cache-Control": "no-store", "X-Request-ID": details.requestId } });
}
