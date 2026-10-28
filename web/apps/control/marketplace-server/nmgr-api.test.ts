import { beforeEach, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => new Map<string, unknown>());
vi.mock("./storage/database", () => ({ openDatabase: async () => ({ exclusive: (fn: () => Promise<unknown>) => fn(), readDocument: async (id: string) => structuredClone(storage.get(id)), writeDocument: async (id: string, value: unknown) => { storage.set(id, structuredClone(value)); } }) }));
import { nmgrApi } from "./nmgr-api";
const env = { MARKETPLACE_DATA_MODE: "live", GUARD_API_URL: "https://nemo.internal/api/v1", MARKETPLACE_PUBLIC_ORIGIN: "https://marketplace.internal", MARKETPLACE_DATABASE_URL: "mariadb://test@localhost/test", MARKETPLACE_V2_ACCOUNTS_JSON: JSON.stringify({ user: { name: "Author", role: "User", unit: "ISS" } }), F5_API_URL: "https://f5.internal/backend/v1", F5_API_TOKEN: "server-f5-secret" };
beforeEach(() => storage.clear());
it("keeps user identity separate while querying NeMo with the server token", async () => {
  const { nmgrConfiguration } = await import("./nmgr-api");
  const tokenEnv = { ...env, GUARD_API_TOKEN: "server-nemo-token" };
  const workspace = nmgrConfiguration(tokenEnv).workspace;
  storage.set(`nmgr:${workspace}`, { revision: 4, state: { entities: [{ id: "control", version: 1, unit: "ISS", kind: "Guardrail", provider: "NeMo" }], audit: [] }, bindings: { "control@1": { policyId: "remote", revision: 2 } }, jobs: {}, requests: {}, authors: {}, requestors: {} });
  const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith("/account/identity") ? Response.json({ userId: "user", role: "user", effectivePermissions: { policies: "read", guardrails: "read" } }) : Response.json({ revision: 2, definition: { metadata: { id: "remote" } } }));
  const response = await nmgrApi(new Request("https://marketplace.internal/api/nmgr/workspace?resource=control", { headers: { Authorization: "Bearer user-token" } }), tokenEnv, fetcher);
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain("server-nemo-token");
  expect(new Headers(fetcher.mock.calls[0]![1]!.headers).get("authorization")).toBe("Bearer user-token");
  expect(new Headers(fetcher.mock.calls[1]![1]!.headers).get("authorization")).toBe("Bearer server-nemo-token");
  expect((await nmgrApi(new Request("https://marketplace.internal/api/nmgr/workspace"), tokenEnv, fetcher)).status).toBe(401);
});
it("allows read-only users to actively query a visible resource without writing", async () => {
  const { nmgrConfiguration } = await import("./nmgr-api");
  const workspace = nmgrConfiguration(env).workspace;
  storage.set(`nmgr:${workspace}`, { revision: 4, state: { entities: [{ id: "control", version: 1, unit: "ISS", kind: "Guardrail", provider: "NeMo" }], audit: [] }, bindings: { "control@1": { policyId: "remote", revision: 2 } }, jobs: {}, requests: {}, authors: {}, requestors: {} });
  const fetcher = vi.fn(async (url: any, init?: RequestInit) => url.toString().endsWith("/account/identity") ? Response.json({ userId: "user", role: "user", effectivePermissions: { policies: "read", guardrails: "read" } }) : Response.json({ revision: 2, definition: { metadata: { id: "remote" } } }));
  const response = await nmgrApi(new Request("https://marketplace.internal/api/nmgr/workspace?resource=control", { headers: { Authorization: "Bearer user-token" } }), env, fetcher);
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ status: "available", revision: 4 });
  expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
});
it("advertises F5 without exposing the configured credential or forwarding it to NeMo identity", async () => {
  const calls: any[] = [];
  const fetcher: typeof fetch = async (url, init) => { calls.push({ url, init }); return Response.json({ userId: "user", role: "user", effectivePermissions: { policies: "write", guardrails: "write" } }); };
  const response = await nmgrApi(new Request("https://marketplace.internal/api/nmgr/workspace", { headers: { Authorization: "Bearer nemo-user-token" } }), env, fetcher);
  expect(response.status).toBe(200);
  const value = await response.json(); expect(value.sources).toEqual(["NeMo", "F5"]);
  expect(JSON.stringify(value)).not.toContain("server-f5-secret");
  expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer nemo-user-token");
  expect(calls[0].url.toString()).toContain("nemo.internal");
});
it("rejects User source selection at the API boundary", async () => {
  const { F5_API_URL, F5_API_TOKEN, ...nemoEnv } = env;
  const response = await nmgrApi(new Request("https://marketplace.internal/api/nmgr/commands", { method: "POST", headers: { "Content-Type": "application/json", Origin: env.MARKETPLACE_PUBLIC_ORIGIN, Authorization: "Bearer user-token" }, body: JSON.stringify({ type: "create", requestId: crypto.randomUUID(), expectedRevision: 0, draft: { id: "f5-test", provider: "F5", kind: "Guardrail", name: "Test", description: "Test control", location: "ALL", mandatory: false, refs: [], attributes: { bu: "", agent: "", data: "" }, threshold: 5 } }) }), nemoEnv, async () => Response.json({ userId: "user", role: "user", effectivePermissions: { policies: "write", guardrails: "write" } }));
  expect(response.status).toBe(403);
  expect((await response.json()).error.message).toMatch(/Only Tech/);
});
