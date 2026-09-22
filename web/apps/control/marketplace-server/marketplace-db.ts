import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { blankDraft, entitySchema, validateDraft, type Draft, type Entity, type Kind } from "../src/features/business-demo/model";

export type Source = "Guard" | "F5";
export interface ProviderBridge {
  list(source: Source): Promise<Entity[]>;
  save(source: Source, kind: Kind, draft: Draft, existing?: Entity): Promise<Entity>;
  remove(source: Source, item: Entity): Promise<void>;
}
type Row = { id: string; source: Source; remoteId?: string; entity: Entity; snapshot?: Entity;
  createdBy?: string;
  state: "synced" | "pending" | "failed" | "uncertain"; revision: number; error?: string | undefined;
  deleting?: boolean; deleted?: boolean; creating?: boolean; beforeIds?: string[] };
export class StoreError extends Error { constructor(public status: number, message: string) { super(message); } }
const providerFields = (item: Draft) => ({ name: item.name, text: item.text, policies: item.policies });

export class MarketplaceStore {
  private db: DatabaseSync;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, source TEXT NOT NULL, remote_id TEXT, payload TEXT NOT NULL, UNIQUE(source, remote_id));
      CREATE TABLE IF NOT EXISTS imports (source TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS requests (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, record_id TEXT NOT NULL REFERENCES records(id));
      PRAGMA user_version=1;`);
    // A process can stop after sending a create but before recording its response.
    for (const row of this.rows()) if (row.state === "pending") {
      row.state = row.creating ? "uncertain" : "failed";
      row.error = "Synchronization was interrupted. Retry to check the provider.";
      this.put(row);
    }
  }
  close() { this.db.close(); }
  private rows(): Row[] { return (this.db.prepare("SELECT payload FROM records").all() as { payload: string }[]).map((r) => JSON.parse(r.payload)); }
  private get(id: string) { return this.rows().find((r) => r.id === id); }
  private put(row: Row) {
    this.db.prepare("INSERT INTO records(id,source,remote_id,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET remote_id=excluded.remote_id,payload=excluded.payload")
      .run(row.id, row.source, row.remoteId ?? null, JSON.stringify(row));
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  private view(row: Row): Entity {
    return { ...row.entity, sync: { state: row.state, revision: row.revision,
      ...(row.error ? { error: row.error } : {}), ...(row.deleting ? { deleting: true } : {}) } };
  }
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn); this.queue = result.catch(() => undefined); return result;
  }
  list() { return this.rows().filter((r) => !r.deleted).map((r) => this.view(r)); }
  async importSource(source: Source, bridge: ProviderBridge) {
    if (this.db.prepare("SELECT source FROM imports WHERE source=?").get(source)) return;
    const remote = await bridge.list(source);
    const existing = this.rows().filter((r) => r.source === source);
    const map = new Map(remote.map((item) => [item.id, existing.find((r) => r.remoteId === item.id)?.id ?? randomUUID()]));
    this.transaction(() => {
      for (const item of remote) {
        if (existing.some((r) => r.remoteId === item.id)) continue;
        const policies = item.policies.map((p) => ({ ...p, policyId: map.get(p.policyId) ?? p.policyId }));
        const entity = entitySchema.parse({ ...item, id: map.get(item.id), source, policies });
        this.put({ id: entity.id, source, remoteId: item.id, entity, snapshot: item, state: "synced", revision: 1 });
      }
      this.db.prepare("INSERT INTO imports(source) VALUES(?)").run(source);
    });
  }
  private require(id: string) {
    const row = this.get(id);
    if (!row || row.deleted) throw new StoreError(404, "Record not found.");
    return row;
  }
  private validate(kind: Kind, draft: Draft, id?: string) {
    const errors = validateDraft(kind, draft, false);
    if (Object.keys(errors).length) throw new StoreError(422, Object.values(errors).join(" "));
    if (kind === "policies" && !draft.text.trim()) throw new StoreError(422, "Enter the rule text.");
    if (kind === "guardrails") {
      if (!draft.policies.length) throw new StoreError(422, "Select at least one policy.");
      if (new Set(draft.policies.map((p) => p.policyId)).size !== draft.policies.length) throw new StoreError(422, "Select each policy only once.");
      for (const ref of draft.policies) {
        const policy = this.get(ref.policyId);
        if (!policy || policy.deleted || policy.deleting || policy.entity.kind !== "policies" || policy.source !== (draft.source ?? "Guard"))
          throw new StoreError(422, "Select policies from the same source.");
      }
    }
  }
  async save(kind: Kind, draft: Draft, actor: string, bridge: ProviderBridge, id?: string, expected?: number, key?: string) {
    const fingerprint = JSON.stringify({ kind, draft });
    if (!id) {
      if (!key) throw new StoreError(422, "An idempotency key is required.");
      const prior = this.db.prepare("SELECT fingerprint,record_id FROM requests WHERE key=?").get(key) as { fingerprint: string; record_id: string } | undefined;
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new StoreError(409, "This request key was already used for different data.");
        return this.view(this.require(prior.record_id));
      }
    }
    const old = id ? this.require(id) : undefined;
    if (old && (old.entity.kind !== kind || old.source !== (draft.source ?? "Guard"))) throw new StoreError(409, "Source and record type cannot be changed.");
    if (old && old.revision !== expected) throw new StoreError(409, "Record changed. Refresh before saving.");
    if (old?.deleting || old?.state === "uncertain") throw new StoreError(409, "Resolve the pending synchronization before editing.");
    if (old?.entity.remote?.readOnly || old?.entity.status === "Active") throw new StoreError(409, "This provider record is read-only or active.");
    this.validate(kind, draft, id);
    const now = Date.now();
    const entity = entitySchema.parse({ ...blankDraft, ...old?.entity, ...draft, id: id ?? randomUUID(), kind,
      source: draft.source ?? "Guard", name: draft.name.trim(), owner: old?.entity.owner || "Marketplace",
      createdAt: old?.entity.createdAt || now, updatedAt: now, status: old?.entity.status ?? "Draft", version: old?.entity.version ?? 1 });
    const localOnly = old?.state === "synced" && JSON.stringify(providerFields(old.entity)) === JSON.stringify(providerFields(entity));
    const row: Row = { ...old, id: entity.id, source: entity.source ?? "Guard", entity, createdBy: old?.createdBy ?? actor,
      state: localOnly ? "synced" : "pending", revision: (old?.revision ?? 0) + 1, error: undefined };
    this.transaction(() => {
      this.put(row);
      if (!id) this.db.prepare("INSERT INTO requests(key,fingerprint,record_id) VALUES(?,?,?)").run(key!, fingerprint, row.id);
    });
    if (!localOnly) await this.synchronize(row, bridge);
    return this.view(row);
  }
  async remove(id: string, expected: number, bridge: ProviderBridge) {
    const row = this.require(id);
    if (row.revision !== expected) throw new StoreError(409, "Record changed. Refresh before deleting.");
    if (row.entity.remote?.readOnly || row.entity.status === "Active") throw new StoreError(409, "This record cannot be deleted while read-only or active.");
    if (this.rows().some((r) => !r.deleted && r.entity.policies.some((p) => p.policyId === id))) throw new StoreError(409, "Remove this policy from its profiles before deleting.");
    if (row.state === "uncertain") throw new StoreError(409, "Reconcile the uncertain creation before deleting.");
    row.deleting = true; row.state = "pending"; row.revision++; this.put(row);
    await this.synchronize(row, bridge);
    return { deleted: !!row.deleted, item: this.view(row) };
  }
  async retry(id: string, bridge: ProviderBridge) {
    const row = this.require(id);
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
    this.put(row);
    await this.synchronize(row, bridge);
    return this.view(row);
  }
  private async synchronize(row: Row, bridge: ProviderBridge) {
    let createSent = false;
    try {
      row.error = undefined;
      if (row.deleting) {
        if (row.snapshot) await bridge.remove(row.source, row.snapshot);
        row.deleted = true; row.state = "synced"; this.put(row); return;
      }
      const refs = row.entity.policies.map((ref) => {
        const policy = this.require(ref.policyId);
        if (!policy.remoteId || policy.deleting || policy.state !== "synced") throw new StoreError(409, "A linked policy has not synchronized. Sync it first.");
        return { ...ref, policyId: policy.remoteId };
      });
      const draft = { ...blankDraft, name: row.entity.name, text: row.entity.text, source: row.source, policies: refs };
      if (!row.remoteId) {
        row.beforeIds = (await bridge.list(row.source)).map((r) => r.id);
        row.creating = true; row.state = "pending"; this.put(row); createSent = true;
      }
      const saved = await bridge.save(row.source, row.entity.kind, draft, row.snapshot);
      row.remoteId = saved.id; row.snapshot = saved; row.creating = false;
      row.entity = { ...row.entity, status: saved.status, version: saved.version, revisions: saved.revisions, remote: saved.remote };
      row.state = "synced"; this.put(row);
    } catch (e) {
      // A definite HTTP rejection means the provider did not accept creation.
      const status = typeof e === "object" && e ? (e as { status?: number }).status : undefined;
      row.state = createSent && !(status && status >= 400 && status < 500) ? "uncertain" : "failed";
      row.creating = row.state === "uncertain";
      row.error = e instanceof Error ? e.message : "Provider synchronization failed.";
      this.put(row);
    }
  }
}
