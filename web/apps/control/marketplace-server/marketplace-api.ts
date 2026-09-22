import { z } from "zod";
import { guardConfig, guardProxy } from "./guard-api";
import { f5Proxy } from "./f5-api";
import { GuardAdapter, GuardApiError } from "../src/features/business-demo/guard-api";
import { entitySchema, type Entity } from "../src/features/business-demo/model";
import { MarketplaceStore, StoreError, type ProviderBridge } from "./marketplace-db";

const stores = new Map<string, MarketplaceStore>();
const draftSchema = entitySchema.pick({ name: true, text: true, source: true, policies: true, useCase: true, busu: true, location: true, agentType: true, dataType: true, scanDirection: true }).strict();
const bodySchema = z.object({ draft: draftSchema, expectedRevision: z.number().int().positive().optional() }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function bridgeFor(request: Request, env: NodeJS.ProcessEnv): ProviderBridge {
  const headers = new Headers(request.headers);
  const config = guardConfig(env);
  const fetcher: typeof fetch = async (url, options) => {
    const forwarded = new Headers(headers);
    if (options?.body) forwarded.set("Content-Type", "application/json");
    return guardProxy(new Request(new URL(String(url), request.url), { method: options?.method ?? "GET", headers: forwarded, ...(options?.body ? { body: options.body } : {}) }), env);
  };
  const nemo = new GuardAdapter("", { mode: "live", sourceId: config.sourceId, crudOnly: true, policyAuthoring: true }, fetcher);
  async function f5(path: string, method = "GET", body?: unknown): Promise<unknown> {
    const h = new Headers(headers); if (body) h.set("Content-Type", "application/json");
    const response = await f5Proxy(new Request(new URL(`/api/f5/${path}`, request.url), { method, headers: h, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
    const json = await response.json();
    if (!response.ok) throw new StoreError(response.status, json.error?.message ?? "F5 API failed.");
    return json;
  }
  const listSchema = z.object({ items: z.array(entitySchema) });
  return {
    async list(source) {
      if (source === "Guard") return nemo.load();
      const [p, g] = await Promise.all([f5("policies"), f5("guardrails")]);
      return [...listSchema.parse(p).items, ...listSchema.parse(g).items];
    },
    async save(source, kind, draft, existing) {
      if (source === "F5") return entitySchema.parse(await f5(`${kind}${existing ? `/${existing.id}` : ""}`, existing ? "PATCH" : "POST",
        { name: draft.name, text: draft.text, policies: draft.policies, source: "F5", ...(existing ? { expectedVersion: existing.version } : {}) }));
      await nemo.load();
      const id = await nemo.save(kind, draft, false, existing);
      try {
        const saved = (await nemo.load()).find((r) => r.kind === kind && r.id === id);
        if (saved) return saved;
      } catch { /* The write already succeeded; a read rejection must not trigger another create. */ }
      throw new Error("Saved to Nemo, but the result could not be read. Reconcile before retrying.");
    },
    async remove(source, item) {
      try {
        if (source === "F5") await f5(`${item.kind}/${item.id}`, "DELETE");
        else await nemo.remove(item);
      } catch (e) {
        if ((e instanceof StoreError || e instanceof GuardApiError) && e.status === 404) return;
        throw e;
      }
    },
  };
}

export async function marketplaceApi(request: Request, env = process.env) {
  try {
    if (!env.MARKETPLACE_DB_FILE || env.MARKETPLACE_CRUD_ONLY !== "true") throw new StoreError(404, "Marketplace database API is not enabled.");
    const url = new URL(request.url);
    const match = /^\/api\/marketplace\/(items|policies|guardrails)(?:\/([a-zA-Z0-9-]+))?(?:\/(sync))?$/.exec(url.pathname);
    if (!match || url.search) throw new StoreError(404, "Route not found.");
    const [, kind, id, action] = match;
    const identityResponse = await guardProxy(new Request(new URL("/api/guard/account/identity", url), { headers: request.headers }), env);
    if (!identityResponse.ok) return identityResponse;
    const identity = await identityResponse.json();
    const write = request.method !== "GET";
    for (const module of kind === "items" ? ["policies", "guardrails"] : [kind!]) {
      const grant = identity.effectivePermissions?.[module];
      if (identity.authentication !== "session" && !["read", "write"].includes(grant)) throw new StoreError(403, "Module access is required.");
      if (write && (identity.role !== "admin" || (identity.authentication !== "session" && grant !== "write"))) throw new StoreError(403, "Write permission is required.");
    }
    let store = stores.get(env.MARKETPLACE_DB_FILE);
    if (!store) { store = new MarketplaceStore(env.MARKETPLACE_DB_FILE); stores.set(env.MARKETPLACE_DB_FILE, store); }
    const db = store, bridge = bridgeFor(request, env);
    return await db.exclusive(async () => {
      if (request.method === "GET" && !id && kind === "items") {
        const warnings: string[] = [];
        for (const source of ["Guard", ...(env.MARKETPLACE_F5_MOCK === "true" ? ["F5"] : [])] as const) {
          try { await db.importSource(source as "Guard" | "F5", bridge); }
          catch { warnings.push(`${source === "Guard" ? "Nemo" : "F5"} initial import unavailable; local records are retained. Refresh to retry.`); }
        }
        return reply({ items: db.list(), warnings });
      }
      if (kind !== "policies" && kind !== "guardrails") throw new StoreError(405, "Method not allowed.");
      if (id && !db.list().some((r) => r.id === id && r.kind === kind)) throw new StoreError(404, "Record not found.");
      if (request.method === "GET" && id) return reply(db.list().find((r) => r.id === id));
      if (action === "sync" && id && request.method === "POST") return reply(await db.retry(id, bridge));
      if (!request.headers.get("Content-Type")?.startsWith("application/json")) throw new StoreError(415, "JSON required.");
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 100_000) throw new StoreError(413, "Request too large.");
      let body: unknown; try { body = JSON.parse(raw); } catch { throw new StoreError(422, "Invalid JSON."); }
      if (request.method === "DELETE" && id && !action) {
        const parsed = z.object({ expectedRevision: z.number().int().positive() }).strict().parse(body);
        return reply(await db.remove(id, parsed.expectedRevision, bridge));
      }
      if (!action && ((request.method === "POST" && !id) || (request.method === "PATCH" && id))) {
        const parsed = bodySchema.parse(body);
        const key = request.headers.get("Idempotency-Key");
        if (key && !/^[a-zA-Z0-9-]{8,100}$/.test(key)) throw new StoreError(422, "Invalid idempotency key.");
        return reply(await db.save(kind, parsed.draft, identity.userId, bridge, id, parsed.expectedRevision, key ?? undefined), id ? 200 : 201);
      }
      throw new StoreError(405, "Method not allowed.");
    });
  } catch (e) {
    const status = e instanceof StoreError ? e.status : e instanceof z.ZodError ? 422 : 503;
    return reply({ error: { code: `marketplace_${status}`, message: e instanceof StoreError ? e.message : status === 422 ? "Invalid record fields." : "Marketplace database is unavailable." } }, status);
  }
}
