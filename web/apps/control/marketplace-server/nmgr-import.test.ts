import { expect, it } from "vitest";
import { NmgrService, type NmgrDocument, type NmgrActor } from "./nmgr";
const actor: NmgrActor = { id: "user", name: "User", role: "User", unit: "ISS" };
function fixture() {
  let saved: NmgrDocument | undefined;
  const db = { exclusive: <T>(fn: () => Promise<T>) => fn(), readDocument: async <T>() => structuredClone(saved) as T | undefined, writeDocument: async (_: string, value: unknown) => { saved = structuredClone(value as NmgrDocument); } };
  const responses: Record<string, any> = {
    "/policies": { items: [{ id: "policy-a", name: "Existing", version: "1.0", rules: [{ id: "published-rule", rails: ["input"] }] }], count: 1 },
    "/policies/policy-a/definition": { id: "policy-a", revision: 0, published_version: "1.0", definition: { metadata: { id: "policy-a", name: "Existing" }, rules: [{ id: "draft-rule", stages: ["output"] }] } },
    "/guardrails": { items: [{ id: "profile-a" }] },
    "/guardrails/profile-a": { id: "profile-a", name: "Existing profile", draftRevision: 1, draftConfig: { policyBindings: [{ policyId: "policy-a", policyVersion: "1.0", enabledRuleIds: ["published-rule"], enabledRails: ["input"] }] }, versions: [{ version: "release-1", status: "ready" }] },
  };
  const remote = { request: async (path: string) => { if (!responses[path]) throw Error("unavailable"); return structuredClone(responses[path]); } };
  return { service: new NmgrService(db, "import-test"), db, remote, responses };
}
it("imports actual IDs and published rules, links Profiles, and is idempotent", async () => {
  const f = fixture();
  const first = await f.service.importResources(actor, f.remote);
  const policy = first.state.entities.find(e => e.kind === "Guardrail")!;
  const profile = first.state.entities.find(e => e.kind === "Profile")!;
  expect(first.bindings[`${policy.id}@1`]).toMatchObject({ policyId: "policy-a", revision: 0, publishedVersion: "1.0", ruleIds: ["published-rule"], rails: ["input"], released: true });
  expect(profile.refs).toEqual([policy.id]);
  expect(profile.imported?.policyBindings[0]).toMatchObject({ policyId: "policy-a", policyVersion: "1.0" });
  expect(policy.runs).toEqual([]);
  expect((await f.service.importResources(actor, f.remote)).state.entities.map(e => e.id)).toEqual(first.state.entities.map(e => e.id));
  await expect(f.service.command(actor, { type: "action", action: "request", id: profile.id, expectedRevision: (await f.service.snapshot(actor)).revision, requestId: crypto.randomUUID() }, f.remote)).rejects.toThrow(/managed in NeMo/);
});
it("does not commit incomplete discovery or replace managed records", async () => {
  const f = fixture(); const first = await f.service.importResources(actor, f.remote);
  const doc = (await f.db.readDocument<NmgrDocument>())!;
  const policy = doc.state.entities.find(e => e.kind === "Guardrail")!; delete policy.imported; policy.name = "Local requirement";
  await f.db.writeDocument("", doc);
  const next = await f.service.importResources(actor, f.remote);
  expect(next.state.entities.find(e => e.id === policy.id)?.name).toBe("Local requirement");
  delete f.responses["/guardrails/profile-a"];
  await expect(f.service.importResources(actor, f.remote)).rejects.toThrow();
  expect((await f.service.snapshot(actor)).revision).toBe(next.revision);
  expect(first.state.entities).toHaveLength(2);
});
it("marks missing imports unavailable and retains unresolved remote references", async () => {
  const f = fixture(); await f.service.importResources(actor, f.remote);
  f.responses["/policies"] = { items: [], count: 0 };
  const next = await f.service.importResources(actor, f.remote);
  const policy = next.state.entities.find(e => e.kind === "Guardrail")!;
  expect(policy.imported?.available).toBe(false); expect(policy.deployed).toBe(null);
  expect(next.state.entities.find(e => e.kind === "Profile")?.imported?.policyBindings[0]?.policyId).toBe("policy-a");
});
it("does not bind mutable draft rules when the catalog version differs from the published version", async () => {
  const f = fixture(); f.responses["/policies"].items[0].version = "2.0-draft";
  const s = await f.service.importResources(actor, f.remote);
  const policy = s.state.entities.find(e => e.kind === "Guardrail")!;
  expect(s.bindings[`${policy.id}@1`]?.ruleIds).toEqual([]);
  await expect(f.service.command(actor, { type: "create", requestId: crypto.randomUUID(), expectedRevision: s.revision, draft: { id: "new-profile", kind: "Profile", name: "Profile", description: "Use existing policy", location: "ALL", mandatory: false, refs: [policy.id], attributes: { bu: "", agent: "", data: "" }, threshold: 5 } }, f.remote)).rejects.toThrow(/rules and directions are missing/);
});
it("rejects incomplete catalogs without treating resources as deleted", async () => {
  const f = fixture(); const first = await f.service.importResources(actor, f.remote);
  f.responses["/policies"].count = 10;
  await expect(f.service.importResources(actor, f.remote)).rejects.toThrow(/incomplete/);
  expect((await f.service.snapshot(actor)).revision).toBe(first.revision);
});
it("does not overwrite or expose another control unit's managed resource", async () => {
  const f = fixture(); await f.service.importResources(actor, f.remote);
  const doc = (await f.db.readDocument<NmgrDocument>())!;
  const policy = doc.state.entities.find(e => e.kind === "Guardrail")!; delete policy.imported; policy.unit = "RMG";
  await f.db.writeDocument("", doc);
  const result = await f.service.importResources(actor, f.remote);
  expect(result.state.entities.filter(e => e.kind === "Guardrail")).toHaveLength(0);
  expect(result.state.entities[0]?.refs).toEqual([]);
  expect((await f.db.readDocument<NmgrDocument>())!.state.entities.find(e => e.id === policy.id)?.unit).toBe("RMG");
});
it("rejects stale discovery if a newer import completed while it was reading NeMo", async () => {
  const f = fixture(); let release!: () => void; let started!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => { started = resolve; });
  const oldRemote = { request: async (path: string) => { const value = await f.remote.request(path); if (path === "/policies/policy-a/definition") { started(); await paused; } return value; } };
  const older = f.service.importResources(actor, oldRemote); await reached;
  f.responses["/policies/policy-a/definition"].revision = 2;
  await f.service.importResources(actor, f.remote); release();
  await expect(older).rejects.toThrow(/changed during import/);
  const result = await f.service.snapshot(actor); const policy = result.state.entities.find(e => e.kind === "Guardrail")!;
  expect(result.bindings[`${policy.id}@1`]?.revision).toBe(2);
});
