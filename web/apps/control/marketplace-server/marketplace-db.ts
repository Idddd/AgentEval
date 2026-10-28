import { SqlitePersistence, type MarketplacePersistence } from "./storage/persistence";
import { randomUUID } from "node:crypto";
import { blankDraft, entitySchema, validateDraft, type Draft, type Entity, type Kind } from "../src/features/business-demo/model";

export type Source = "Guard" | "F5";
export interface ProviderBridge {
  list(source: Source): Promise<Entity[]>;
  save(source: Source, kind: Kind, draft: Draft, existing?: Entity): Promise<Entity>;
  remove(source: Source, item: Entity): Promise<void>;
}
export type Row = { id: string; source: Source; remoteId?: string; entity: Entity; snapshot?: Entity;
  createdBy?: string;
  state: "synced" | "pending" | "failed" | "uncertain"; revision: number; error?: string | undefined;
  deleting?: boolean; deleted?: boolean; creating?: boolean; beforeIds?: string[] };
export class StoreError extends Error { constructor(public status: number, message: string) { super(message); } }
const providerFields = (item: Draft) => ({ name: item.name, text: item.text, policies: item.policies });

export class MarketplaceStore {
  private persistence: MarketplacePersistence;
  private ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(file: string | MarketplacePersistence) {
    this.persistence = typeof file === "string" ? new SqlitePersistence(file) : file;
    this.ready = this.persistence.exclusive(async () => {
      for (const row of await this.rows()) if (row.state === "pending") {
        row.state = row.creating ? "uncertain" : "failed";
        row.error = "Synchronization was interrupted. Retry to check the provider.";
        await this.put(row);
      }
    });
  }
  async initialize() { await this.ready; }
  async close() { try { await this.ready; } finally { await this.persistence.close(); } }
  private async rows(): Promise<Row[]> { return this.persistence.rows(); }
  private async get(id: string) { return (await this.rows()).find((r) => r.id === id); }
  private async put(row: Row) { await this.persistence.put(row); }
  private transaction<T>(fn: () => Promise<T>): Promise<T> { return this.persistence.transaction(fn); }
  private view(row: Row): Entity {
    return { ...row.entity, sync: { state: row.state, revision: row.revision,
      ...(row.error ? { error: row.error } : {}), ...(row.deleting ? { deleting: true } : {}) } };
  }
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => { await this.ready; return this.persistence.exclusive(fn); }); this.queue = result.catch(() => undefined); return result;
  }
  async list() { await this.ready; return (await this.rows()).filter((r) => !r.deleted).map((r) => this.view(r)); }
  async importSource(source: Source, bridge: ProviderBridge) {
    await this.ready;
    if (await this.persistence.hasImport(source)) return;
    const remote = await bridge.list(source);
    const existing = (await this.rows()).filter((r) => r.source === source);
    const map = new Map(remote.map((item) => [item.id, existing.find((r) => r.remoteId === item.id)?.id ?? randomUUID()]));
    await this.transaction(async () => {
      for (const item of remote) {
        if (existing.some((r) => r.remoteId === item.id)) continue;
        const policies = item.policies.map((p) => ({ ...p, policyId: map.get(p.policyId) ?? p.policyId }));
        const entity = entitySchema.parse({ ...item, id: map.get(item.id), source, policies });
        await this.put({ id: entity.id, source, remoteId: item.id, entity, snapshot: item, state: "synced", revision: 1 });
      }
      await this.persistence.markImport(source);
    });
  }
  private async require(id: string) {
    const row = await this.get(id);
    if (!row || row.deleted) throw new StoreError(404, "Record not found.");
    return row;
  }
  private async validate(kind: Kind, draft: Draft, id?: string) {
    const errors = validateDraft(kind, draft, false);
    if (Object.keys(errors).length) throw new StoreError(422, Object.values(errors).join(" "));
    if (kind === "policies" && !draft.text.trim()) throw new StoreError(422, "Enter the rule text.");
    if (kind === "guardrails") {
      if (!draft.policies.length) throw new StoreError(422, "Select at least one policy.");
      if (new Set(draft.policies.map((p) => p.policyId)).size !== draft.policies.length) throw new StoreError(422, "Select each policy only once.");
      for (const ref of draft.policies) {
        const policy = await this.get(ref.policyId);
        if (!policy || policy.deleted || policy.deleting || policy.entity.kind !== "policies" || policy.source !== (draft.source ?? "Guard"))
          throw new StoreError(422, "Select policies from the same source.");
      }
    }
  }
  async save(kind: Kind, draft: Draft, actor: string, bridge: ProviderBridge, id?: string, expected?: number, key?: string) {
    await this.ready;
    const fingerprint = JSON.stringify({ kind, draft });
    if (!id) {
      if (!key) throw new StoreError(422, "An idempotency key is required.");
      const prior = await this.persistence.request(key);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new StoreError(409, "This request key was already used for different data.");
        return this.view(await this.require(prior.record_id));
      }
    }
    const old = id ? await this.require(id) : undefined;
    if (old && (old.entity.kind !== kind || old.source !== (draft.source ?? "Guard"))) throw new StoreError(409, "Source and record type cannot be changed.");
    if (old && old.revision !== expected) throw new StoreError(409, "Record changed. Refresh before saving.");
    if (old?.deleting || old?.state === "uncertain") throw new StoreError(409, "Resolve the pending synchronization before editing.");
    if (old?.entity.remote?.readOnly || old?.entity.status === "Active") throw new StoreError(409, "This provider record is read-only or active.");
    await this.validate(kind, draft, id);
    const now = Date.now();
    const entity = entitySchema.parse({ ...blankDraft, ...old?.entity, ...draft, id: id ?? randomUUID(), kind,
      source: draft.source ?? "Guard", name: draft.name.trim(), owner: old?.entity.owner || "Marketplace",
      createdAt: old?.entity.createdAt || now, updatedAt: now, status: old?.entity.status ?? "Draft", version: old?.entity.version ?? 1 });
    const localOnly = old?.state === "synced" && JSON.stringify(providerFields(old.entity)) === JSON.stringify(providerFields(entity));
    const row: Row = { ...old, id: entity.id, source: entity.source ?? "Guard", entity, createdBy: old?.createdBy ?? actor,
      state: localOnly ? "synced" : "pending", revision: (old?.revision ?? 0) + 1, error: undefined };
    await this.transaction(async () => {
      await this.put(row);
      if (!id) await this.persistence.addRequest(key!, fingerprint, row.id);
    });
    if (!localOnly) await this.synchronize(row, bridge);
    return this.view(row);
  }
  async remove(id: string, expected: number, bridge: ProviderBridge) {
    await this.ready;
    const row = await this.require(id);
    if (row.revision !== expected) throw new StoreError(409, "Record changed. Refresh before deleting.");
    if (row.entity.remote?.readOnly || row.entity.status === "Active") throw new StoreError(409, "This record cannot be deleted while read-only or active.");
    if ((await this.rows()).some((r) => !r.deleted && r.entity.policies.some((p) => p.policyId === id))) throw new StoreError(409, "Remove this policy from its profiles before deleting.");
    if (row.state === "uncertain") throw new StoreError(409, "Reconcile the uncertain creation before deleting.");
    row.deleting = true; row.state = "pending"; row.revision++; await this.put(row);
    await this.synchronize(row, bridge);
    return { deleted: !!row.deleted, item: this.view(row) };
  }
  async retry(id: string, bridge: ProviderBridge) {
    await this.ready;
    const row = await this.require(id);
    if (row.state === "synced") return this.view(row);
    if (row.state === "uncertain" && !row.remoteId) {
      // Reconcile only creations observed after our pre-create snapshot. Never POST again.
      const remote = await bridge.list(row.source);
      const matches = remote.filter((r) => !row.beforeIds?.includes(r.id) && r.kind === row.entity.kind && r.name === row.entity.name &&
        (r.kind !== "policies" || r.text === row.entity.text));
      if (matches.length !== 1) throw new StoreError(409, "Creation result is uncertain. Check the provider; no duplicate create was sent.");
      row.remoteId = matches[0]!.id; row.snapshot = matches[0]!; row.creating = false;
    }
    row.revision++;
    await this.put(row);
    await this.synchronize(row, bridge);
    return this.view(row);
  }
  private async synchronize(row: Row, bridge: ProviderBridge) {
    let createSent = false;
    try {
      row.error = undefined;
      if (row.deleting) {
        if (row.snapshot) await bridge.remove(row.source, row.snapshot);
        row.deleted = true; row.state = "synced"; await this.put(row); return;
      }
      const refs = await Promise.all(row.entity.policies.map(async (ref) => {
        const policy = await this.require(ref.policyId);
        if (!policy.remoteId || policy.deleting || policy.state !== "synced") throw new StoreError(409, "A linked policy has not synchronized. Sync it first.");
        return { ...ref, policyId: policy.remoteId };
      }));
      const draft = { ...blankDraft, name: row.entity.name, text: row.entity.text, source: row.source, policies: refs };
      if (!row.remoteId) {
        row.beforeIds = (await bridge.list(row.source)).map((r) => r.id);
        row.creating = true; row.state = "pending"; await this.put(row); createSent = true;
      }
      const saved = await bridge.save(row.source, row.entity.kind, draft, row.snapshot);
      row.remoteId = saved.id; row.snapshot = saved; row.creating = false;
      row.entity = { ...row.entity, status: saved.status, version: saved.version, revisions: saved.revisions, remote: saved.remote };
      row.state = "synced"; await this.put(row);
    } catch (e) {
      // A definite HTTP rejection means the provider did not accept creation.
      const status = typeof e === "object" && e ? (e as { status?: number }).status : undefined;
      row.state = createSent && !(status && status >= 400 && status < 500) ? "uncertain" : "failed";
      row.creating = row.state === "uncertain";
      row.error = e instanceof Error ? e.message : "Provider synchronization failed.";
      await this.put(row);
    }
  }
}
