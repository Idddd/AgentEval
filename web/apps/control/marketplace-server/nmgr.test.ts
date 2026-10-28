import { describe, expect, it } from "vitest";
import { NmgrService, type NmgrDocument, type NmgrPersistence, type NmgrActor } from "./nmgr";

const user: NmgrActor = { id: "u", name: "Author", role: "User", unit: "ISS" };
const tech: NmgrActor = { id: "t", name: "Engineer", role: "IT Admin", unit: "ISS" };
const approver: NmgrActor = { id: "a", name: "Approver", role: "User Admin", unit: "ISS" };
const draft = { id: "test-control", kind: "Guardrail", name: "Control", description: "Block secrets", location: "ALL", mandatory: false, refs: [], attributes: { bu: "", agent: "", data: "" }, threshold: 5 };
function fixture() {
  let doc: NmgrDocument | undefined;
  const db: NmgrPersistence = { exclusive: fn => fn(), readDocument: async <T>() => structuredClone(doc) as T | undefined, writeDocument: async (_id, value) => { doc = structuredClone(value as NmgrDocument); } };
  const resources = new Map<string, any>();
  const remote = { request: async (path: string, method = "GET", body?: any): Promise<any> => {
    if (method === "PUT") { const value = { definition: body.definition, revision: body.expectedRevision + 1 }; resources.set(path, value); return structuredClone(value); }
    if (path === "/guardrails" && method === "POST") { const value = { id: crypto.randomUUID(), ...body, draftRevision: 1 }; resources.set(`/guardrails/${value.id}`, value); return structuredClone(value); }
    if (method === "PATCH") { const value = { ...resources.get(path), ...body, draftRevision: body.expectedDraftRevision + 1 }; resources.set(path, value); return structuredClone(value); }
    if (resources.has(path)) return structuredClone(resources.get(path));
    throw new Error("unexpected remote call");
  } };
  return { service: new NmgrService(db, "test"), remote, db };
}
async function command(f: ReturnType<typeof fixture>, actor: NmgrActor, input: Record<string, unknown>) {
  const snapshot = await f.service.snapshot(actor);
  return f.service.command(actor, { requestId: crypto.randomUUID(), expectedRevision: snapshot.revision, ...input }, f.remote);
}
describe("V2 authoritative workflow", () => {
  it("does not require another unit's invisible mandatory Guardrail", async () => {
    const f = fixture(), rmg = { ...user, id: "rmg-author", unit: "RMG" };
    await command(f, user, { type: "create", draft: { ...draft, mandatory: true } });
    await command(f, rmg, { type: "create", draft: { ...draft, id: "rmg-control" } });
    const doc = (await f.db.readDocument<NmgrDocument>("nmgr:test"))!;
    for (const e of doc.state.entities) { e.deployed = 1; e.status = "DEPLOYED"; e.sourcePending = false; doc.bindings[`${e.id}@1`] = { policyId: e.id, publishedVersion: "r1", released: true, ruleIds: ["control"], rails: ["input"] }; }
    await f.db.writeDocument("nmgr:test", doc);
    await command(f, rmg, { type: "create", draft: { ...draft, kind: "Profile", id: "rmg-profile", refs: ["rmg-control"] } });
    await command(f, rmg, { type: "action", id: "rmg-profile", action: "request" });
    expect((await f.service.snapshot(rmg)).state.entities.find(e => e.id === "rmg-profile")?.status).toBe("SIGNOFF REQUESTED");
    expect((await f.service.snapshot(user)).state.entities).toHaveLength(1);
  });
  it("maps benign acceptance inputs to policy scenarios, not required matching rule tests", async () => {
    const f = fixture();
    await command(f, user, { type: "create", draft });
    await command(f, tech, { type: "action", id: draft.id, action: "implement", provider: "NeMo", config: { scannerType: "keyword", direction: "request", content: "secret", versionName: "v1", versionDescription: "" } });
    await command(f, tech, { type: "evaluate", id: draft.id, dataset: "acceptance", cases: [{ input: "secret", expected: "block", phase: "input" }, { input: "hello", expected: "allow", phase: "input" }] });
    let sent: any;
    f.remote.request = async (_path, _method, body) => { sent = body; return { revision: body.expectedRevision + 1, definition: body.definition }; };
    await command(f, tech, { type: "advance", id: draft.id });
    expect(sent.definition.tests[1]).toMatchObject({ expected_decision: "allow", scope: "policy", kind: "scenario", covered_rule_ids: [] });
  });
  it("starts empty and rejects forged state and role escalation", async () => {
    const f = fixture();
    expect((await f.service.snapshot(user)).state.entities).toEqual([]);
    await expect(command(f, tech, { type: "create", draft })).rejects.toThrow(/User/);
    await expect(command(f, user, { type: "create", draft: { ...draft, status: "DEPLOYED" } })).rejects.toThrow();
    await command(f, user, { type: "create", draft });
    await expect(command(f, user, { type: "action", id: draft.id, action: "test-pass" })).rejects.toThrow();
    expect((await f.service.snapshot(user)).state.entities[0]?.status).toBe("DRAFT");
  });
  it("checks optimistic revisions, replay fingerprints and unit scope", async () => {
    const f = fixture(), input = { requestId: crypto.randomUUID(), expectedRevision: 0, type: "create", draft };
    await f.service.command(user, input, f.remote);
    await f.service.command(user, input, f.remote);
    expect((await f.service.snapshot(user)).state.entities).toHaveLength(1);
    await expect(f.service.command(user, { ...input, draft: { ...draft, name: "different" } }, f.remote)).rejects.toThrow(/key/);
    await expect(f.service.command(user, { ...input, requestId: crypto.randomUUID() }, f.remote)).rejects.toThrow(/changed/);
    const other = { ...user, id: "other", unit: "RMG" };
    expect((await f.service.snapshot(other)).state.entities).toHaveLength(0);
    await expect(command(f, other, { type: "action", id: draft.id, action: "withdraw" })).rejects.toThrow(/found/);
  });
  it("requires actual matching NeMo evidence before signoff and release", async () => {
    const f = fixture();
    await command(f, user, { type: "create", draft });
    await command(f, tech, { type: "action", id: draft.id, action: "implement", provider: "NeMo", config: { scannerType: "keyword", direction: "request", content: "secret", versionName: "v1", versionDescription: "" } });
    await expect(command(f, user, { type: "action", id: draft.id, action: "request" })).rejects.toThrow();
    await command(f, tech, { type: "evaluate", id: draft.id, dataset: "acceptance", cases: [{ input: "secret", expected: "block", phase: "input" }, { input: "hello", expected: "allow", phase: "input" }] });
    const original = f.remote.request;
    f.remote.request = async (path, method, body) => path.endsWith("/definition") ? original(path, method, body) : { id: "real-run", policyId: "wrong-policy", revision: 1, status: "passed", results: [] };
    await command(f, tech, { type: "advance", id: draft.id });
    await command(f, tech, { type: "advance", id: draft.id });
    await command(f, tech, { type: "advance", id: draft.id });
    await expect(command(f, tech, { type: "advance", id: draft.id })).rejects.toThrow(/reconcile/);
    expect((await f.service.snapshot(user)).state.entities[0]?.status).not.toBe("TEST PASSED");
    await expect(command(f, approver, { type: "action", id: draft.id, action: "approve" })).rejects.toThrow();
  });
  it("does not automatically replay an uncertain remote write", async () => {
    const f = fixture(); let writes = 0;
    await command(f, user, { type: "create", draft });
    await command(f, tech, { type: "action", id: draft.id, action: "implement", provider: "NeMo", config: { scannerType: "keyword", direction: "request", content: "secret", versionName: "v1", versionDescription: "" } });
    await command(f, tech, { type: "evaluate", id: draft.id, dataset: "acceptance", cases: [{ input: "secret", expected: "block", phase: "input" }] });
    f.remote.request = async () => { writes++; throw new Error("connection lost"); };
    await command(f, tech, { type: "advance", id: draft.id });
    await expect(command(f, tech, { type: "advance", id: draft.id })).rejects.toThrow(/uncertain/);
    expect(writes).toBe(1);
  });
});
