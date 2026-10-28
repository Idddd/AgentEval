import { expect, it, vi } from "vitest";
import { NmgrService, type NmgrActor, type NmgrDocument } from "./nmgr";
const user: NmgrActor = { id: "author", name: "Author", role: "User", unit: "ISS" };
const tech: NmgrActor = { id: "tech", name: "Tech", role: "IT Admin", unit: "ISS" };
const draft = { id: "new-control", kind: "Guardrail", name: "Secret filter", description: "Block secrets", location: "ALL", mandatory: false, refs: [], attributes: { bu: "", agent: "", data: "" }, threshold: 5 };
const config = { scannerType: "keyword", direction: "request", content: "secret", versionName: "v1", versionDescription: "" };
function fixture(enabled = true) {
  let saved: NmgrDocument | undefined;
  const db = { exclusive: <T>(fn: () => Promise<T>) => fn(), readDocument: async <T>() => structuredClone(saved) as T | undefined, writeDocument: async (_: string, value: unknown) => { saved = structuredClone(value as NmgrDocument); } };
  let policy: any;
  const nemo = { request: vi.fn(async (_path: string, method?: string, body?: any): Promise<any> => { if (method === "PUT") policy = { definition: body.definition, revision: 1 }; return policy; }) };
  const f5 = { sourceId: "f5-uat", adminIds: [], request: vi.fn(async (): Promise<any> => { throw new Error("unexpected F5 request"); }) };
  const service = new NmgrService(db, "source-test", enabled ? f5 : undefined);
  const command = async (actor: NmgrActor, input: Record<string, unknown>) => service.command(actor, { requestId: crypto.randomUUID(), expectedRevision: (await service.snapshot(actor)).revision, ...input }, nemo);
  return { service, db, command, nemo, f5 };
}
it("saves unassigned requirements without any remote call and keeps edits unassigned", async () => {
  const f = fixture();
  await f.command(user, { type: "create", draft });
  const s = await f.command(user, { type: "edit", draft: { ...draft, name: "Updated intent" } });
  expect(s.state.entities[0]).toMatchObject({ sourcePending: true, status: "DRAFT" });
  expect(s.jobs).toEqual({}); expect(s.bindings).toEqual({});
  expect(f.nemo.request).not.toHaveBeenCalled(); expect(f.f5.request).not.toHaveBeenCalled();
});
it.each(["NeMo", "F5"])("rejects User source selection %s on create and edit", async provider => {
  const f = fixture();
  await expect(f.command(user, { type: "create", draft: { ...draft, provider } })).rejects.toThrow(/Tech/);
  await f.command(user, { type: "create", draft });
  await expect(f.command(user, { type: "edit", draft: { ...draft, provider } })).rejects.toThrow(/Tech/);
});
it.each(["User", "User Admin"] as const)("rejects a forged %s implementation/source command", async role => {
  const f = fixture(); await f.command(user, { type: "create", draft });
  await expect(f.command({ ...user, role }, { type: "action", id: draft.id, action: "implement", provider: "F5", config })).rejects.toThrow(/Tech/);
  expect(f.f5.request).not.toHaveBeenCalled();
});
it.each(["NeMo", "F5"] as const)("lets Tech assign %s during implementation and freezes the assignment", async provider => {
  const f = fixture(); await f.command(user, { type: "create", draft });
  await expect(f.command(tech, { type: "action", id: draft.id, action: "implement", config })).rejects.toThrow(/Select.*source/i);
  const s = await f.command(tech, { type: "action", id: draft.id, action: "implement", provider, config });
  expect(s.state.entities[0]).toMatchObject({ sourcePending: false, provider, status: "TEST READY" });
  if (provider === "NeMo") expect(f.nemo.request).toHaveBeenCalled();
  else { expect(f.nemo.request).not.toHaveBeenCalled(); expect(s.state.entities[0]?.sourceInstanceId).toBe("f5-uat"); }
  await f.command(user, { type: "action", id: draft.id, action: "withdraw" });
  await expect(f.command(tech, { type: "action", id: draft.id, action: "implement", provider: provider === "F5" ? "NeMo" : "F5", config })).rejects.toThrow(/source.*cannot change/i);
});
it("rejects unavailable F5 without silently routing to NeMo", async () => {
  const f = fixture(false); await f.command(user, { type: "create", draft });
  await expect(f.command(tech, { type: "action", id: draft.id, action: "implement", provider: "F5", config })).rejects.toThrow(/configured/);
  expect((await f.service.snapshot(user)).state.entities[0]?.sourcePending).toBe(true);
  expect(f.nemo.request).not.toHaveBeenCalled();
});
it("derives Profile source from Tech-assigned Guardrails", async () => {
  const f = fixture(); await f.command(user, { type: "create", draft });
  await f.command(tech, { type: "action", id: draft.id, action: "implement", provider: "F5", config });
  const doc = (await f.db.readDocument<NmgrDocument>())!;
  Object.assign(doc.state.entities[0]!, { deployed: 1, status: "DEPLOYED" });
  await f.db.writeDocument("nmgr:source-test", doc);
  const s = await f.command(user, { type: "create", draft: { ...draft, id: "new-profile", kind: "Profile", refs: [draft.id] } });
  expect(s.state.entities.find(e => e.id === "new-profile")).toMatchObject({ provider: "F5", sourcePending: false, sourceInstanceId: "f5-uat" });
  expect(f.nemo.request).not.toHaveBeenCalled();
});
it("preserves legacy NeMo bindings and rejects mixed-source Profile references", async () => {
  const f = fixture(); await f.command(user, { type: "create", draft });
  const doc = (await f.db.readDocument<NmgrDocument>())!;
  const legacy = doc.state.entities[0]!;
  delete legacy.sourcePending;
  legacy.status = "DRAFT";
  doc.bindings[`${draft.id}@1`] = { policyId: "existing-policy", revision: 2 };
  await f.db.writeDocument("nmgr:source-test", doc);
  await expect(f.command(tech, { type: "action", id: draft.id, action: "implement", provider: "F5", config })).rejects.toThrow(/cannot change/);
  expect((await f.service.snapshot(user)).bindings[`${draft.id}@1`]?.policyId).toBe("existing-policy");
  Object.assign(legacy, { status: "DEPLOYED", deployed: 1 });
  doc.state.entities.push({ ...legacy, id: "f5-other", provider: "F5", sourceInstanceId: "f5-uat" });
  await f.db.writeDocument("nmgr:source-test", doc);
  await expect(f.command(user, { type: "create", draft: { ...draft, id: "mixed-profile", kind: "Profile", refs: [draft.id, "f5-other"] } })).rejects.toThrow(/same.*source/);
});
it("does not persist a source choice when implementation validation fails", async () => {
  const f = fixture(); await f.command(user, { type: "create", draft });
  await expect(f.command(tech, { type: "action", id: draft.id, action: "implement", provider: "F5", config: { ...config, content: "" } })).rejects.toThrow();
  expect((await f.service.snapshot(user)).state.entities[0]).toMatchObject({ sourcePending: true, status: "DRAFT" });
  expect(f.nemo.request).not.toHaveBeenCalled(); expect(f.f5.request).not.toHaveBeenCalled();
});
