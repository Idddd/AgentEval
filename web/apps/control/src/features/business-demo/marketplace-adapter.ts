import { z } from "zod";
import { GuardAdapter, jsonRequest } from "./guard-api";
import { blankDraft, entitySchema, type Draft, type Entity, type Kind } from "./model";

export class MarketplaceAdapter extends GuardAdapter {
  warnings: string[] = [];
  private requestKeys = new Map<string, string>();
  async load() {
    const data = z.object({ items: z.array(entitySchema), warnings: z.array(z.string()).default([]) })
      .parse(await jsonRequest("/api/marketplace/items", this.token));
    this.warnings = data.warnings;
    return data.items;
  }
  async save(kind: Kind, draft: Draft, _submit: boolean, existing?: Entity) {
    draft = Object.fromEntries(Object.keys(blankDraft).map((key) => [key, draft[key as keyof Draft]])) as Draft;
    const fingerprint = JSON.stringify({ kind, draft });
    let key = this.requestKeys.get(fingerprint);
    if (!key) { key = crypto.randomUUID(); this.requestKeys.set(fingerprint, key); }
    const withKey: typeof fetch = (url, options) => fetch(url, { ...options, headers: { ...options?.headers, "Idempotency-Key": key! } });
    const saved = entitySchema.parse(await jsonRequest(`/api/marketplace/${kind}${existing ? `/${existing.id}` : ""}`, this.token,
      existing ? "PATCH" : "POST", { draft, ...(existing ? { expectedRevision: existing.sync?.revision } : {}) }, withKey));
    this.requestKeys.delete(fingerprint);
    return saved.id;
  }
  async remove(item: Entity) {
    await jsonRequest(`/api/marketplace/${item.kind}/${item.id}`, this.token, "DELETE", { expectedRevision: item.sync?.revision });
  }
  async retry(item: Entity) {
    await jsonRequest(`/api/marketplace/${item.kind}/${item.id}/sync`, this.token, "POST");
  }
}
