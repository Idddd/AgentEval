import { createHash } from "node:crypto";
import { z } from "zod";
import type { Entity } from "../src/features/nmgr/model";
import type { NmgrActor, NmgrBinding, NmgrDocument, NmgrRemote } from "./nmgr";

const id = z.string().min(1).max(512);
const record = z.object({ id }).passthrough();
const list = z.object({ items: z.array(record), count: z.number().int().nonnegative().optional() }).passthrough();
const rules = z.array(z.object({ id, rails: z.array(z.string()).optional(), stages: z.array(z.string()).optional() }).passthrough());
const policy = z.object({ id, revision: z.number().int().nonnegative(), published_version: z.string().nullable().optional(), definition: z.object({ metadata: z.object({ id, name: z.string(), description: z.string().optional() }).passthrough(), rules }).passthrough() }).passthrough();
const reference = z.object({ policyId: id, policyVersion: z.string().min(1), enabledRuleIds: z.array(z.string()).optional(), enabledRails: z.array(z.string()).optional() }).passthrough();
const profile = z.object({ id, name: z.string(), description: z.string().optional(), draftRevision: z.number().int().nonnegative(), draftConfig: z.object({ policyBindings: z.array(reference) }).passthrough(), versions: z.array(z.object({ version: id, status: z.string(), releasedAt: z.string().nullable().optional() }).passthrough()) }).passthrough();
type Discovered = { kind: Entity["kind"]; remoteId: string; name: string; description: string; binding: NmgrBinding; policyBindings: NonNullable<Entity["imported"]>["policyBindings"] };

export async function discoverNemo(remote: NmgrRemote): Promise<Discovered[]> {
  const catalogs = await Promise.all([remote.request("/policies"), remote.request("/guardrails")]);
  const lists = catalogs.map(value => {
    const parsed = list.parse(value);
    if (parsed.count !== undefined && parsed.count !== parsed.items.length || new Set(parsed.items.map(item => item.id)).size !== parsed.items.length || value.next || value.nextCursor) throw new Error("NeMo catalog is incomplete. Check API pagination before importing.");
    return parsed.items;
  });
  const tasks = lists.flatMap((items, index) => items.map(item => ({ item, index })));
  const results: Discovered[] = new Array(tasks.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
    while (next < tasks.length) {
      const position = next++, { item, index } = tasks[position]!;
      if (index === 0) {
        const detail = policy.parse(await remote.request(`/policies/${encodeURIComponent(item.id)}/definition`));
        if (detail.id !== item.id || detail.definition.metadata.id !== item.id) throw new Error("NeMo Policy identity mismatch.");
        const publishedVersion = detail.published_version || undefined;
        // The definition endpoint contains the mutable draft. Only catalog rules
        // at the exact published version are eligible for new Profile bindings.
        const publishedRules = publishedVersion && item.version === publishedVersion ? rules.parse(item.rules) : [];
        results[position] = { kind: "Guardrail", remoteId: item.id, name: detail.definition.metadata.name, description: detail.definition.metadata.description ?? "—", policyBindings: [],
          binding: { policyId: item.id, revision: detail.revision, ...(publishedVersion ? { publishedVersion } : {}), released: !!publishedVersion,
            ruleIds: publishedRules.map(rule => rule.id), rails: [...new Set(publishedRules.flatMap(rule => rule.rails ?? rule.stages ?? []))] } };
      } else {
        const detail = profile.parse(await remote.request(`/guardrails/${encodeURIComponent(item.id)}`));
        if (detail.id !== item.id) throw new Error("NeMo Guardrail identity mismatch.");
        const released = detail.versions.filter(version => version.status === "ready").sort((a, b) => (b.releasedAt ?? b.version).localeCompare(a.releasedAt ?? a.version))[0];
        results[position] = { kind: "Profile", remoteId: item.id, name: detail.name, description: detail.description ?? "—", policyBindings: detail.draftConfig.policyBindings.map(ref => ({ policyId: ref.policyId, policyVersion: ref.policyVersion, enabledRuleIds: ref.enabledRuleIds ?? [], enabledRails: ref.enabledRails ?? [] })),
          binding: { guardrailId: item.id, draftRevision: detail.draftRevision, ...(released ? { version: released.version } : {}), released: !!released } };
      }
    }
  }));
  return results;
}

export function mergeNemo(doc: NmgrDocument, actor: NmgrActor, resources: Discovered[]) {
  const timestamp = new Date().toISOString(), seen = new Set<string>();
  const find = (kind: Entity["kind"], remoteId: string) => doc.state.entities.find(entity => entity.kind === kind && (entity.provider ?? "NeMo") === "NeMo" &&
    (!entity.imported || entity.unit === actor.unit) && Object.entries(doc.bindings).some(([key, binding]) => key.startsWith(`${entity.id}@`) && (kind === "Guardrail" ? binding.policyId : binding.guardrailId) === remoteId));
  for (const resource of resources) {
    const existing = find(resource.kind, resource.remoteId);
    // Managed resources keep their workflow and frozen release evidence.
    if (existing && !existing.imported) continue;
    const localId = existing?.id ?? `nemo-${createHash("sha256").update(`${actor.unit}:${resource.kind}:${resource.remoteId}`).digest("hex").slice(0, 24)}`;
    seen.add(localId);
    const entity: Entity = { id: localId, kind: resource.kind, name: resource.name, description: resource.description, provider: "NeMo", unit: actor.unit,
      location: "—", custodian: "—", approver: "—", mandatory: false, status: resource.binding.released ? "DEPLOYED" : "DRAFT", version: 1, deployed: resource.binding.released ? 1 : null,
      updated: timestamp, policies: [], refs: [], deployedRefs: [], attributes: { bu: "", agent: "", data: "" }, runs: [], mode: "Normal", threshold: 0,
      imported: { remoteId: resource.remoteId, available: true, ...(resource.binding.publishedVersion || resource.binding.version ? { publishedVersion: resource.binding.publishedVersion ?? resource.binding.version! } : {}), bindable: !!resource.binding.released && !!resource.binding.ruleIds?.length && !!resource.binding.rails?.length, checkedAt: timestamp, policyBindings: resource.policyBindings } };
    if (existing) Object.assign(existing, entity); else doc.state.entities.push(entity);
    doc.bindings[`${localId}@1`] = resource.binding;
  }
  for (const entity of doc.state.entities.filter(e => e.imported && e.unit === actor.unit)) {
    if (!seen.has(entity.id)) {
      entity.imported!.available = false; entity.imported!.checkedAt = timestamp;
      entity.deployed = null; entity.status = "DRAFT";
      const binding = doc.bindings[`${entity.id}@1`]; if (binding) binding.released = false;
    } else if (entity.kind === "Profile") {
      entity.refs = [...new Set(entity.imported!.policyBindings.flatMap(ref => {
        const target = find("Guardrail", ref.policyId);
        return target && target.unit === actor.unit && target.imported?.available !== false ? [target.id] : [];
      }))];
      // refs describe the remote draft, not evidence about its released snapshot.
    }
  }
}
