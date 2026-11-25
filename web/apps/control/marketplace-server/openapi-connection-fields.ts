import { field, fields, under } from "./openapi-field-annotations";

const connections = "V3 Connections.";
const evaluate = `${connections} Independent Evaluate.`;
const advanced = `${connections} Advanced settings.`;
const errors = "Error banner and expandable support details.";
const evaluationLogs = `${evaluate} Evaluate activity log.`;
const browserOrigins = `${advanced} Allowed browser origins.`;
const backups = `${connections} Connection backup JSON import and export. Preserve the field without rendering its value.`;

export const evaluationUrlField = field("Evaluate API URL. In shared V3 with no deployment URL, allowlist or Evaluate token, enter an HTTPS service hostname on port 443 directly. Enter the server address or its /api/v1/evaluations endpoint. Marketplace probes the target catalog before activation.", `${evaluate} Evaluate URL field.`);

const connectionSettings = {
  ...fields(`${connections} NeMo connection.`, {
    nemoUrl: "NeMo Controller API base ending in /api/v1. Changing it requires a fresh NeMo Token.",
    nemoToken: "Business API Token without the Bearer prefix. Use a masked input.",
    nemoTls: "Certificate verification option for NeMo. verify requires trust verification; skip omits that check.",
  }),
  ...fields(`${connections} Database connection.`, {
    databaseUrl: "Full PostgreSQL or MariaDB DSN, including the required credentials. Use a masked input.",
  }),
  ...fields(advanced, {
    workspaceId: "Workspace namespace in lowercase letters, digits and hyphens. Changing it selects a different data scope.",
    databaseTls: "true requires verified database TLS; url uses the settings in the database URL.",
    caMode: "system uses trusted system certificates; custom takes the supplied CA PEM.",
    caPem: "Certificate authority PEM bundle used when the custom CA option is selected.",
  }),
  ...fields(`${connections} F5 connection.`, {
    f5Mode: "Enable or disable F5 as a provider.",
    f5Url: "F5 API base URL. Supply a fresh F5 API Token if this destination changes.",
    f5Token: "API Token for F5 integration. Use a masked input.",
    f5AdminIds: "Comma-separated F5 user IDs for Project administrators when required by F5.",
  }),
  evaluationUrl: evaluationUrlField,
};
const connectionState = {
  ...fields(connections, {
    saved: "Whether manual overrides exist. Show the option to use deployment settings when true.",
    configured: "Per-field availability, based on values read by the server. Use the probe results to confirm reachability and authentication.",
    connectionRevision: "Opaque version of the active connection. Send as X-Marketplace-Connection to detect a connection change before a write.",
    demoRoleSwitching: "Whether the deployment offers shared Workbench role selection.",
    manualConfiguration: "Whether manual overrides can be saved through the UI. Strict mode manages connection settings through deployment.",
    persistence: "persistent uses retained connection storage; pod storage lasts for the current Pod.",
    advanced: "Effective settings used to populate the current-value options.",
  }),
  ...under("advanced", fields(advanced, {
    nemoTls: "Effective NeMo certificate verification mode.",
    databaseTls: "Effective database TLS option.",
    caMode: "Effective trusted CA selection. deployment means the CA is deployment-managed.",
    f5Mode: "Effective F5 integration mode. Show the F5 fields when enabled.",
  })),
  ...under("configured", fields(`${connections} Configured and Not configured indicators beside each field.`, {
    nemoUrl: "A NeMo Controller URL was received.",
    nemoToken: "A NeMo authentication credential was received.",
    databaseUrl: "A database connection URL was received.",
    workspaceId: "A workspace namespace was supplied.",
    caPem: "A trusted custom or deployment CA bundle was received.",
    f5Url: "An F5 URL was received.",
    f5Token: "An F5 API Token was received.",
    f5AdminIds: "F5 Project administrator IDs were received.",
    evaluationUrl: "An effective Evaluate URL was received.",
  })),
};
const originsList = field("Exact HTTPS browser origins permitted for Bearer-authenticated resource API calls. Include a non-default port when present. Omit the path and trailing slash. An empty list revokes cross-origin access.", `${browserOrigins} One entry per line in Allowed frontend origins.`);
export const connectionFields = {
  ConnectionSettings: connectionSettings,
  ConnectionTest: {
    target: field("Single connection value to probe. Select the field for a NeMo, F5, database or Evaluate check.", `${connections} Test button next to the specified field.`),
    settings: field("Optional unsaved candidate values to use for this probe only.", `${connections} Send the current form inputs without saving them.`),
  },
  ConnectionBackup: fields(backups, {
    format: "Magic value identifying a Marketplace connection export.",
    version: "File format version for compatibility validation.",
    nonce: "Base64 nonce for the encrypted payload.",
    tag: "Base64 authentication tag used to verify integrity.",
    data: "Encrypted saved settings in Base64. Restore with the deployment connection key.",
  }),
  BrowserOrigins: { origins: originsList },
  BrowserOriginsStatus: {
    origins: originsList,
    ...fields(browserOrigins, {
      deploymentOrigins: "Origins supplied by the deployment. Restore deployment origins reactivates this list.",
      source: "deployment uses the deployment list; saved uses a Tech override.",
    }),
  },
  ConnectionValue: fields(`${connections} Current value, deployment value and Secret diagnostics.`, {
    source: "Setting name or source used to resolve the effective value.",
    status: "Read status, such as missing, empty, unreadable, invalid or loaded. loaded indicates the value was read.",
    preview: "Redacted presentation safe to show. Keep masked previews out of editable fields.",
    code: "Optional stable diagnostic code for the value.",
    path: "Optional file path associated with the server-side value source.",
    length: "Optional character count before authentication checks.",
    trimmed: "Whether whitespace was removed while reading the value.",
  }),
  ConnectionStatus: {
    ...connectionState,
    ...fields(connections, {
      values: "Per-setting safe diagnostics keyed by connection field name.",
      "values.effective": "Resolved value and diagnostics used by the server now.",
      "values.deployment": "Deployment-supplied source and diagnostics before applying overrides.",
      "values.overridden": "Whether a saved entry replaces the deployment value.",
    }),
    ...fields(evaluate, {
      evaluationPolicy: "Effective Evaluate URL policy and approved alternate summary.",
      "evaluationPolicy.deploymentUrl": "Whether the deployment supplied a valid Evaluate URL.",
      "evaluationPolicy.manualSetup": "True when an HTTPS Evaluate hostname on port 443 can be tested and saved directly in Connections without deployment settings.",
      "evaluationPolicy.approvedAlternates": "Count of valid deployment-approved fallback addresses.",
      "evaluationPolicy.invalidAlternates": "Count of invalid entries in the deployment list.",
      "evaluationPolicy.tokenPinned": "Whether the Evaluate token is restricted to the deployment URL.",
    }),
    ...fields(evaluationLogs, {
      evaluationLogs: "Recent Evaluate activity on the current Marketplace server.",
      "evaluationLogs.time": "Event timestamp.",
      "evaluationLogs.action": "Operation carried out: test, save, restore or start.",
      "evaluationLogs.status": "Marketplace HTTP status for this action.",
      "evaluationLogs.durationMs": "Elapsed milliseconds.",
      "evaluationLogs.requestId": "Reference for locating the event in server logs.",
      "evaluationLogs.code": "Stable failure code, when present.",
      "evaluationLogs.stage": "Stage that produced the diagnostic: configuration, destination, network, upstream, response or completed.",
      "evaluationLogs.message": "Safe diagnostic text.",
      "evaluationLogs.upstreamStatus": "HTTP status reported by Evaluate, if contacted.",
      "evaluationLogs.contentType": "Normalized content type reported by Evaluate.",
      "evaluationLogs.networkCode": "Optional connection error code, such as a DNS or TLS failure.",
    }),
  },
  RuntimeStatus: {
    ...connectionState,
    ...fields("V3 bootstrap; feature gating and integration diagnostics.", {
      mode: "V3 runtime mode, live for a successful V3 runtime response.",
      sharedDemo: "Compatibility flag for server-managed demonstration storage.",
      browserDemo: "Compatibility flag for browser-local demonstration state.",
      sourceId: "Opaque active provider-instance fingerprint.",
      policyAuthoring: "Whether the separate policy authoring integration is available.",
      crudOnly: "Whether the runtime is restricted to basic resource CRUD.",
      f5Mock: "Whether a legacy F5 simulation endpoint is enabled.",
      marketplaceDb: "Whether the runtime has Marketplace database configuration.",
      autoConnect: "Whether the legacy server-authenticated connection flow is available.",
      independentEvaluation: "Whether to show the Independent evaluation panel on eligible Guardrail revisions.",
    }),
  },
  ProbeResult: fields(`${connections} Inline connection test result.`, {
    ok: "True for a successful probe.",
    target: "Connection field that was tested.",
    message: "Human-readable probe outcome. URL reachability alone does not confirm a valid credential.",
    durationMs: "Time taken in milliseconds.",
    httpStatus: "Optional upstream HTTP status.",
  }),
  Readiness: fields("Deployment and connection diagnostics; no routine workbench display.", {
    ready: "True once V3 configuration and Marketplace database access have been verified.",
    workspace: "Workspace checked by the probe, v3.",
    backend: "Configuration state of the V3 backend.",
    checks: "Per-dependency readiness observations.",
    "checks.database": "Marketplace database was reachable.",
    "checks.nemo": "NeMo was not contacted by this check.",
    "checks.f5": "F5 configuration classification; this check does not probe the remote F5 service.",
    "checks.identity": "Identity or account mapping configuration was available.",
  }),
  Health: fields("Readiness and liveness monitoring; no routine workbench display.", { ok: "True when the Marketplace UI/API process can respond.", service: "Service identifier for health monitors." }),
  ErrorDetails: fields(errors, {
    operation: "Internal operation in which the error occurred.",
    certificateVerification: "Certificate verification mode for the attempted operation.",
    httpStatus: "Actual upstream HTTP status when available.",
    contentType: "Upstream media type when known.",
    upstreamCode: "Safe upstream error code.",
    upstreamMessage: "Redacted explanation from the upstream response.",
    causes: "Safe exception-chain metadata.",
    "causes.name": "Error type in the cause chain.",
    "causes.code": "Optional platform error code.",
    "causes.message": "Redacted cause message.",
    "causes.syscall": "Optional OS or network operation that failed.",
    hints: "Suggested diagnostic checks for the operator.",
  }),
  ResponseValidation: fields(errors, {
    phase: "Workflow phase at which the upstream response failed schema validation.",
    endpoint: "Provider endpoint path checked by the validator.",
    runStatus: "Observed provider run status when available.",
    issueCount: "Total schema issues found.",
    issues: "Safe summary of malformed fields.",
    "issues.path": "JSON property path to the incompatible value.",
    "issues.expected": "Expected shape or type for this property.",
    "issues.received": "Classification of the value actually returned.",
  }),
  ErrorResponse: fields(errors, {
    error: "Structured failure envelope.",
    "error.code": "Stable error code for deciding whether to reauthenticate, refresh, reconcile or display a diagnostic.",
    "error.component": "Component responsible for the failure, used to select the diagnostic context.",
    "error.message": "Safe user-facing explanation to show in the alert.",
    "error.settings": "Names of deployment settings to inspect.",
    "error.requestId": "Reference to show in the error banner and correlate with server logs.",
    "error.details": "Optional structured failure details for support.",
    "error.responseValidation": "Optional response-schema issue paths for upstream compatibility errors.",
  }),
  PageCoverage: fields("Swagger page coverage table and front-end integration inventory.", {
    page: "Human-readable Marketplace page or component name.",
    kind: "Workspace, Guardrail or Profile resource scope.",
    view: "View key used in the workbench navigation model.",
    roles: "Marketplace roles relevant to this page or section.",
    availability: "live has working APIs; mock-only exists in the simulated workspace; unavailable has no live implementation.",
    operationIds: "Swagger operations the integrating UI should look up for this view.",
    commands: "Legacy workflow commands relevant to this page.",
    responseFields: "Fields that populate the view. state paths refer to the legacy workspace snapshot.",
    notes: "Constraints or usage details for the page.",
  }),
  ApiInventory: fields("API list JSON consumed by frontend tooling and AI integrations.", {
    openapi: "Path to the structured OpenAPI document.",
    swagger: "Path to Swagger UI.",
    items: "Flat operation index for tools that need to select an endpoint.",
    "items.method": "HTTP method to call.",
    "items.path": "OpenAPI route template.",
    "items.operationId": "Stable lookup key for an operation.",
    "items.summary": "Short statement of what the operation does.",
    pages: "Maps workbench views to operations and known limitations.",
    commandExamples: "Legacy workflow request examples keyed by action.",
    "commandExamples.summary": "Human-readable command scenario.",
    "commandExamples.value": "Example legacy command payload.",
  }),
};
