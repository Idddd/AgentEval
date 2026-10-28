import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), open: vi.fn(), save: vi.fn() }));
vi.mock("./guard-api", () => ({ guardConfig: () => ({ sourceId: "local" }), guardProxy: mocks.identity }));
vi.mock("./marketplace-store", () => ({ openMarketplaceStore: mocks.open }));
import { marketplaceApi } from "./marketplace-api";
import { blankDraft } from "../src/features/business-demo/model";
beforeEach(() => { vi.clearAllMocks(); mocks.open.mockResolvedValue({ exclusive: (fn: () => unknown) => fn(), save: mocks.save }); mocks.save.mockResolvedValue({ id: "saved" }); });
const request = () => new Request("http://localhost/api/marketplace/policies", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "request-test" }, body: JSON.stringify({ draft: { ...blankDraft, name: "Policy", text: "Rule" } }) });
const env = { MARKETPLACE_DATABASE_URL: "mariadb://localhost/marketplace", MARKETPLACE_CRUD_ONLY: "true" };
it("uses the latest NeMo business role and effective token grant for writes", async () => {
  mocks.identity.mockResolvedValue(Response.json({ userId: "business-user", role: "user", authentication: "access_token", effectivePermissions: { policies: "write" } }));
  expect((await marketplaceApi(request(), env)).status).toBe(201);
  expect(mocks.save).toHaveBeenCalledWith("policies", expect.anything(), "business-user", expect.anything(), undefined, undefined, "request-test");
});
it.each([
  { role: "admin", authentication: "access_token", effectivePermissions: { policies: "read" } },
  { role: "user", authentication: "access_token", effectivePermissions: { policies: "read" } },
  { role: "admin", authentication: "session" },
  { role: "unknown", authentication: "session" },
])("rejects unauthorized writes before accessing storage: %j", async identity => {
  mocks.identity.mockResolvedValue(Response.json({ userId: "account", ...identity }));
  expect((await marketplaceApi(request(), env)).status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
});
