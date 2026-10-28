import { expect, it } from "vitest";
import { NmgrService, type NmgrDocument, type NmgrActor } from "./nmgr";
import { StoreError } from "./marketplace-db";
const user: NmgrActor = { id: "author", name: "Author", role: "User", unit: "ISS" };
const tech: NmgrActor = { id: "tech", name: "Tech", role: "IT Admin", unit: "ISS" };
const approver: NmgrActor = { id: "approver", name: "Approver", role: "User Admin", unit: "ISS" };
const draft = { id: "sync-control", kind: "Guardrail", name: "Control", description: "Block secrets", location: "ALL", mandatory: false, refs: [] as string[], attributes: { bu: "", agent: "", data: "" }, threshold: 5 };
const config = { scannerType: "keyword", direction: "request", content: "secret", versionName: "v1", versionDescription: "" };
function fixture() {
  let saved: NmgrDocument | undefined;
  const policies = new Map<string, any>(), profiles = new Map<string, any>(), calls: { path: string; method: string; body: any }[] = [];
  let loseWrite = false;
  const db = { exclusive: <T>(fn: () => Promise<T>) => fn(), readDocument: async <T>(_id: string) => structuredClone(saved) as T | undefined, writeDocument: async (_id: string, value: unknown) => { saved = structuredClone(value as NmgrDocument); } };
  const remote = { async request(path: string, method = "GET", body?: any): Promise<any> {
    calls.push({ path, method, body: structuredClone(body) });
    const parts = path.split("/"), id = parts[2]!;
    if (parts[1] === "policies" && parts.length === 4) {
      if (method === "PUT") {
        expect(saved?.jobs[draft.id]?.inflight).toBe(true);
        const old = policies.get(id); if ((old?.revision ?? 0) !== body.expectedRevision || body.create && old) throw new StoreError(409, "revision conflict");
        policies.set(id, { id, definition: body.definition, revision: (old?.revision ?? 0) + 1 });
        if (loseWrite) { loseWrite = false; throw new Error("lost response"); }
      }
      if (!policies.has(id)) throw new StoreError(404, "missing");
      return structuredClone(policies.get(id));
    }
    if (parts[1] === "policies" && path.endsWith("/publish")) return { id, version: "published-1" };
    if (parts[1] === "policies") { const p = policies.get(id); return { id: "run-1", policyId: id, revision: p.revision, status: "passed", results: p.definition.tests.map((c: any) => ({ caseId: c.id, passed: true })) }; }
    if (path === "/guardrails" && method === "POST") { const id = crypto.randomUUID(); profiles.set(id, { id, ...body, draftRevision: 1 }); if (loseWrite) { loseWrite = false; throw new Error("lost response"); } return structuredClone(profiles.get(id)); }
    if (parts[1] === "guardrails" && parts.length === 3) { const p = profiles.get(id); if (!p) throw new StoreError(404, "missing"); if (method === "PATCH") { if (p.draftRevision !== body.expectedDraftRevision) throw new StoreError(409, "revision conflict"); Object.assign(p, body, { draftRevision: p.draftRevision + 1 }); } return structuredClone(p); }
    throw new Error(`Unexpected ${method} ${path}`);
  } };
  const service = new NmgrService(db, "test");
  const command = async (actor: NmgrActor, input: Record<string, unknown>) => service.command(actor, { requestId: crypto.randomUUID(), expectedRevision: (await service.snapshot(actor)).revision, ...input }, remote);
  async function finish(id = draft.id) { for (let i = 0; i < 15; i++) { const s = await service.snapshot(tech); if (s.jobs[id]?.status !== "pending") return s; await command(tech, { type: "advance", id }); } throw new Error("not done"); }
  return { service, db, command, finish, remote, policies, profiles, calls, lose: () => { loseWrite = true; } };
}
it("creates a NeMo unpublished draft after Tech selection and reuses it for evaluation", async () => {
  const f = fixture(); await f.command(user, { type: "create", draft });
  expect(f.policies.size).toBe(0);
  const created = await f.command(tech, { type: "action", id: draft.id, action: "implement", provider: "NeMo", config });
  expect(f.policies.size).toBe(1);
  expect(created.jobs[draft.id]).toMatchObject({ purpose: "draft-sync", status: "done" });
  expect(created.state.entities[0]?.status).toBe("TEST READY");
  const binding = created.bindings[`${draft.id}@1`]!;
  expect(f.policies.get(binding.policyId!).definition.rules).toHaveLength(1);
  expect(f.policies.get(binding.policyId!).definition.metadata.tags).toEqual([{ namespace: "protection", value: "content_filters", label: "Content filters", source: "declared" }]);
  expect(f.policies.get(binding.policyId!).definition.rules).toHaveLength(1);
  await f.command(tech, { type: "evaluate", id: draft.id, dataset: "cases", cases: [{ input: "secret", expected: "block", phase: "input" }] });
  const tested = await f.finish();
  expect(tested.state.entities[0]?.status).toBe("TEST PASSED");
  expect(tested.bindings[`${draft.id}@1`]?.policyId).toBe(binding.policyId);
  expect(f.policies.size).toBe(1);
});
it("journals ambiguous Policy creation and reconciles by stable ID without creating again", async () => {
  const f = fixture(); f.lose();
  await f.command(user, { type: "create", draft });
  const s = await f.command(tech, { type: "action", id: draft.id, action: "implement", provider: "NeMo", config });
  expect(s.jobs[draft.id]?.status).toBe("uncertain");
  await expect(f.command(tech, { type: "action", id: draft.id, action: "implement", provider: "NeMo", config })).rejects.toThrow(/pending|reconcile/);
  await expect(f.command({ ...user, id: "another" }, { type: "reconcile", id: draft.id })).rejects.toThrow();
  await f.command(user, { type: "reconcile", id: draft.id });
  await f.finish();
  expect(f.calls.filter(c => c.method === "PUT")).toHaveLength(1);
  expect((await f.service.snapshot(user)).jobs[draft.id]?.status).toBe("done");
});
it("creates Profile on Save and preserves its ID through approval and release setup", async () => {
  const f = fixture(); await f.command(user, { type: "create", draft });
  await f.command(tech, { type: "action", id: draft.id, action: "implement", provider: "NeMo", config });
  const doc = (await f.db.readDocument<NmgrDocument>("nmgr:test"))!;
  doc.state.entities[0]!.deployed = 1; doc.state.entities[0]!.status = "DEPLOYED";
  Object.assign(doc.bindings[`${draft.id}@1`]!, { released: true, publishedVersion: "published-1", ruleIds: ["control"], rails: ["input"] });
  await f.db.writeDocument("nmgr:test", doc);
  const p = { ...draft, id: "sync-profile", kind: "Profile", refs: [draft.id] };
  const s = await f.command(user, { type: "create", draft: p });
  expect(f.profiles.size).toBe(1); const id = s.bindings["sync-profile@1"]!.guardrailId;
  await f.command(user, { type: "action", id: p.id, action: "request" });
  await f.command(approver, { type: "action", id: p.id, action: "approve" });
  const approved = await f.command(tech, { type: "action", id: p.id, action: "deploy" });
  expect(approved.bindings["sync-profile@1"]!.guardrailId).toBe(id);
  await f.command(tech, { type: "advance", id: p.id });
  expect(f.calls.filter(c => c.path === "/guardrails" && c.method === "POST")).toHaveLength(1);
});
it("does not duplicate an uncertain Profile POST and recovers only an exact matching ID", async () => {
  const f = fixture(); await f.command(user, { type: "create", draft });
  await f.command(tech, { type: "action", id: draft.id, action: "implement", provider: "NeMo", config });
  const doc = (await f.db.readDocument<NmgrDocument>("nmgr:test"))!;
  doc.state.entities[0]!.deployed = 1; doc.state.entities[0]!.status = "DEPLOYED";
  Object.assign(doc.bindings[`${draft.id}@1`]!, { released: true, publishedVersion: "published-1", ruleIds: ["control"], rails: ["input"] });
  await f.db.writeDocument("nmgr:test", doc); f.lose();
  const p = { ...draft, id: "lost-profile", kind: "Profile", refs: [draft.id] };
  const s = await f.command(user, { type: "create", draft: p });
  expect(s.jobs[p.id]?.status).toBe("uncertain");
  await f.command(user, { type: "reconcile", id: p.id });
  expect((await f.service.snapshot(user)).jobs[p.id]?.status).toBe("uncertain");
  await expect(f.command(user, { type: "edit", draft: p })).rejects.toThrow(/pending/);
  const id = [...f.profiles.keys()][0]!;
  const wrongId = crypto.randomUUID(); f.profiles.set(wrongId, { ...f.profiles.get(id), id: wrongId, name: "Unrelated profile" });
  await f.command(user, { type: "reconcile", id: p.id, remoteId: wrongId });
  expect((await f.service.snapshot(user)).bindings[`${p.id}@1`]?.guardrailId).toBeUndefined();
  await f.command(user, { type: "reconcile", id: p.id, remoteId: id });
  await f.finish(p.id);
  expect(f.calls.filter(c => c.path === "/guardrails" && c.method === "POST")).toHaveLength(1);
  expect((await f.service.snapshot(user)).jobs[p.id]?.status).toBe("done");
});
it("updates the same assigned draft on edits and rejects a stale remote revision", async () => {
  const f = fixture(); await f.command(user, { type: "create", draft });
  const first = await f.command(tech, { type: "action", id: draft.id, action: "implement", provider: "NeMo", config });
  const id = first.bindings[`${draft.id}@1`]!.policyId!;
  await f.command(user, { type: "edit", draft: { ...draft, name: "Changed" } });
  expect(f.policies.get(id).definition.metadata.name).toBe("Changed"); expect(f.policies.size).toBe(1);
  f.policies.get(id).revision++;
  const conflict = await f.command(tech, { type: "action", id: draft.id, action: "implement", provider: "NeMo", config });
  expect(conflict.jobs[draft.id]?.status).toBe("failed");
  await expect(f.command(tech, { type: "evaluate", id: draft.id, dataset: "blocked", cases: [] })).rejects.toThrow(/pending/);
  expect(f.policies.get(id).definition.rules).toHaveLength(1);
});
it("replays the same Save without a second remote write", async () => {
  const f = fixture(), input = { type: "create", draft, expectedRevision: 0, requestId: crypto.randomUUID() };
  await f.service.command(user, input, f.remote);
  await f.service.command(user, input, f.remote);
  expect(f.calls.filter(c => c.method === "PUT")).toHaveLength(0);
  await expect(f.service.command(user, { ...input, draft: { ...draft, name: "Different" } }, f.remote)).rejects.toThrow(/Idempotency/);
});
it("creates a separate business revision without changing the published binding", async () => {
  const f = fixture(); await f.command(user, { type: "create", draft });
  await f.command(tech, { type: "action", id: draft.id, action: "implement", provider: "NeMo", config });
  const doc = (await f.db.readDocument<NmgrDocument>("nmgr:test"))!;
  doc.state.entities[0]!.deployed = 1; doc.state.entities[0]!.status = "DEPLOYED";
  Object.assign(doc.bindings[`${draft.id}@1`]!, { released: true, publishedVersion: "published-1", ruleIds: ["control"], rails: ["input"] });
  const published = structuredClone(doc.bindings[`${draft.id}@1`]);
  await f.db.writeDocument("nmgr:test", doc);
  const revised = await f.command(user, { type: "revise", draft: { ...draft, name: "Version two" } });
  expect(revised.bindings[`${draft.id}@1`]).toEqual(published);
  expect(revised.bindings[`${draft.id}@2`]?.policyId).not.toBe(published!.policyId);
  expect(revised.bindings[`${draft.id}@2`]?.released).toBeUndefined();
  expect(f.policies.size).toBe(2);
});
it("does not repeat Profile creation after a successful POST with an incompatible response", async () => {
  const f = fixture(), p = { ...draft, id: "invalid-response", kind: "Profile", refs: [draft.id] };
  await f.command(user, { type: "create", draft });
  await f.command(tech, { type: "action", id: draft.id, action: "implement", provider: "NeMo", config });
  const doc = (await f.db.readDocument<NmgrDocument>("nmgr:test"))!;
  doc.state.entities[0]!.deployed = 1; doc.state.entities[0]!.status = "DEPLOYED";
  Object.assign(doc.bindings[`${draft.id}@1`]!, { released: true, publishedVersion: "published-1", ruleIds: ["control"], rails: ["input"] });
  await f.db.writeDocument("nmgr:test", doc);
  const remote = { request: async (path: string, method?: string, body?: unknown) => { const result = await f.remote.request(path, method, body); return method === "POST" ? { id: result.id } : result; } };
  const saved = await f.service.command(user, { type: "create", draft: p, expectedRevision: doc.revision, requestId: crypto.randomUUID() }, remote);
  expect(saved.jobs[p.id]?.status).toBe("uncertain");
  await f.command(user, { type: "reconcile", id: p.id });
  expect(f.calls.filter(c => c.method === "POST")).toHaveLength(1);
});
it("allows correcting a definitely rejected draft while blocking evaluation", async () => {
  const f = fixture(); await f.command(user, { type: "create", draft });
  const remote = { request: async (path: string, method?: string, body?: unknown) => { if (method === "PUT") throw new StoreError(422, "Invalid detector configuration"); return f.remote.request(path, method, body); } };
  const rejected = await f.service.command(tech, { type: "action", id: draft.id, action: "implement", provider: "NeMo", config, expectedRevision: (await f.service.snapshot(tech)).revision, requestId: crypto.randomUUID() }, remote);
  expect(rejected.jobs[draft.id]).toMatchObject({ status: "failed", canCorrect: true });
  expect(rejected.state.entities[0]?.status).toBe("DRAFT");
  await expect(f.command(tech, { type: "evaluate", id: draft.id, dataset: "blocked", cases: [] })).rejects.toThrow();
  const fixed = await f.command(tech, { type: "action", id: draft.id, action: "implement", provider: "NeMo", config: { ...config, content: "corrected" } });
  expect(fixed.jobs[draft.id]?.status).toBe("done");
  expect(f.policies.size).toBe(1);
});
