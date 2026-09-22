import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { blankDraft, deletionBlocker, entitySchema, restoreIntegratedEntities, saveEntity, type Entity, type Kind } from "../src/features/business-demo/model";
import { guardConfig, guardProxy } from "./guard-api";

const inputSchema = entitySchema.pick({ name: true, text: true, source: true, policies: true,
  useCase: true, busu: true, location: true, agentType: true, dataType: true }).partial()
  .extend({ expectedVersion: z.union([z.number(), z.string()]).optional() }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const error = (status: number, message: string) => reply({ error: { code: `f5_${status}`, message } }, status);

// Single local server only. All writes are serialized and atomically replace the file.
export function createF5Api(file: string) {
  let queue: Promise<unknown> = Promise.resolve();
  async function load(): Promise<Entity[]> {
    try { return z.array(entitySchema).parse(JSON.parse(await readFile(file, "utf8"))); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      const samples = restoreIntegratedEntities(null).filter((p) => p.source === "F5")
        .map((p) => ({ ...p, status: "Ready" as const }));
      await persist(samples); return samples;
    }
  }
  async function persist(items: Entity[]) {
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(items), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, file);
  }
  async function handle(request: Request) {
    const url = new URL(request.url);
    const match = /^\/api\/f5\/(policies|guardrails)(?:\/([A-Za-z0-9_-]+))?$/.exec(url.pathname);
    if (!match || url.search) return error(404, "F5 simulation supports CRUD only.");
    const kind = match[1] as Kind, id = match[2];
    const items = await load(), existing = items.find((p) => p.kind === kind && p.id === id);
    if (id && !existing) return error(404, "Record not found.");
    if (request.method === "GET") return reply(id ? existing : { items: items.filter((p) => p.kind === kind) });
    if (request.method === "DELETE" && existing) {
      const blocked = deletionBlocker(items, existing);
      if (blocked) return error(409, blocked);
      await persist(items.filter((p) => p.id !== id)); return reply({ deleted: true });
    }
    if (!((request.method === "POST" && !id) || (request.method === "PATCH" && existing))) return error(405, "Method not allowed.");
    if (!request.headers.get("content-type")?.startsWith("application/json")) return error(415, "JSON required.");
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 100_000) return error(413, "Request too large.");
    let body: z.infer<typeof inputSchema>;
    try { body = inputSchema.parse(JSON.parse(raw)); } catch { return error(422, "Invalid F5 record fields."); }
    if (body.source && body.source !== "F5") return error(422, "Only F5 records are accepted.");
    if (existing && body.expectedVersion !== existing.version) return error(409, "Record changed. Refresh before saving.");
    const fields = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
    const draft = { ...blankDraft, ...existing, ...fields, source: "F5" as const };
    if (kind === "guardrails" && draft.policies.some((ref) => !items.some((p) => p.kind === "policies" && p.id === ref.policyId))) return error(422, "Select policies from this F5 source.");
    let saved: Entity;
    try { saved = saveEntity(kind, draft, false, Date.now(), id ?? `f5-${randomUUID()}`, existing, items, "F5 simulation"); }
    catch (e) { return error(422, e instanceof Error ? e.message : "Invalid record."); }
    saved.version = existing ? Number(existing.version) + 1 : 1;
    saved.scanDirection = "Both";
    // Ready means configuration is stored; no validation or inference has run.
    saved.status = (kind === "policies" ? !!saved.text.trim() : !!saved.policies.length) ? "Ready" : "Draft";
    await persist([saved, ...items.filter((p) => p.id !== saved.id)]);
    return reply(saved, existing ? 200 : 201);
  }
  return (request: Request): Promise<Response> => {
    const pending = queue.then(() => handle(request));
    queue = pending.catch(() => undefined);
    return pending.catch(() => error(503, "F5 simulation storage is unavailable. Existing data was not replaced."));
  };
}

const stores = new Map<string, ReturnType<typeof createF5Api>>();
export async function f5Proxy(request: Request, env = process.env) {
  let config: ReturnType<typeof guardConfig>;
  try { config = guardConfig(env); } catch { return error(503, "Connection configuration is invalid."); }
  if (env.MARKETPLACE_F5_MOCK !== "true" || !env.F5_MOCK_DATA_FILE || !config.demoToken) return error(404, "Local F5 simulation is not enabled.");
  // Reuse the real local session check; never expose an unauthenticated write API.
  const identityUrl = new URL("/api/guard/account/identity", request.url);
  const authorization = await guardProxy(new Request(identityUrl, { headers: request.headers }), env);
  if (!authorization.ok) return authorization;
  const identity = await authorization.json();
  const module = new URL(request.url).pathname.split("/")[3] ?? "";
  const permission = identity.effectivePermissions?.[module];
  const write = request.method !== "GET";
  if (identity.authentication !== "session" && permission !== "read" && permission !== "write") return error(403, "Access to this module is not permitted.");
  if (write && (identity.role !== "admin" || (identity.authentication !== "session" && permission !== "write"))) return error(403, "Write permission is required.");
  let store = stores.get(env.F5_MOCK_DATA_FILE);
  if (!store) { store = createF5Api(env.F5_MOCK_DATA_FILE); stores.set(env.F5_MOCK_DATA_FILE, store); }
  return store(request);
}
