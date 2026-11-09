import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const storage = vi.hoisted(() => new Map<string, any>());
vi.mock("./storage/database", () => ({ openDatabase: async () => ({ exclusive: (fn: () => Promise<unknown>) => fn(), readDocument: async (id: string) => structuredClone(storage.get(id)), writeDocument: async (id: string, value: unknown) => { storage.set(id, structuredClone(value)); } }) }));
import { nmgrApi, nmgrConfiguration } from "./nmgr-api";
import { assertOpenApiResponse } from "./test-utils/openapi";
const env = { MARKETPLACE_DATA_MODE: "live", GUARD_API_URL: "https://nemo.internal/api/v1", MARKETPLACE_PUBLIC_ORIGIN: "https://marketplace.internal", MARKETPLACE_DATABASE_URL: "mariadb://test@localhost/rest", MARKETPLACE_V2_ACCOUNTS_JSON: JSON.stringify({ user: { name: "Author", role: "User", unit: "ISS" }, tech: { name: "Tech", role: "IT Admin", unit: "ISS" }, approver: { name: "Approver", role: "User Admin", unit: "ISS" } }) };
const docKey = () => `nmgr:${nmgrConfiguration(env).workspace}`;
const draft = { name: "Control", description: "Block secrets", location: "ALL", mandatory: false, refs: [], attributes: { bu: "", agent: "", data: "" }, threshold: 5 };
const entity = (id: string, kind = "Guardrail", unit = "ISS", status = "DRAFT") => ({ ...draft, id, kind, unit, status, provider: "NeMo", custodian: "Author", approver: "Approver", version: 1, deployed: null, updated: "2026-11-05T00:00:00Z", policies: [], deployedRefs: [], runs: [], mode: "Normal" });
const fetcher = vi.fn<typeof fetch>(async (url, init) => {
  if (String(url).endsWith("/account/identity")) return Response.json({ userId: new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") ?? "user", role: "user", effectivePermissions: { policies: "write", guardrails: "write" } });
  if (String(url).endsWith("/policies") || String(url).endsWith("/guardrails")) return Response.json({ items: [], count: 0 });
  throw new Error("Unexpected upstream request");
});
async function request(path: string, method = "GET", body?: unknown, actor = "user", headers = {}) {
  const req = new Request(`https://marketplace.internal/api/nmgr/v1${path}`, { method, headers: { Authorization: `Bearer ${actor}`, Origin: "https://marketplace.internal", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const response = await nmgrApi(req, env, fetcher);
  await assertOpenApiResponse(req, response);
  return response;
}
beforeEach(() => { storage.clear(); fetcher.mockClear(); storage.set(docKey(), { revision: 4, state: { entities: [entity("guard-one"), entity("guard-two"), entity("profile-one", "Profile"), entity("hidden-record", "Profile", "RMG")], audit: [] }, jobs: {}, bindings: {}, requests: {}, authors: { "guard-one": "user" }, requestors: {} }); });

it("lists profiles with server pagination, excludes other units and ignores legacy import headers", async () => {
  const response = await request("/profiles?page=1&pageSize=1", "GET", undefined, "user", { "X-Marketplace-Import": "true" });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ revision: 4, items: [{ id: "profile-one", kind: "Profile" }], pagination: { page: 1, pageSize: 1, total: 1 } });
  expect(fetcher.mock.calls).toHaveLength(1);
});
it("searches and sorts deterministically before pagination", async () => {
  const response = await request("/guardrails?q=guard&sort=id&order=desc&pageSize=1");
  expect(await response.json()).toMatchObject({ items: [{ id: "guard-two" }], pagination: { total: 2 } });
});
it.each(["page=0", "pageSize=101", "page=NaN", "page=1&page=2", "unknown=true", "__proto__=ignored", "status=INVALID", "sort=password", "provider=Unknown"])("rejects invalid list query %s", async query => {
  expect((await request(`/profiles?${query}`)).status).toBe(422);
});
it("does not return a wrong-kind or invisible resource", async () => {
  expect((await request("/profiles/guard-one")).status).toBe(404);
  expect((await request("/profiles/hidden-record")).status).toBe(404);
  const response = await request("/profiles/profile-one");
  expect(await response.json()).toMatchObject({ item: { id: "profile-one" }, relatedGuardrails: [] });
});
it("provides scoped workflow queues, audit and explicit unavailable capabilities", async () => {
  const doc = storage.get(docKey());
  doc.state.entities[0].status = "SIGNOFF REQUESTED";
  doc.state.entities[1].status = "SIGNED OFF";
  doc.state.audit = [{ id: "a", entity: "guard-one", action: "created", actor: "Author", time: "2026-11-05T00:00:00Z" }, { id: "b", entity: "hidden-record", action: "created", actor: "Other", time: "2026-11-05T00:00:00Z" }];
  expect(await (await request("/approval-requests")).json()).toMatchObject({ items: [{ id: "guard-one" }] });
  expect(await (await request("/deployments")).json()).toMatchObject({ items: [{ id: "guard-two" }] });
  expect(await (await request("/audit-events")).json()).toMatchObject({ items: [{ id: "a" }], pagination: { total: 1 } });
  expect(await (await request("/dashboard/summary")).json()).toMatchObject({ metrics: { traffic: null, runtimeConnected: false } });
  expect(await (await request("/capabilities")).json()).toMatchObject({ capabilities: { measure: { available: false }, runtimeControl: { available: false } } });
});
it("creates through the same business command and retains idempotency and old snapshot compatibility", async () => {
  const payload = { requestId: randomUUID(), expectedRevision: 4, draft: { id: "new-control", ...draft } };
  const created = await request("/guardrails", "POST", payload);
  expect(created.status).toBe(201);
  expect(await created.json()).toMatchObject({ item: { id: "new-control", kind: "Guardrail", sourcePending: true } });
  expect((await request("/guardrails", "POST", payload)).status).toBe(201);
  const old = await nmgrApi(new Request("https://marketplace.internal/api/nmgr/workspace", { headers: { Authorization: "Bearer user" } }), env, fetcher);
  const data = await old.json();
  expect(data.state.entities.filter((e: any) => e.id === "new-control")).toHaveLength(1);
});
it("rejects stale writes and URI/body identity overrides", async () => {
  expect((await request("/guardrails/guard-one", "PUT", { requestId: randomUUID(), expectedRevision: 0, draft })).status).toBe(409);
  expect((await request("/profiles/guard-one", "PUT", { requestId: randomUUID(), expectedRevision: 4, draft })).status).toBe(404);
  expect((await request("/profiles", "POST", { requestId: randomUUID(), expectedRevision: 4, draft: { id: "injected", ...draft, kind: "Guardrail" } })).status).toBe(422);
});
it("imports only via explicit POST and exposes no invented background job", async () => {
  const response = await request("/integrations/nemo/imports", "POST", {});
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ imported: { guardrails: 0, profiles: 0 } });
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/policies"))).toBe(true);
});

it("queues evaluation with 202 and Location, retrieves jobs, and reports an uncertain write without fake success", async () => {
  const doc = storage.get(docKey()), e = doc.state.entities[0];
  e.status = "TEST READY"; e.config = { scannerType: "keyword", direction: "request", content: "secret", versionName: "v1", versionDescription: "" };
  const response = await request("/guardrails/guard-one/evaluations", "POST", { requestId: randomUUID(), expectedRevision: 4, dataset: "Test", cases: [{ input: "secret", expected: "block", phase: "input" }] }, "tech");
  expect(response.status).toBe(202);
  expect(response.headers.get("Location")).toBe("/api/nmgr/v1/jobs/guard-one");
  const queued = await response.json(); expect(queued).toMatchObject({ jobId: "guard-one", job: { status: "pending" } });
  expect(await (await request("/jobs/guard-one", "GET", undefined, "tech")).json()).toMatchObject({ item: { id: "guard-one", status: "pending" } });
  const result = await request("/jobs/guard-one/advance", "POST", { requestId: randomUUID(), expectedRevision: queued.revision }, "tech");
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ job: { status: "uncertain" } });
});

it("keeps approvals authoritative and requires an independent approver", async () => {
  const doc = storage.get(docKey()); doc.state.entities[0].status = "SIGNOFF REQUESTED";
  expect((await request("/approval-requests/guard-one/approve", "POST", { requestId: randomUUID(), expectedRevision: 4 })).status).toBe(403);
  const result = await request("/approval-requests/guard-one/approve", "POST", { requestId: randomUUID(), expectedRevision: 4 }, "approver");
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ item: { status: "SIGNED OFF" } });
});

it("filters jobs and evaluations by resource and returns only recorded evidence", async () => {
  const doc = storage.get(docKey());
  doc.jobs["guard-one"] = { actor: "tech", phase: "policy-save", status: "pending", started: "2026-11-05T00:00:00Z", definition: { private: "hidden" } };
  doc.state.entities[0].runs = [{ id: "run-one", version: 1, base: null, dataset: "Acceptance", passed: true, start: "2026-11-05T00:00:00Z", end: "2026-11-05T00:01:00Z", cases: 1 }];
  expect(await (await request("/jobs?resourceId=guard-one&status=pending")).json()).toMatchObject({ items: [{ id: "guard-one" }], pagination: { total: 1 } });
  expect(await (await request("/evaluations?resourceId=guard-one")).json()).toMatchObject({ items: [{ id: "run-one" }], pagination: { total: 1 } });
  expect(await (await request("/evaluations/run-one")).json()).toMatchObject({ item: { resourceId: "guard-one", passed: true } });
  expect(await (await request("/jobs/guard-one")).text()).not.toContain("hidden");
});

it("includes real Profile deployment evaluations in history and detail", async () => {
  storage.get(docKey()).state.entities[2].runs = [{ id: "profile-run", version: 1, base: null, dataset: "Frozen profile", passed: true, start: "2026-11-05T00:00:00Z", end: "2026-11-05T00:01:00Z", cases: 1 }];
  expect(await (await request("/evaluations?resourceId=profile-one")).json()).toMatchObject({ items: [{ id: "profile-run", resourceId: "profile-one" }], pagination: { total: 1 } });
  expect(await (await request("/evaluations/profile-run")).json()).toMatchObject({ item: { id: "profile-run", resourceId: "profile-one" } });
});
