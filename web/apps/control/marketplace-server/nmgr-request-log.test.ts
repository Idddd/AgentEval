import { afterEach, expect, it, vi } from "vitest";
import { nmgrRequest } from "./nmgr-connection-api";
import { ConnectionStore } from "./nmgr-connection-store";
afterEach(() => vi.restoreAllMocks());
it.each([["GET", "getConnection"], ["POST", "saveConnection"], ["DELETE", "clearConnection"]])("matches Swagger for %s connection operations", async (method, operation) => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const store = new ConnectionStore("unused-for-this-test");
  vi.spyOn(store, "read").mockRejectedValue(new Error("Storage is unavailable"));
  const response = await nmgrRequest(new Request("https://marketplace.internal/api/nmgr/connection", { method }), {}, fetch, store);
  expect(response.headers.get("X-Operation-ID")).toBe(operation);
  expect(JSON.stringify(info.mock.calls)).toContain(operation);
});
it("correlates connection failures with a safe operation log, without logging tokens, queries or bodies", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const store = new ConnectionStore("unused-for-this-test");
  vi.spyOn(store, "read").mockRejectedValue(new Error("Storage is unavailable"));
  const request = new Request("https://marketplace.internal/api/nmgr/v1/profiles?token=DO_NOT_LOG", { headers: { Authorization: "Bearer SECRET_TOKEN" } });
  const response = await nmgrRequest(request, {}, fetch, store);
  const body = await response.json();
  expect(response.status).toBeGreaterThanOrEqual(500);
  expect(response.headers.get("X-Request-ID")).toBe(body.error.requestId);
  expect(response.headers.get("X-Operation-ID")).toBe("listProfiles");
  const completed = info.mock.calls.map(([line]) => JSON.parse(line)).find(line => line.event === "api_request_completed");
  expect(completed).toMatchObject({ requestId: body.error.requestId, operationId: "listProfiles", route: "/api/nmgr/v1/profiles", status: response.status });
  expect(JSON.stringify(info.mock.calls)).not.toMatch(/DO_NOT_LOG|SECRET_TOKEN/);
});
