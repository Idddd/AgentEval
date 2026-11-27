import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const storage = vi.hoisted(() => new Map<string, any>());
// Model the database adapter's exclusive workspace lock for overlapping HTTP requests.
let pending = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>) {
  const result = pending.then(fn);
  pending = result.then(() => {}, () => {});
  return result;
}
vi.mock("./storage/database", () => ({ openDatabase: async () => ({ exclusive, readDocument: async (id: string) => structuredClone(storage.get(id)), writeDocument: async (id: string, value: unknown) => { storage.set(id, structuredClone(value)); } }) }));
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

it("returns the authenticated actor and never treats a role header as identity", async () => {
  const approver = await request("/me", "GET", undefined, "approver");
  expect(approver.status).toBe(200);
  expect(approver.headers.get("Cache-Control")).toBe("no-store");
  expect(await approver.json()).toEqual({
    actor: { id: "approver", name: "Approver", role: "User Admin", unit: "ISS" },
    accessMode: "authenticated",
  });
  const user = await request("/me", "GET", undefined, "user", { "X-Marketplace-Role": "User Admin" });
  expect((await user.json()).actor.role).toBe("User");
  expect((await request("/me", "GET", undefined, "unmapped")).status).toBe(403);
  expect((await request("/me?role=approver")).status).toBe(422);
});

it("returns current identity to an allowed frontend with a user Bearer token", async () => {
  const origin = "https://portal.example.invalid";
  const strict = { ...env, MARKETPLACE_V3_DEMO: "false", MARKETPLACE_ALLOWED_BROWSER_ORIGINS: JSON.stringify([origin]) };
  const url = "https://marketplace.internal/api/nmgr/v1/me";
  const preflight = await nmgrApi(new Request(url, { method: "OPTIONS", headers: {
    Origin: origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization",
  } }), strict, fetcher);
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  expect((await nmgrApi(new Request(url, { headers: { Origin: origin } }), strict, fetcher)).status).toBe(401);
  const response = await nmgrApi(new Request(url, { headers: { Origin: origin, Authorization: "Bearer approver" } }), strict, fetcher);
  expect(response.status).toBe(200);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  expect((await response.json()).actor.role).toBe("User Admin");
});

it("allows all V3 Demo roles to start managed evaluations behind an intranet proxy, without changing strict authorization", async () => {
  const doc = storage.get(docKey())!;
  doc.state.entities[0].status = "TEST READY";
  doc.jobs["guard-one"] = { actor: "tech", phase: "sync-policy-save", status: "pending", purpose: "draft-sync", started: new Date().toISOString() };
  const shared = { ...env, HOST: "0.0.0.0", MARKETPLACE_V3_DEMO: "true", GUARD_API_TOKEN: "fixture-demo-token", MARKETPLACE_EVALUATION_URL: "https://eval.internal" };
  const handler = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/account/identity")) return fetcher(url, init);
    if (path.endsWith("/targets")) return Response.json({ items: [{ id: "demo-suite", name: "Shared suite", version: 3 }], total: 1 });
    if (path.endsWith("/config")) return Response.json({ id: "demo-suite", version: 1, revision: "1:1", execution_mode: "guardrail", data_source: "published", default_endpoint: { provider: "nemo guardrail", guardrail_id: "nemo" }, datasets: [{ dataset_id: "suite", dataset_version: 1 }] });
    if (path.endsWith("/runs")) return Response.json({ id: "eval-a", experiment_id: "exp-a", status: "RUNNING", phase: "QUEUED", completed: 0, sample_count: 1, created_at: "2026-11-24", execution_mode: "guardrail", target_id: "demo-suite", guardrail_provider: "nemo guardrail", guardrail_instance_id: "nemo", snapshot: { target: { version: 1 } } });
    return Response.json({ items: [] });
  });
  const endpoint = "http://marketplace-service:8080/api/nmgr/guardrail-evaluation?guardrail=guard-one&version=1";
  for (const role of ["User", "User Admin", "IT Admin"]) {
    const headers = { Origin: env.MARKETPLACE_PUBLIC_ORIGIN, "X-Marketplace-Role": role, "Idempotency-Key": randomUUID() };
    const setup = new Request(endpoint, { headers });
    const setupResponse = await nmgrApi(setup, shared, handler);
    expect(setupResponse.status).toBe(200);
    await assertOpenApiResponse(setup, setupResponse);
    const start = new Request(endpoint + "&target=demo-suite&revision=1%3A1", { method: "POST", headers });
    const startResponse = await nmgrApi(start, shared, handler);
    expect(startResponse.status).toBe(202);
    await assertOpenApiResponse(start, startResponse);
  }
  const unrelated = new Request(endpoint + "&revision=1%3A1", { method: "POST", headers: { Origin: "https://elsewhere.internal" } });
  expect((await nmgrApi(unrelated, shared, handler)).status).toBe(403);
  expect((await nmgrApi(new Request(endpoint, { headers: { authorization: "Bearer user" } }), { ...env, MARKETPLACE_EVALUATION_URL: "https://eval.internal" }, handler)).status).toBe(403);
  expect(handler.mock.calls.filter(([url, init]) => String(url).endsWith("/runs") && init?.method === "POST")).toHaveLength(3);
});

it("exposes an independent F5 import endpoint with scoped counts and a Swagger-validated catalog", async () => {
  const f5Env = { ...env, F5_API_URL: "https://f5.internal/backend/v1", F5_API_TOKEN: "test-only-token" };
  const remote = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).includes("/account/identity")) return fetcher(url, init);
    expect(init?.method).toBe("GET");
    if (String(url).endsWith("/scanners?limit=100")) return Response.json({ scanners: [{ id: "scanner-real" }] });
    if (String(url).endsWith("/projects?limit=100")) return Response.json({ projects: [{ id: "project-real" }] });
    if (String(url).endsWith("/scanners/scanner-real")) return Response.json({ scanner: { id: "scanner-real", name: "External Scanner", direction: "request", versionMeta: { id: "version-real", name: "v1", published: false } } });
    if (String(url).endsWith("/scanners/scanner-real/versions")) return Response.json({ versions: [{ id: "version-real", name: "v1", published: false }] });
    if (String(url).endsWith("/projects/project-real")) return Response.json({ project: { id: "project-real", name: "External Project", deploymentStatus: "draft", config: { scanners: [{ id: "scanner-real", version: "version-real", enabled: false }] } } });
    throw Error("Unexpected request");
  });
  const req = new Request("https://marketplace.internal/api/nmgr/v1/integrations/f5/imports", { method: "POST", headers: { Authorization: "Bearer user", Origin: "https://marketplace.internal", "Content-Type": "application/json" }, body: "{}" });
  const response = await nmgrApi(req, f5Env, remote); await assertOpenApiResponse(req, response);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ imported: { guardrails: 1, profiles: 1 } });
  expect(remote.mock.calls.some(([url]) => /\/(policies|guardrails)$/.test(String(url)))).toBe(false);
  const list = new Request("https://marketplace.internal/api/nmgr/v1/profiles?provider=F5", { headers: { Authorization: "Bearer user" } });
  const listed = await nmgrApi(list, f5Env, remote); await assertOpenApiResponse(list, listed);
  expect(await listed.json()).toMatchObject({ items: [{ imported: { f5: { scannerBindings: [{ version: "version-real", enabled: false }] } } }] });
});
it("reports F5 catalog validation paths without payloads and keeps NeMo list access working", async () => {
  const f5Env = { ...env, F5_API_URL: "https://f5.internal/backend/v1", F5_API_TOKEN: "test-only-token" };
  const remote: typeof fetch = async (url, init) => String(url).includes("/account/identity") ? fetcher(url, init) : Response.json({ scanners: "secret-raw-payload" });
  const req = new Request("https://marketplace.internal/api/nmgr/v1/integrations/f5/imports", { method: "POST", headers: { Authorization: "Bearer user", Origin: "https://marketplace.internal", "Content-Type": "application/json" }, body: "{}" });
  const response = await nmgrApi(req, f5Env, remote); await assertOpenApiResponse(req, response);
  expect(response.status).toBe(502); const error = await response.json();
  expect(error.error).toMatchObject({ component: "f5", code: "f5_catalog_invalid", responseValidation: { endpoint: "/scanners", phase: "catalog-import" } });
  expect(error.error.message).toContain("scanners: expected array");
  expect(JSON.stringify(error)).not.toContain("secret-raw-payload");
  const list = await nmgrApi(new Request("https://marketplace.internal/api/nmgr/v1/guardrails?provider=NeMo", { headers: { Authorization: "Bearer user" } }), f5Env, remote);
  expect(list.status).toBe(200); expect((await list.json()).items).toHaveLength(2);
});

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
it("lists known business versions from current state, snapshots, deployment, bindings and evaluations", async () => {
  const doc = storage.get(docKey());
  const guard = doc.state.entities[0];
  Object.assign(guard, { version: 9, deployed: 6, revisions: { 3: draft }, runs: [{ version: 5 }, { version: 9 }] });
  doc.bindings["guard-one@4"] = {};
  doc.bindings["guard-two@2"] = {};
  const versions = await request("/guardrails/guard-one/versions");
  expect(versions.status).toBe(200);
  const { items } = await versions.json();
  expect(items.map((row: { version: number }) => row.version)).toEqual([9, 6, 5, 4, 3]);
  expect(items[0]).toMatchObject({ isCurrent: true, isDeployed: false });
  expect(items[1]).toMatchObject({ isCurrent: false, isDeployed: true });
  expect(await (await request("/profiles/profile-one/versions")).json()).toMatchObject({ items: [{ version: 1, isCurrent: true, isDeployed: false }] });
  expect((await request("/profiles/hidden-record/versions")).status).toBe(404);
  expect((await request("/profiles/guard-one/versions")).status).toBe(404);
});
it("returns visible draft and deployed Profile references once per Profile", async () => {
  const doc = storage.get(docKey());
  Object.assign(doc.state.entities[2], { refs: ["guard-one"], deployedRefs: ["guard-one"], deployed: 1 });
  doc.state.entities[3].refs = ["guard-one"];
  doc.state.entities.push({ ...entity("published-profile", "Profile"), deployed: 1, deployedRefs: ["guard-one"] });
  const guard = await (await request("/guardrails/guard-one")).json();
  expect(guard.usedByProfiles).toHaveLength(2);
  expect(guard.usedByProfiles).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "profile-one", draftReference: true, deployedReference: true }),
    expect.objectContaining({ id: "published-profile", draftReference: false, deployedReference: true }),
  ]));
  expect((await (await request("/guardrails/guard-two")).json()).usedByProfiles).toEqual([]);
  expect((await (await request("/profiles/profile-one")).json()).relatedGuardrails.map((g: { id: string }) => g.id)).toEqual(["guard-one"]);
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
it("creates without a client resource ID and returns the same item on retry", async () => {
  const payload = { requestId: randomUUID(), draft };
  const created = await request("/guardrails", "POST", payload);
  expect(created.status).toBe(201);
  const { item } = await created.json();
  expect(item.id).toMatch(/^[a-z][a-z0-9-]{2,63}$/);
  const retry = await request("/guardrails", "POST", payload);
  expect(retry.status).toBe(201);
  expect((await retry.json()).item.id).toBe(item.id);
  expect((await (await request("/guardrails/" + item.id)).json()).item.id).toBe(item.id);
});
it("explains the required format when a supplied draft.id is invalid", async () => {
  const response = await request("/guardrails", "POST", { requestId: randomUUID(), draft: { ...draft, id: "123" } });
  expect(response.status).toBe(422);
  expect((await response.json()).error.message).toMatch(/draft\.id.*lowercase letter/);
});
it("rejects stale writes and URI/body identity overrides", async () => {
  expect((await request("/guardrails/guard-one", "PUT", { requestId: randomUUID(), expectedRevision: 0, draft })).status).toBe(409);
  expect((await request("/profiles/guard-one", "PUT", { requestId: randomUUID(), expectedRevision: 4, draft })).status).toBe(404);
  expect((await request("/profiles", "POST", { requestId: randomUUID(), expectedRevision: 4, draft: { id: "injected", ...draft, kind: "Guardrail" } })).status).toBe(422);
});

it("accepts simultaneous independent creates with missing or stale revisions", async () => {
  const payloads = Array.from({ length: 16 }, (_, i) => ({
    requestId: randomUUID(), draft: { id: `parallel-${i}`, ...draft }, ...(i % 2 ? { expectedRevision: 0 } : {}),
  }));
  const results = await Promise.all(payloads.map(body => request("/guardrails", "POST", body)));
  expect(results.map(r => r.status)).toEqual(payloads.map(() => 201));
  const list = await (await request("/guardrails?q=parallel")).json();
  expect(list.pagination.total).toBe(payloads.length);
  expect(list.revision).toBe(4 + payloads.length);
  const payload = { requestId: randomUUID(), draft: { ...draft, id: "shared-control" } };
  const duplicate = await Promise.all([payload, { ...payload, requestId: randomUUID() }].map(body => request("/guardrails", "POST", body)));
  expect(duplicate.map(r => r.status).sort()).toEqual([201, 409]);
  const replay = await request("/guardrails", "POST", payload);
  expect(replay.status).toBe(duplicate[0]!.status);
});

it("edits independent records from one snapshot and rejects a stale edit to the same record", async () => {
  const doc = storage.get(docKey());
  doc.authors["guard-two"] = "user";
  for (const item of doc.state.entities) item.sourcePending = true;
  const originalRevision = doc.revision;
  await request("/integrations/nemo/imports", "POST", {});
  const edit = (id: string, name: string) => request(`/guardrails/${id}`, "PUT", {
    expectedRevision: originalRevision, requestId: randomUUID(), draft: { ...draft, name },
  });
  const results = await Promise.all([edit("guard-one", "First change"), edit("guard-two", "Independent change"), edit("guard-one", "Conflicting change")]);
  expect([results[0]!.status, results[2]!.status].sort()).toEqual([200, 409]);
  expect(results[1]!.status).toBe(200);
  const rejected = results.find(r => r.status === 409)!;
  expect(await rejected.json()).toMatchObject({ error: { code: "workspace_revision_changed" } });
  const saved = await (await request("/guardrails/guard-one")).json();
  expect(saved.item.name).toBe(results[0]!.ok ? "First change" : "Conflicting change");
});
it("protects an existing record after an older server writes during a rolling upgrade", async () => {
  await request("/guardrails", "POST", { requestId: randomUUID(), draft: { id: "new-control", ...draft } });
  const doc = storage.get(docKey());
  const reviewed = doc.revision;
  doc.state.entities[0].name = "Changed by previous server";
  doc.revision++;
  const edit = await request("/guardrails/guard-one", "PUT", {
    requestId: randomUUID(), expectedRevision: reviewed, draft,
  });
  expect(edit.status).toBe(409);
  expect(storage.get(docKey()).state.entities[0].name).toBe("Changed by previous server");
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
  expect(await (await request("/evaluations?resourceId=guard-one&version=2")).json()).toMatchObject({ items: [], pagination: { total: 0 } });
  expect(await (await request("/evaluations?resourceId=guard-one&version=1")).json()).toMatchObject({ items: [{ id: "run-one" }] });
  expect(await (await request("/evaluations/run-one")).json()).toMatchObject({ item: { resourceId: "guard-one", passed: true } });
  expect(await (await request("/jobs/guard-one")).text()).not.toContain("hidden");
});

it("includes real Profile deployment evaluations in history and detail", async () => {
  storage.get(docKey()).state.entities[2].runs = [{ id: "profile-run", version: 1, base: null, dataset: "Frozen profile", passed: true, start: "2026-11-05T00:00:00Z", end: "2026-11-05T00:01:00Z", cases: 1 }];
  expect(await (await request("/evaluations?resourceId=profile-one")).json()).toMatchObject({ items: [{ id: "profile-run", resourceId: "profile-one" }], pagination: { total: 1 } });
  expect(await (await request("/evaluations/profile-run")).json()).toMatchObject({ item: { id: "profile-run", resourceId: "profile-one" } });
});
