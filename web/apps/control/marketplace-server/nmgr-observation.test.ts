import { expect, it, vi } from "vitest";
import { NmgrService, type NmgrDocument } from "./nmgr";
import { StoreError } from "./marketplace-db";
import type { Entity } from "../src/features/nmgr/model";
const actor = { id: "u", name: "User", role: "User" as const, unit: "ISS" };
function fixture(provider: "NeMo" | "F5" = "NeMo") {
  const entity = { id: "control", kind: "Guardrail", provider, sourceInstanceId: provider === "F5" ? "f5-instance" : undefined, unit: "ISS", version: 1, status: "TEST PASSED" } as Entity;
  const doc: NmgrDocument = { revision: 7, state: { entities: [entity], audit: [] }, bindings: { "control@1": provider === "NeMo" ? { policyId: "remote-policy", revision: 3 } : { f5: { sourceId: "f5-instance", scannerId: "scanner-id", versionId: "v1" } } }, jobs: {}, authors: {}, requestors: {}, requests: {} };
  const write = vi.fn(), remote = { request: vi.fn(async (_path: string, _method?: string): Promise<any> => ({ revision: 3, definition: { metadata: { id: "remote-policy" } } })) };
  const f5 = { sourceId: "f5-instance", adminIds: [], request: vi.fn(async (_path: string, _method?: string): Promise<any> => ({ scanner: { id: "scanner-id", versionMeta: { id: "v1" } } })) };
  const service = new NmgrService({ exclusive: fn => fn(), readDocument: async <T>() => structuredClone(doc) as T, writeDocument: write }, "test", f5);
  return { service, doc, remote, f5, write };
}
it("queries the mapped NeMo resource without changing workflow state", async () => {
  const f = fixture(), before = structuredClone(f.doc);
  expect(await f.service.resourceStatus(actor, "control", f.remote)).toMatchObject({ id: "control", revision: 7, status: "available", remoteVersion: "3" });
  expect(f.remote.request).toHaveBeenCalledWith("/policies/remote-policy/definition", "GET");
  expect(f.write).not.toHaveBeenCalled(); expect(f.doc).toEqual(before);
  f.remote.request.mockResolvedValue({ revision: 4, definition: { metadata: { id: "remote-policy" } } });
  expect(await f.service.resourceStatus(actor, "control", f.remote)).toMatchObject({ status: "changed", remoteVersion: "4" });
});
it("scopes reads and distinguishes local drafts, missing records and permission failures", async () => {
  const f = fixture();
  await expect(f.service.resourceStatus({ ...actor, unit: "RMG" }, "control", f.remote)).rejects.toThrow(/found/);
  expect(f.remote.request).not.toHaveBeenCalled();
  f.remote.request.mockRejectedValue(new StoreError(404, "secret upstream response"));
  expect(await f.service.resourceStatus(actor, "control", f.remote)).toMatchObject({ status: "missing" });
  f.remote.request.mockRejectedValue(new StoreError(403, "secret upstream response"));
  const failure = await f.service.resourceStatus(actor, "control", f.remote);
  expect(failure.status).toBe("unavailable"); expect(JSON.stringify(failure)).not.toContain("secret");
  delete f.doc.bindings["control@1"];
  expect(await f.service.resourceStatus(actor, "control", f.remote)).toMatchObject({ status: "local_only" });
});
it("queries F5 with its own connection and rejects changed source instances", async () => {
  const f = fixture("F5");
  expect(await f.service.resourceStatus(actor, "control", f.remote)).toMatchObject({ status: "available" });
  expect(f.f5.request).toHaveBeenCalledWith("/scanners/scanner-id?version=v1", "GET");
  expect(f.remote.request).not.toHaveBeenCalled();
  f.f5.sourceId = "other"; f.f5.request.mockClear();
  expect(await f.service.resourceStatus(actor, "control", f.remote)).toMatchObject({ status: "source_changed" });
  expect(f.f5.request).not.toHaveBeenCalled();
});
it("checks Profile bindings and NeMo released version without overwriting the approved state", async () => {
  const f = fixture("F5"), entity = f.doc.state.entities[0]!; entity.kind = "Profile";
  const ref = { id: "scanner", version: "v1", enabled: true, blocking: true, direction: "request", mode: "block" } as const;
  f.doc.bindings["control@1"] = { f5: { sourceId: "f5-instance", projectId: "project" }, publishedRefs: { scanner: { policyId: "scanner", policyVersion: "v1", enabledRails: [], enabledRuleIds: [], f5: ref } } };
  f.f5.request.mockResolvedValue({ project: { id: "project", config: { scanners: [ref] } } });
  expect(await f.service.resourceStatus(actor, "control", f.remote)).toMatchObject({ status: "available" });
  f.f5.request.mockResolvedValue({ project: { id: "project", config: { scanners: [{ ...ref, version: "v2" }] } } });
  expect(await f.service.resourceStatus(actor, "control", f.remote)).toMatchObject({ status: "changed" });
  entity.provider = "NeMo";
  f.doc.bindings["control@1"] = { guardrailId: "profile", draftRevision: 1, version: "v1", released: true };
  f.remote.request.mockResolvedValue({ id: "profile", draftRevision: 1, versions: [{ version: "v1", status: "ready" }] });
  expect(await f.service.resourceStatus(actor, "control", f.remote)).toMatchObject({ status: "available" });
  f.remote.request.mockResolvedValue({ id: "profile", draftRevision: 1, versions: [] });
  expect(await f.service.resourceStatus(actor, "control", f.remote)).toMatchObject({ status: "changed" });
  expect(f.write).not.toHaveBeenCalled();
});
it("does not treat malformed responses or unpublished versions as successful publication", async () => {
  const f = fixture("F5"); f.doc.bindings["control@1"]!.released = true;
  expect(await f.service.resourceStatus(actor, "control", f.remote)).toMatchObject({ status: "changed" });
  f.f5.request.mockResolvedValue({ scanner: { id: "another-scanner" } });
  expect(await f.service.resourceStatus(actor, "control", f.remote)).toMatchObject({ status: "unavailable" });
});
