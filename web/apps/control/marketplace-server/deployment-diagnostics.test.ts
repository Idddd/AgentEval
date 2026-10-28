import { afterEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ readDocument: vi.fn(async () => undefined) }));
vi.mock("./storage/database", () => ({ openDatabase: async () => db }));
import { nmgrApi } from "./nmgr-api";
import { runtimeResponse } from "./guard-api";
import { createF5Client, f5Configuration } from "./f5-client";
import { diagnosticResponse } from "./diagnostics";

const env = { MARKETPLACE_DATA_MODE: "live", GUARD_API_URL: "https://nemo.internal/api/v1", MARKETPLACE_PUBLIC_ORIGIN: "https://ui.internal", MARKETPLACE_DATABASE_URL: "postgres://app:secret@db.internal/marketplace", MARKETPLACE_V2_ACCOUNTS_JSON: JSON.stringify({ user: { name: "User", role: "User", unit: "ISS" } }) };
const request = () => new Request("https://ui.internal/api/nmgr/ready");
afterEach(() => { vi.restoreAllMocks(); db.readDocument.mockReset().mockResolvedValue(undefined); });

it.each([
  ["MARKETPLACE_DATA_MODE", "mock", "runtime"],
  ["GUARD_API_URL", "", "nemo"],
  ["MARKETPLACE_PUBLIC_ORIGIN", "", "origin"],
  ["MARKETPLACE_DATABASE_URL", "", "database"],
  ["MARKETPLACE_DATABASE_URL", "postgres://secret@db", "database"],
  ["MARKETPLACE_V2_ACCOUNTS_JSON", "{}", "identity"],
  ["F5_API_URL", "https://f5.internal/backend/v1", "f5"],
])("identifies invalid %s and correlates safe response and log", async (setting, value, component) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await nmgrApi(request(), { ...env, [setting]: value });
  expect(response.status).toBe(503);
  const { error } = await response.json();
  expect(error).toMatchObject({ component, settings: expect.arrayContaining([setting]), code: expect.any(String), requestId: expect.any(String) });
  expect(response.headers.get("x-request-id")).toBe(error.requestId);
  const lines = log.mock.calls.flat().join(" ");
  expect(lines).toContain(error.requestId);
  expect(lines).not.toMatch(/secret|db\.internal|nemo\.internal|ui\.internal/);
});

it("identifies DB connectivity separately and never leaks a driver error", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  db.readDocument.mockRejectedValueOnce(new Error("password secret at db.internal refused"));
  const response = await nmgrApi(request(), env);
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.error).toMatchObject({ component: "database", code: "database_unavailable", settings: expect.arrayContaining(["MARKETPLACE_DATABASE_URL"]) });
  expect(JSON.stringify([body, log.mock.calls])).not.toMatch(/secret|db\.internal/);
});

it("runtime config names a malformed upstream URL without exposing it", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const response = runtimeResponse({ ...env, GUARD_API_URL: "https://user:secret@nemo.internal/api/v1" });
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.error).toMatchObject({ component: "nemo", settings: ["GUARD_API_URL"] });
  expect(JSON.stringify(body)).not.toMatch(/secret|nemo\.internal/);
});

it("requires live mode for explicit V3 runtime requests and returns a correlated diagnostic", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = runtimeResponse({ MARKETPLACE_DATA_MODE: "mock" }, true);
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.error).toMatchObject({ component: "runtime", code: "live_mode_required", settings: ["MARKETPLACE_DATA_MODE"], requestId: expect.any(String) });
  expect(JSON.stringify(log.mock.calls)).toContain(body.error.requestId);
});

it("readiness distinguishes configuration/database checks from upstream reachability", async () => {
  const response = await nmgrApi(request(), env);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ workspace: "v3", checks: { database: "reachable", nemo: "not_probed", f5: "not_configured", identity: "mapping_configured" } });
});

it.each([
  [{ MARKETPLACE_NEMO_AUTH_MODE: "token" }, "nemo", "nemo_token_config_invalid", "GUARD_API_TOKEN"],
  [{ MARKETPLACE_NEMO_AUTH_MODE: "password" }, "nemo", "nemo_credentials_missing", "GUARD_PASSWORD"],
  [{ MARKETPLACE_NEMO_AUTH_MODE: "invalid" }, "nemo", "nemo_auth_mode_invalid", "MARKETPLACE_NEMO_AUTH_MODE"],
  [{ MARKETPLACE_F5_ENABLED: "true" }, "f5", "f5_config_invalid", "F5_API_TOKEN"],
  [{ MARKETPLACE_DATABASE_PASSWORD_REQUIRED: "true" }, "database", "database_config_invalid", "MARKETPLACE_DATABASE_PASSWORD"],
])("reports an absent selected Secret instead of silently choosing another credential source: %j", async (selected, component, code, setting) => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await nmgrApi(request(), { ...env, ...selected });
  expect(response.status).toBe(503);
  expect((await response.json()).error).toMatchObject({ component, code, settings: expect.arrayContaining([setting]) });
});

it.each([
  ["28P01", "database_auth_failed"], ["ER_ACCESS_DENIED_ERROR", "database_auth_failed"],
  ["42501", "database_permission_denied"], ["ECONNREFUSED", "database_unreachable"],
  ["SELF_SIGNED_CERT_IN_CHAIN", "database_tls_failed"], ["3D000", "database_not_found"],
])("classifies safe driver code %s without logging the raw exception", async (code, expected) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  db.readDocument.mockRejectedValueOnce(Object.assign(new Error("secret driver detail"), { code }));
  const response = await nmgrApi(request(), env);
  expect((await response.json()).error.code).toBe(expected);
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret driver detail");
});

it("distinguishes missing browser identity from server NeMo credentials", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await nmgrApi(new Request("https://ui.internal/api/nmgr/workspace"), { ...env, GUARD_API_TOKEN: "private-server-token" });
  expect(response.status).toBe(401);
  expect((await response.json()).error).toMatchObject({ component: "identity", code: "identity_unavailable", message: expect.stringMatching(/authentication\/SSO/) });
});

it("preserves the NeMo dependency when identity verification cannot reach the upstream", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fetcher = vi.fn().mockRejectedValue(new Error("secret network URL"));
  const response = await nmgrApi(new Request("https://ui.internal/api/nmgr/workspace", { headers: { Authorization: "Bearer private-user-token" } }), env, fetcher);
  expect(response.status).toBe(503);
  expect((await response.json()).error).toMatchObject({ component: "nemo", code: "upstream_unavailable" });
});

it.each([
  [async () => Response.json({ secret: "private-body" }, { status: 401 }), "f5_http_401"],
  [async () => new Response("<html>private-body</html>"), "f5_response_invalid"],
  [async () => { throw new Error("private-body"); }, "f5_unreachable"],
])("reports F5 failures without upstream bodies or secrets", async (fetcher, code) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const client = createF5Client(f5Configuration({ F5_API_URL: "https://f5.internal/backend/v1", F5_API_TOKEN: "private-token" })!, fetcher);
  let caught: unknown; try { await client.request("/scanners"); } catch (error) { caught = error; }
  const response = diagnosticResponse(caught, "f5", "job.f5-create", "F5 unavailable");
  const body = await response.json();
  expect(body.error).toMatchObject({ code, component: "f5", requestId: expect.any(String) });
  expect(JSON.stringify([body, log.mock.calls])).not.toMatch(/private-|f5\.internal/);
});
