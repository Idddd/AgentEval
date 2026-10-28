import { describe, expect, it } from "vitest";
import { NmgrService, type NmgrDocument, type NmgrPersistence, type NmgrActor } from "./nmgr";
import type { F5Remote } from "./f5-client";
const user: NmgrActor = { id: "user", name: "Author", role: "User", unit: "ISS" };
const tech: NmgrActor = { id: "tech", name: "Engineer", role: "IT Admin", unit: "ISS" };
const approver: NmgrActor = { id: "approver", name: "Reviewer", role: "User Admin", unit: "ISS" };
const draft = { id: "f5-control", kind: "Guardrail", name: "F5 Control", description: "Block secrets", location: "ALL", mandatory: false, refs: [], attributes: { bu: "", agent: "", data: "" }, threshold: 5 };
const config = { scannerType: "keyword", direction: "request", content: "secret", versionName: "v1", versionDescription: "review" };
function fixture() {
  let saved: NmgrDocument | undefined;
  const db: NmgrPersistence = { exclusive: fn => fn(), readDocument: async <T>() => structuredClone(saved) as T | undefined, writeDocument: async (_, value) => { saved = structuredClone(value as NmgrDocument); } };
  const calls: { path: string; method: string; body: any }[] = [];
  const scanners = new Map<string, any>(), projects = new Map<string, any>();
  let lostCreate = false, wrongVersion = false;
  const f5: F5Remote = { sourceId: "f5-instance", adminIds: [], async request(path, method = "GET", body: any) {
    calls.push({ path, method, body: structuredClone(body) });
    const [_, resource, id, action] = path.split("?")[0]!.split("/");
    if (resource === "scanners") {
      if (method === "POST") { const id = crypto.randomUUID(); scanners.set(id, { id, name: body.name, config: body.config, direction: body.direction, availability: { global: false, projectIds: [] }, versionMeta: { id: crypto.randomUUID(), name: body.version.name, published: false } }); if (lostCreate) { lostCreate = false; throw new Error("timeout"); } return { id }; }
      const s = scanners.get(id!); if (!s) throw new Error("missing scanner");
      if (method === "PATCH" && action === "versions") s.versionMeta.published = body.published;
      if (method === "PATCH" && action === "access") s.availability = body;
      return { scanner: structuredClone(s) };
    }
    if (resource === "projects") {
      if (method === "POST") { const id = crypto.randomUUID(); projects.set(id, { id, ...body }); return { id }; }
      const p = projects.get(id!); if (!p) throw new Error("missing project");
      if (method === "PATCH") Object.assign(p, body);
      return { project: structuredClone(p) };
    }
    if (resource === "scans") {
      const p = projects.get(body.project), ref = p.config.scanners[0];
      return { id: crypto.randomUUID(), redactedInput: body.input, result: { outcome: body.input.includes("secret") ? "flagged" : "cleared", scannerResults: [{ scannerId: ref.id, scannerVersionMeta: { id: wrongVersion ? "wrong" : ref.version }, scanDirection: body.scanDirection, outcome: body.input.includes("secret") ? "failed" : "passed" }] } };
    }
    throw new Error("undocumented path");
  } };
  const nemo = { request: async (): Promise<any> => { throw new Error("F5 must not call NeMo resources"); } };
  const service = new NmgrService(db, "test", f5);
  const cmd = async (actor: NmgrActor, input: Record<string, unknown>) => service.command(actor, { requestId: crypto.randomUUID(), expectedRevision: (await service.snapshot(actor)).revision, ...input }, nemo);
  const advance = async (id = draft.id) => {
    for (let i = 0; i < 30; i++) { const s = await service.snapshot(tech); if (s.jobs[id]?.status !== "pending") return s; await cmd(tech, { type: "advance", id }); }
    throw new Error("workflow did not terminate");
  };
  return { db, service, cmd, advance, f5, calls, scanners, projects, loseCreate: () => { lostCreate = true; }, corruptVersion: () => { wrongVersion = true; } };
}
async function evaluate(f: ReturnType<typeof fixture>) {
  await f.cmd(user, { type: "create", draft });
  await f.cmd(tech, { type: "action", id: draft.id, action: "implement", provider: "F5", config });
  await f.cmd(tech, { type: "evaluate", id: draft.id, dataset: "acceptance", cases: [{ input: "secret", expected: "block", phase: "input" }, { input: "hello", expected: "allow", phase: "input" }] });
  return f.advance();
}
describe("V2 F5 lifecycle", () => {
  it("evaluates, approves and publishes an exact Scanner then pins it in a Project", async () => {
    const f = fixture();
    const tested = await evaluate(f);
    expect(tested.state.entities[0]).toMatchObject({ provider: "F5", status: "TEST PASSED", runs: [{ evidence: { source: "F5" }, cases: 2, passed: true }] });
    await f.cmd(user, { type: "action", id: draft.id, action: "request" });
    await f.cmd(approver, { type: "action", id: draft.id, action: "approve" });
    await f.cmd(tech, { type: "action", id: draft.id, action: "deploy" });
    const released = await f.advance();
    expect(released.state.entities[0]?.status).toBe("DEPLOYED");
    const publish = f.calls.find(c => c.method === "PATCH" && c.path.includes("/versions/"));
    expect(publish?.body).toEqual({ published: true, push: false });
    await f.cmd(user, { type: "create", draft: { ...draft, id: "f5-profile", kind: "Profile", refs: [draft.id] } });
    await f.cmd(user, { type: "action", id: "f5-profile", action: "request" });
    await f.cmd(approver, { type: "action", id: "f5-profile", action: "approve" });
    expect((await f.service.snapshot(user)).state.entities.find(e => e.id === "f5-profile")?.deployed).toBeNull();
    await f.cmd(tech, { type: "action", id: "f5-profile", action: "deploy" });
    const complete = await f.advance("f5-profile");
    expect(complete.state.entities.find(e => e.id === "f5-profile")?.status).toBe("DEPLOYED");
    const b = complete.bindings["f5-profile@1"]!;
    const project = f.projects.get(b.f5!.projectId!);
    const scanner = [...f.scanners.values()][0];
    expect(project.config.scanners).toEqual([{ id: scanner.id, version: scanner.versionMeta.id, direction: "request", enabled: true, blocking: true, mode: "block" }]);
    expect(scanner.availability.global).toBe(false);
    expect(scanner.availability.projectIds).toContain(project.id);
    expect(f.calls.some(c => c.method === "DELETE")).toBe(false);
  });
  it("rejects mixed providers, source changes and F5 when disabled", async () => {
    const f = fixture(); await f.cmd(user, { type: "create", draft });
    await f.cmd(tech, { type: "action", id: draft.id, action: "implement", provider: "F5", config });
    await expect(f.cmd(user, { type: "edit", draft: { ...draft, provider: "NeMo" } })).rejects.toThrow(/source|provider/i);
    const doc = (await f.db.readDocument<NmgrDocument>("nmgr:test"))!;
    doc.state.entities[0]!.deployed = 1; doc.state.entities[0]!.status = "DEPLOYED";
    await f.db.writeDocument("nmgr:test", doc);
    await expect(f.cmd(user, { type: "create", draft: { ...draft, provider: "NeMo", id: "nemo-profile", kind: "Profile", refs: [draft.id] } })).rejects.toThrow(/source|provider/i);
    const disabled = new NmgrService(fixture().db, "disabled");
    await disabled.command(user, { requestId: crypto.randomUUID(), expectedRevision: 0, type: "create", draft }, { request: async () => ({}) });
    await expect(disabled.command(tech, { requestId: crypto.randomUUID(), expectedRevision: 1, type: "action", id: draft.id, action: "implement", provider: "F5", config }, { request: async () => ({}) })).rejects.toThrow(/configured|enabled/i);
  });
  it("does not repeat uncertain creation; explicit ID recovery verifies remote content", async () => {
    const f = fixture(); f.loseCreate(); const state = await evaluate(f);
    expect(state.jobs[draft.id]?.status).toBe("uncertain");
    await expect(f.cmd(tech, { type: "advance", id: draft.id })).rejects.toThrow(/uncertain/);
    await f.cmd(tech, { type: "reconcile", id: draft.id });
    expect((await f.service.snapshot(tech)).jobs[draft.id]?.status).toBe("uncertain");
    await expect(f.cmd(tech, { type: "evaluate", id: draft.id, dataset: "retry", cases: [{ input: "secret", expected: "block", phase: "input" }] })).rejects.toThrow(/pending/);
    await expect(f.cmd(user, { type: "edit", draft })).rejects.toThrow(/pending/);
    await f.cmd(tech, { type: "reconcile", id: draft.id, remoteId: crypto.randomUUID() });
    expect((await f.service.snapshot(tech)).jobs[draft.id]?.status).toBe("uncertain");
    expect(f.calls.filter(c => c.path === "/scanners" && c.method === "POST")).toHaveLength(1);
    const id = [...f.scanners.keys()][0]!;
    await f.cmd(tech, { type: "reconcile", id: draft.id, remoteId: id });
    const recovered = await f.advance();
    expect(recovered.state.entities[0]?.status).toBe("TEST PASSED");
    expect(f.scanners.size).toBe(1);
  });
  it("never approves missing/wrong-version evidence or switches an in-flight backend", async () => {
    const f = fixture(); f.corruptVersion(); const s = await evaluate(f);
    expect(s.state.entities[0]?.status).not.toBe("TEST PASSED");
    await expect(f.cmd(user, { type: "action", id: draft.id, action: "request" })).rejects.toThrow();
    f.f5.sourceId = "another-instance";
    await f.cmd(tech, { type: "reconcile", id: draft.id });
    expect((await f.service.snapshot(tech)).jobs[draft.id]?.message).toMatch(/source|instance/i);
  });
  it("does not let a fresh evaluation silently migrate a record to another F5 instance", async () => {
    const f = fixture(); await evaluate(f);
    f.f5.sourceId = "another-instance";
    await expect(f.cmd(tech, { type: "evaluate", id: draft.id, dataset: "again", cases: [{ input: "secret", expected: "block", phase: "input" }] })).rejects.toThrow(/source|instance/i);
  });
  it.each(["(?i)secret", "(?P<account>secret)"])("accepts F5 Python regex %s for vendor validation", async content => {
    const f = fixture();
    await f.cmd(user, { type: "create", draft });
    await f.cmd(tech, { type: "action", id: draft.id, action: "implement", provider: "F5", config: { ...config, scannerType: "regex", content } });
    expect((await f.service.snapshot(tech)).state.entities[0]?.config?.content).toBe(content);
  });
});
