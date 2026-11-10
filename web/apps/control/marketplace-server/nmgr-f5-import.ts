import { createHash } from "node:crypto";
import { z } from "zod";
import type { Entity, F5CatalogInfo } from "../src/features/nmgr/model";
import { DeploymentError } from "./diagnostics";
import type { F5Remote } from "./f5-client";
import { logF5 } from "./f5-trace";
import type { NmgrActor, NmgrBinding, NmgrDocument } from "./nmgr";

const id = z.string().min(1).max(512);
const row = z.object({ id });
const version = z.object({ id, name: z.string(), published: z.boolean(), description: z.string().optional(), createdAt: z.string().optional(), direction: z.string().optional() });
const scanner = z.object({ id, name: z.string(), description: z.string().optional(), direction: z.string(), versionMeta: version });
const scannerRef = z.object({ id, version: id.optional(), direction: z.string().optional(), enabled: z.boolean().optional(), blocking: z.boolean().optional(), mode: z.string().optional(), force: z.boolean().optional() });
const project = z.object({ id, name: z.string(), description: z.string().optional(), deploymentStatus: z.string().optional(), config: z.object({ scanners: z.array(scannerRef), packages: z.array(z.object({ id, version: id.optional(), enabled: z.boolean().optional() })).optional() }) });
type Resource = { kind: Entity["kind"]; id: string; name: string; description: string; info: F5CatalogInfo; binding: NmgrBinding; bindable: boolean };
const invalid = (endpoint: string, reason: string) => {
  const path = endpoint.split("?")[0]!;
  const error = new DeploymentError("f5", "f5_catalog_invalid", `F5 import failed at GET ${path}: ${reason}. Existing records were retained.`, undefined, 502);
  error.responseValidation = { phase: "catalog-import", endpoint: path, runStatus: "not-applicable", issueCount: 1, issues: [{ path: "catalog", expected: reason, received: "inconsistent response" }] };
  return error;
};
function parse<T>(schema: z.ZodType<T>, value: unknown, endpoint: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  // Schema-owned paths and codes only. Never include upstream values, provider credentials or full payloads.
  const issues = result.error.issues.slice(0, 8).map(issue => ({ path: issue.path.join("."), expected: "expected" in issue ? String(issue.expected) : issue.code, received: "invalid or missing" }));
  const error = invalid(endpoint, issues.map(issue => `${issue.path}: expected ${issue.expected}`).join("; "));
  error.responseValidation = { phase: "catalog-import", endpoint: endpoint.split("?")[0]!, runStatus: "not-applicable", issueCount: result.error.issues.length, issues };
  throw error;
}
async function read(remote: F5Remote, endpoint: string) {
  try { return await remote.request(endpoint); }
  catch (error) {
    if (error instanceof DeploymentError) {
      error.message = `F5 import GET ${endpoint.split("?")[0]}: ${error.message} Existing records were retained.`;
      throw error;
    }
    throw new DeploymentError("f5", "f5_import_failed", `F5 import GET ${endpoint.split("?")[0]} failed. Existing records were retained. Check network, permissions and backend compatibility.`, undefined, 502, error);
  }
}
async function catalog(remote: F5Remote, collection: "scanners" | "projects") {
  const schema = z.object({ [collection]: z.array(row), next: z.string().nullable().optional() });
  const results: Array<{ id: string }> = [], ids = new Set<string>(), cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 1000; page++) {
    const endpoint = `/${collection}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const value = parse(schema, await read(remote, endpoint), endpoint);
    const items = value[collection] as Array<{ id: string }>;
    for (const item of items) {
      if (ids.has(item.id)) throw invalid(endpoint, "duplicate resource across catalog pages");
      ids.add(item.id); results.push(item);
    }
    logF5("f5_import_page", { collection, page: page + 1, count: items.length, sourceId: remote.sourceId });
    const next = value.next as string | null | undefined;
    if (!next) return results;
    if (cursors.has(next)) throw invalid(endpoint, "pagination cursor repeated");
    cursors.add(next); cursor = next;
  }
  throw invalid(`/${collection}`, "pagination safety limit exceeded");
}
export async function discoverF5(remote: F5Remote): Promise<Resource[]> {
  const scanners = await catalog(remote, "scanners"), projects = await catalog(remote, "projects");
  const tasks = [...scanners.map(item => ({ ...item, kind: "Guardrail" as const })), ...projects.map(item => ({ ...item, kind: "Profile" as const }))];
  const result: Resource[] = new Array(tasks.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++, task = tasks[index]!, endpoint = `/${task.kind === "Guardrail" ? "scanners" : "projects"}/${encodeURIComponent(task.id)}`;
      if (task.kind === "Guardrail") {
        const detail = parse(z.object({ scanner }), await read(remote, endpoint), endpoint).scanner;
        if (detail.id !== task.id) throw invalid(endpoint, "Scanner identity mismatch");
        const versionsPath = `${endpoint}/versions`;
        const versions = parse(z.object({ versions: z.array(version) }), await read(remote, versionsPath), versionsPath).versions;
        const current = versions.find(v => v.id === detail.versionMeta.id);
        if (new Set(versions.map(v => v.id)).size !== versions.length || !current || current.published !== detail.versionMeta.published || current.name !== detail.versionMeta.name) throw invalid(versionsPath, "current Scanner version missing, duplicated or changed during discovery");
        const bindable = current.published && z.uuid().safeParse(current.id).success && z.uuid().safeParse(detail.id).success && ["request", "response", "both"].includes(detail.direction);
        result[index] = { kind: task.kind, id: detail.id, name: detail.name, description: detail.description ?? current.description ?? "—", bindable,
          info: { currentVersionId: current.id, direction: detail.direction, versions, scannerBindings: [], packageBindings: [] },
          binding: { f5: { sourceId: remote.sourceId, scannerId: detail.id, scannerName: detail.name, versionId: current.id }, released: current.published } };
      } else {
        const detail = parse(z.object({ project }), await read(remote, endpoint), endpoint).project;
        if (detail.id !== task.id) throw invalid(endpoint, "Project identity mismatch");
        result[index] = { kind: task.kind, id: detail.id, name: detail.name, description: detail.description ?? "—", bindable: false,
          info: { ...(detail.deploymentStatus !== undefined ? { deploymentStatus: detail.deploymentStatus } : {}), versions: [], scannerBindings: detail.config.scanners, packageBindings: detail.config.packages ?? [] },
          binding: { f5: { sourceId: remote.sourceId, projectId: detail.id }, released: false } };
      }
    }
  }));
  return result;
}

/** Provider-scoped optimistic concurrency: an F5 network wait must not block a NeMo write. */
export function catalogFingerprint(doc: NmgrDocument, provider: "F5" | "NeMo") {
  const entities = doc.state.entities.filter(e => (e.provider ?? "NeMo") === provider), ids = new Set(entities.map(e => e.id));
  return createHash("sha256").update(JSON.stringify({ entities, generation: doc.catalogRevisions?.[provider] ?? 0,
    bindings: Object.entries(doc.bindings).filter(([key]) => ids.has(key.split("@")[0]!)), jobs: Object.entries(doc.jobs).filter(([key]) => ids.has(key)) })).digest("hex");
}
export function mergeF5(doc: NmgrDocument, actor: NmgrActor, sourceId: string, resources: Resource[]) {
  const timestamp = new Date().toISOString(), seen = new Set<string>();
  const find = (kind: Entity["kind"], remoteId: string) => doc.state.entities.find(e => e.kind === kind && e.provider === "F5" && (!e.imported || e.unit === actor.unit) &&
    Object.entries(doc.bindings).some(([key, b]) => key.startsWith(`${e.id}@`) && b.f5?.sourceId === sourceId && (kind === "Guardrail" ? b.f5.scannerId : b.f5.projectId) === remoteId));
  for (const resource of resources) {
    const existing = find(resource.kind, resource.id);
    if (existing && !existing.imported) continue; // Managed workflows retain frozen approval/evaluation evidence.
    const localId = existing?.id ?? `f5-${createHash("sha256").update(`${sourceId}:${actor.unit}:${resource.kind}:${resource.id}`).digest("hex").slice(0, 24)}`;
    seen.add(localId);
    const released = resource.kind === "Guardrail" && !!resource.binding.released;
    const entity: Entity = { id: localId, kind: resource.kind, name: resource.name, description: resource.description, provider: "F5", sourceInstanceId: sourceId, unit: actor.unit,
      location: "—", custodian: "—", approver: "—", mandatory: false, status: released ? "DEPLOYED" : "DRAFT", version: 1, deployed: released ? 1 : null,
      updated: timestamp, policies: [], refs: [], deployedRefs: [], attributes: { bu: "", agent: "", data: "" }, runs: [], mode: "Normal", threshold: 0,
      imported: { remoteId: resource.id, available: true, ...(released ? { publishedVersion: resource.info.currentVersionId! } : {}), bindable: resource.bindable, checkedAt: timestamp, policyBindings: [], f5: resource.info } };
    if (existing) Object.assign(existing, entity); else doc.state.entities.push(entity);
    doc.bindings[`${localId}@1`] = resource.binding;
  }
  for (const entity of doc.state.entities.filter(e => e.imported && e.provider === "F5" && e.sourceInstanceId === sourceId && e.unit === actor.unit)) {
    if (!seen.has(entity.id)) {
      entity.imported!.available = false; entity.imported!.bindable = false; entity.imported!.checkedAt = timestamp; entity.deployed = null; entity.status = "DRAFT";
      const binding = doc.bindings[`${entity.id}@1`]; if (binding) binding.released = false;
    }
  }
  for (const entity of doc.state.entities.filter(e => seen.has(e.id) && e.kind === "Profile")) {
      entity.refs = [...new Set(entity.imported!.f5!.scannerBindings.flatMap(ref => {
        const target = find("Guardrail", ref.id);
        return target && target.unit === actor.unit && target.imported?.available !== false ? [target.id] : [];
      }))];
  }
}
