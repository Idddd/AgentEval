import { z } from "zod";
import { unifiedConfigSchema } from "../src/features/business-demo/evaluation";
import { profileRuntimeSchema } from "../src/features/business-demo/profile-runtime";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const text = { type: "string" }, bool = { type: "boolean" }, integer = { type: "integer", minimum: 0 };
const version = { type: "integer", minimum: 1 };
const list = (items: unknown) => ({ type: "array", items });
const strings = list(text);
const choice = (...values: string[]) => ({ type: "string", enum: values });
const map = (values: unknown) => ({ type: "object", additionalProperties: values });
const obj = (properties: Record<string, unknown>, required = Object.keys(properties), additionalProperties = false) => ({ type: "object", properties, required, additionalProperties });
const generated = (schema: z.ZodType) => { const { $schema, ...value } = z.toJSONSchema(schema); return value; };
const provider = choice("NeMo", "F5"), role = choice("User", "User Admin", "IT Admin");
const attributes = obj({ bu: text, agent: text, data: text });
const importedRef = obj({ policyId: text, policyVersion: text, enabledRuleIds: strings, enabledRails: strings });
const metadata = { name: text, description: text, policies: strings, refs: strings, unit: text, location: text, mandatory: bool, attributes,
  config: ref("UnifiedConfig"), provider, threshold: { type: "number" }, thresholdMetric: choice("Block Rate", "Pass Rate", "Error Rate"), thresholdWindow: { type: "number" } };
const connectionProperties = {
  saved: bool,
  configured: obj(Object.fromEntries(["nemoUrl", "nemoToken", "databaseUrl", "workspaceId", "caPem", "f5Url", "f5Token", "f5AdminIds"].map(key => [key, bool]))),
  advanced: obj({ nemoTls: choice("skip", "verify"), databaseTls: choice("true", "url"), caMode: choice("system", "custom", "deployment"), f5Mode: choice("enabled", "disabled") }),
  connectionRevision: text, demoRoleSwitching: bool, manualConfiguration: bool, persistence: choice("persistent", "pod"),
};

/** Response fields describe the JSON on the wire, not the private durable job document. */
export const responseSchemas = {
  UnifiedConfig: generated(unifiedConfigSchema.strict()),
  RuntimeCompatibility: { ...generated(profileRuntimeSchema), description: "Optional legacy persisted runtime shape. V3 does not supply live scan traffic or runtime control APIs." },
  Actor: obj({ id: text, name: text, role, unit: text }),
  AuditEntry: obj({ id: text, time: text, entity: text, action: text, actor: text }),
  ImportedResource: obj({ remoteId: text, available: bool, publishedVersion: text, bindable: bool, checkedAt: text, policyBindings: list(importedRef) }, ["remoteId", "available", "checkedAt", "policyBindings"]),
  EvaluationResult: obj({ caseId: text, passed: bool, actualDecision: text, reason: text }, ["caseId", "passed"], true),
  EvaluationEvidence: obj({ source: provider, status: text, results: list(ref("EvaluationResult")), failureReason: { type: ["string", "null"] } }),
  EvaluationRun: obj({ id: text, version, base: { type: ["integer", "null"], minimum: 1 }, dataset: text, passed: bool, start: text, end: text, cases: integer, tester: role, configurationRevision: integer, evidence: ref("EvaluationEvidence") }, ["id", "version", "base", "dataset", "passed", "start", "end", "cases"]),
  Revision: obj(metadata, ["name", "description", "policies", "refs", "unit", "location", "mandatory", "attributes"]),
  Entity: obj({
    ...metadata, id: text, kind: choice("Guardrail", "Profile"), sourcePending: bool, sourceInstanceId: text,
    status: choice("DRAFT", "TEST READY", "TEST FAILED", "TEST PASSED", "SIGNOFF REQUESTED", "SIGNED OFF", "DEPLOYED"),
    custodian: text, approver: text, version, deployed: { type: ["integer", "null"], minimum: 1 }, updated: text, deployedAt: text,
    deployedRefs: strings, runs: list(ref("EvaluationRun")), mode: choice("Normal", "Pass all", "Block all"),
    configurationRevision: integer, signedBy: text, revisions: map(ref("Revision")), imported: ref("ImportedResource"), runtime: ref("RuntimeCompatibility"),
  }, ["id", "kind", "name", "description", "unit", "location", "custodian", "approver", "mandatory", "status", "version", "deployed", "updated", "policies", "refs", "deployedRefs", "attributes", "runs", "mode", "threshold"]),
  F5ScannerRef: obj({ id: text, version: text, direction: choice("request", "response", "both"), enabled: { const: true, type: "boolean" }, blocking: { const: true, type: "boolean" }, mode: { type: "string", const: "block" } }),
  F5Binding: obj({ sourceId: text, scannerId: text, scannerName: text, versionId: text, projectId: text }, ["sourceId"]),
  PolicyBinding: obj({ ...importedRef.properties, f5: ref("F5ScannerRef") }, importedRef.required),
  Binding: obj({ draftSyncedAt: text, f5: ref("F5Binding"), policyId: text, revision: integer, publishedVersion: text, ruleIds: strings, rails: strings,
    guardrailId: text, draftRevision: integer, version: text, publishedRefs: map(ref("PolicyBinding")), released: bool }, []),
  Job: obj({ actor: text, phase: text, status: choice("pending", "failed", "uncertain", "done"), started: text, purpose: { type: "string", const: "draft-sync" },
    traceId: text, expectedRevision: integer, inflight: bool, message: text, runId: text, dataset: text, canCorrect: bool, canResume: bool }, ["actor", "phase", "status", "started", "canResume"]),
  Workspace: obj({ revision: integer, actor: ref("Actor"), sources: list(provider), sourceErrors: map(obj({ code: text, component: choice("f5"), message: text, requestId: text, settings: strings, details: ref("ErrorDetails") }, ["code", "component", "message", "requestId", "settings"])), accessMode: choice("demo", "authenticated", "local"),
    state: obj({ entities: list(ref("Entity")), audit: list(ref("AuditEntry")) }), jobs: map(ref("Job")),
    bindings: { ...map(ref("Binding")), description: "Keys are resourceId@businessVersion. Remote Policy/Guardrail versions are strings and must not be confused with the local integer business revision." },
  }, ["revision", "actor", "sources", "state", "jobs", "bindings"]),
  ConnectionStatus: obj(connectionProperties),
  RuntimeStatus: obj({ ...connectionProperties, mode: { type: "string", const: "live" }, sharedDemo: bool, browserDemo: bool, sourceId: text, policyAuthoring: bool, crudOnly: bool, f5Mock: bool, marketplaceDb: bool, autoConnect: bool }),
  ProbeResult: obj({ ok: { type: "boolean", const: true }, target: choice("nemoUrl", "nemoToken", "databaseUrl", "f5Url", "f5Token"), message: text, durationMs: integer, httpStatus: { type: "integer", minimum: 100, maximum: 599 } }, ["ok", "target", "message", "durationMs"]),
  Readiness: obj({ ready: { type: "boolean", const: true }, workspace: { type: "string", const: "v3" }, backend: { type: "string", const: "configured" }, checks: obj({ database: { type: "string", const: "reachable" }, nemo: { type: "string", const: "not_probed" }, f5: choice("not_probed", "not_configured", "configuration_error"), identity: { type: "string", const: "mapping_configured" } }) }),
  Health: obj({ ok: { type: "boolean", const: true }, service: { type: "string", const: "marketplace-ui" } }),
  ErrorDetails: obj({ operation: text, certificateVerification: text, httpStatus: { type: "integer", minimum: 100, maximum: 599 }, contentType: text, upstreamCode: text, upstreamMessage: text,
    causes: list(obj({ name: text, code: text, message: text, syscall: text }, [])), hints: strings }, ["operation", "certificateVerification", "causes", "hints"]),
  ErrorResponse: obj({ error: obj({ code: text, component: choice("runtime", "origin", "database", "identity", "nemo", "f5", "workspace"), message: text, settings: strings, requestId: text, details: ref("ErrorDetails") }, ["code", "component", "message", "settings", "requestId"]) }),
  ResourceObservation: obj({ id: text, revision: integer, checkedAt: text, status: choice("local_only", "available", "changed", "missing", "unavailable", "source_changed"), message: text, remoteVersion: text }, ["id", "revision", "checkedAt", "status", "message"]),
  PageCoverage: obj({ page: text, kind: choice("Guardrail", "Profile", "Workspace"), view: text, roles: list(role), availability: choice("live", "mock-only", "unavailable"), operationIds: strings, commands: strings, responseFields: strings, notes: text }),
  ApiInventory: obj({ openapi: text, swagger: text, items: list(obj({ method: text, path: text, operationId: text, summary: text })),
    pages: list(ref("PageCoverage")), commandExamples: map(obj({ summary: text, value: ref("Command") })) }),
};
