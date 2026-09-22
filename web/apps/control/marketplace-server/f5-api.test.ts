import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createF5Api, f5Proxy } from "./f5-api";
const dirs: string[] = [];
it("denies F5 writes for read-only identities and reads without module access", async () => {
  const env = { MARKETPLACE_DATA_MODE: "live", GUARD_API_URL: "http://127.0.0.1:18083/api/v1", HOST: "127.0.0.1", MARKETPLACE_PUBLIC_ORIGIN: "http://127.0.0.1:18082", MARKETPLACE_DEMO_TOKEN: "test", MARKETPLACE_F5_MOCK: "true", F5_MOCK_DATA_FILE: "unused.json" };
  const fetcher = vi.spyOn(globalThis, "fetch");
  try {
    for (const identity of [
      { role: "admin", authentication: "access_token", effectivePermissions: { policies: "read" } },
      { role: "user", authentication: "access_token", effectivePermissions: { policies: "write" } },
    ]) {
      fetcher.mockResolvedValueOnce(Response.json(identity));
      expect((await f5Proxy(new Request("http://127.0.0.1:18082/api/f5/policies", { method: "POST" }), env)).status).toBe(403);
    }
    fetcher.mockResolvedValueOnce(Response.json({ role: "admin", authentication: "access_token", effectivePermissions: {} }));
    expect((await f5Proxy(new Request("http://127.0.0.1:18082/api/f5/policies"), env)).status).toBe(403);
  } finally { fetcher.mockRestore(); }
});
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
it("persists F5 CRUD and rejects foreign bindings and referenced deletion", async () => {
  const dir = await mkdtemp(join(tmpdir(), "f5-api-")); dirs.push(dir);
  const file = join(dir, "records.json");
  const call = (api: ReturnType<typeof createF5Api>, path: string, method = "GET", body?: unknown) => api(new Request(`http://localhost/api/f5/${path}`, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) }));
  let api = createF5Api(file);
  const p = await (await call(api, "policies", "POST", { name: "Test", text: "Rule", source: "F5" })).json();
  expect(p.source).toBe("F5"); expect(p.status).toBe("Ready");
  api = createF5Api(file);
  expect((await (await call(api, `policies/${p.id}`)).json()).name).toBe("Test");
  expect((await call(api, "guardrails", "POST", { name: "Bad", policies: [{ policyId: "nemo", version: 1, name: "Wrong", text: "Rule" }] })).status).toBe(422);
  const g = await (await call(api, "guardrails", "POST", { name: "Profile", policies: [{ policyId: p.id, version: p.version, name: p.name, text: p.text }] })).json();
  expect((await call(api, `policies/${p.id}`, "DELETE")).status).toBe(409);
  const updated = await (await call(api, `policies/${p.id}`, "PATCH", { name: "Changed", text: "New rule", expectedVersion: p.version })).json();
  expect(updated.version).not.toBe(p.version);
  expect((await call(api, `policies/${p.id}`, "PATCH", { name: "Stale", expectedVersion: p.version })).status).toBe(409);
  expect((await call(api, `guardrails/${g.id}`, "DELETE")).status).toBe(200);
  expect((await call(api, `policies/${p.id}`, "DELETE")).status).toBe(200);
  expect((await call(api, `policies/${p.id}`)).status).toBe(404);
  expect((await call(api, "policies/x/validation-runs", "POST", {})).status).toBe(404);
});
