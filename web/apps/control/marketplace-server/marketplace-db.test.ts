import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MarketplaceStore, StoreError, type ProviderBridge } from "./marketplace-db";
import { blankDraft, type Entity } from "../src/features/business-demo/model";
const files: string[] = [], stores: MarketplaceStore[] = [];
afterEach(() => { stores.splice(0).forEach((s) => s.close()); files.splice(0).forEach((f) => rmSync(f, { recursive: true, force: true })); });
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "marketplace-db-")); files.push(dir);
  const file = join(dir, "db.sqlite"), store = new MarketplaceStore(file); stores.push(store);
  const remote: Entity[] = [];
  const bridge: ProviderBridge = {
    list: vi.fn(async (source) => remote.filter((r) => r.source === source)),
    save: vi.fn(async (source, kind, draft, old) => {
      const entity: Entity = { ...draft, kind, source, id: old?.id ?? `remote-${remote.length}`, status: "Ready", owner: "System", createdAt: 1, updatedAt: 1, version: old ? Number(old.version) + 1 : 1, revisions: [] };
      const index = remote.findIndex((r) => r.id === entity.id); if (index < 0) remote.push(entity); else remote[index] = entity;
      return entity;
    }),
    remove: vi.fn(async (_source, item) => { const i = remote.findIndex((r) => r.id === item.id); if (i >= 0) remote.splice(i, 1); }),
  };
  return { store, file, bridge, remote };
}
const policy = { ...blankDraft, name: "Policy", text: "Rule" };
it("stores independent records, persists metadata, translates bindings, and rejects conflicts", async () => {
  const { store, file, bridge } = setup();
  const p = await store.save("policies", policy, "Owner", bridge, undefined, undefined, "request-policy");
  expect((await store.save("policies", policy, "Owner", bridge, undefined, undefined, "request-policy")).id).toBe(p.id);
  expect(bridge.save).toHaveBeenCalledTimes(1);
  const draft = { ...blankDraft, name: "Profile", busu: "ISS", location: "SG", useCase: "Local use", agentType: "Customer", dataType: "Personal data", policies: [{ policyId: p.id, name: p.name, text: p.text, version: p.version }] };
  const g = await store.save("guardrails", draft, "Owner", bridge, undefined, undefined, "request-profile");
  expect(g.busu).toBe("ISS"); expect(g.sync?.state).toBe("synced");
  expect(bridge.save).toHaveBeenLastCalledWith("Guard", "guardrails", expect.objectContaining({ busu: "", policies: [expect.objectContaining({ policyId: "remote-0" })] }), undefined);
  await store.save("guardrails", { ...draft, busu: "CBG" }, "Owner", bridge, g.id, g.sync!.revision);
  expect(bridge.save).toHaveBeenCalledTimes(2);
  await expect(store.save("guardrails", draft, "Owner", bridge, g.id, g.sync!.revision)).rejects.toMatchObject({ status: 409 });
  await expect(store.remove(p.id, p.sync!.revision, bridge)).rejects.toMatchObject({ status: 409 });
  const reopened = new MarketplaceStore(file); stores.push(reopened);
  expect(reopened.list().find((r) => r.id === g.id)?.busu).toBe("CBG");
  expect(reopened.list().find((r) => r.id === g.id)?.policies[0]?.policyId).toBe(p.id);
});
it("keeps failed records and retries without losing local fields", async () => {
  const { store, bridge } = setup();
  vi.mocked(bridge.save).mockRejectedValueOnce(new StoreError(422, "Provider rejected configuration"));
  const p = await store.save("policies", policy, "Owner", bridge, undefined, undefined, "failed-request");
  expect(p.sync?.state).toBe("failed"); expect(store.list()).toHaveLength(1);
  const synced = await store.retry(p.id, bridge);
  expect(synced.sync?.state).toBe("synced");
  vi.mocked(bridge.remove).mockRejectedValueOnce(new Error("Offline"));
  const deletion = await store.remove(p.id, synced.sync!.revision, bridge);
  expect(deletion.deleted).toBe(false); expect(store.list()[0]?.sync?.deleting).toBe(true);
  await store.retry(p.id, bridge); expect(store.list()).toHaveLength(0);
});
it("does not repeat an ambiguous create and reconciles the observed new remote record", async () => {
  const { store, bridge, remote } = setup();
  vi.mocked(bridge.save).mockImplementationOnce(async (source, kind, draft) => {
    remote.push({ ...draft, source, kind, id: "created-but-response-lost", status: "Ready", version: 1, revisions: [], owner: "Owner", createdAt: 1, updatedAt: 1 });
    throw new Error("Connection lost");
  });
  const p = await store.save("policies", policy, "Owner", bridge, undefined, undefined, "uncertain-request");
  expect(p.sync?.state).toBe("uncertain");
  await store.retry(p.id, bridge);
  expect(bridge.save).toHaveBeenLastCalledWith("Guard", "policies", expect.anything(), expect.objectContaining({ id: "created-but-response-lost" }));
  expect(remote).toHaveLength(1);
});
it("rejects cross-source bindings and imports provider records only once", async () => {
  const { store, bridge, remote } = setup();
  const p = await store.save("policies", policy, "Owner", bridge, undefined, undefined, "nemo-policy");
  await expect(store.save("guardrails", { ...blankDraft, source: "F5", name: "Wrong", policies: [{ policyId: p.id, version: p.version, name: p.name, text: p.text }] }, "Owner", bridge, undefined, undefined, "bad-profile")).rejects.toMatchObject({ status: 422 });
  await store.importSource("Guard", bridge); await store.importSource("Guard", bridge);
  expect(store.list()).toHaveLength(remote.length);
});
it("does not resend a create when reconciliation cannot confirm its result", async () => {
  const { store, bridge } = setup();
  vi.mocked(bridge.save).mockRejectedValueOnce(new Error("Timeout"));
  const p = await store.save("policies", policy, "Owner", bridge, undefined, undefined, "timeout-request");
  await expect(store.retry(p.id, bridge)).rejects.toMatchObject({ status: 409 });
  expect(bridge.save).toHaveBeenCalledTimes(1);
  await expect(store.save("policies", { ...policy, name: "Different" }, "Owner", bridge, undefined, undefined, "timeout-request")).rejects.toMatchObject({ status: 409 });
});
