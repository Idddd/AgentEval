import { expect, it, vi } from "vitest";
import { NmgrService, type NmgrDocument, type NmgrActor } from "./nmgr";
import { assertOpenApiSchema } from "./test-utils/openapi";
import { DeploymentError } from "./diagnostics";

const actor: NmgrActor = { id: "user", name: "User", role: "User", unit: "ISS" };
const scannerId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const olderId = "33333333-3333-4333-8333-333333333333";
const projectId = "44444444-4444-4444-8444-444444444444";
function fixture() {
  let saved: NmgrDocument | undefined;
  const db = { exclusive: <T>(fn: () => Promise<T>) => fn(), readDocument: async <T>() => structuredClone(saved) as T | undefined, writeDocument: async (_: string, value: unknown) => { saved = structuredClone(value as NmgrDocument); } };
  const responses: Record<string, any> = {
    "/scanners?limit=100": { scanners: [{ id: scannerId }], next: "opaque+/=" },
    "/scanners?limit=100&cursor=opaque%2B%2F%3D": { scanners: [], next: null },
    [`/scanners/${scannerId}`]: { scanner: { id: scannerId, name: "Real Scanner", direction: "request", versionMeta: { id: versionId, name: "v2", published: true } } },
    [`/scanners/${scannerId}/versions`]: { versions: [{ id: versionId, name: "v2", published: true }, { id: olderId, name: "v1", published: true }] },
    "/projects?limit=100": { projects: [{ id: projectId }], next: null },
    [`/projects/${projectId}`]: { project: { id: projectId, name: "Real Project", deploymentStatus: "draft", config: { scanners: [{ id: scannerId, version: olderId, direction: "response", enabled: false, blocking: false, mode: "monitor", force: false }, { id: "unavailable-scanner", version: "latest", direction: "both", enabled: true }], packages: [{ id: "package-a", version: "latest" }], providers: [{ apiKey: "NEVER_PERSIST" }] } } },
  };
  const remote = { sourceId: "source-a", adminIds: [], request: vi.fn(async (path: string) => { if (!responses[path]) throw Error("Unexpected path"); return structuredClone(responses[path]); }) };
  return { db, remote, responses, service: new NmgrService(db, "test", remote) };
}
it("imports every page, exact versions and disabled/unresolved Project bindings without credentials or invented releases", async () => {
  const f = fixture(); const view = await f.service.importF5Resources(actor);
  assertOpenApiSchema("Workspace", view);
  const scanner = view.state.entities.find(e => e.kind === "Guardrail")!;
  const project = view.state.entities.find(e => e.kind === "Profile")!;
  expect(scanner.imported).toMatchObject({ available: true, publishedVersion: versionId, bindable: true, f5: { currentVersionId: versionId, versions: [{ id: versionId }, { id: olderId }] } });
  expect(project.imported?.f5?.scannerBindings).toEqual(f.responses[`/projects/${projectId}`].project.config.scanners);
  expect(project.refs).toEqual([scanner.id]); expect(project.deployed).toBeNull();
  expect(project.imported?.f5?.deploymentStatus).toBe("draft");
  expect(JSON.stringify(await f.db.readDocument())).not.toContain("NEVER_PERSIST");
  expect((await f.service.importF5Resources(actor)).state.entities.map(e => e.id)).toEqual(view.state.entities.map(e => e.id));
  expect(f.remote.request.mock.calls.every(call => call.length === 1)).toBe(true);
  await expect(f.service.command(actor, { type: "action", action: "request", id: project.id, expectedRevision: (await f.service.snapshot(actor)).revision, requestId: crypto.randomUUID() }, { request: vi.fn() })).rejects.toThrow(/managed in F5/);
});
it.each(["shape", "cycle", "duplicate", "identity", "versions"])("retains the entire last snapshot when discovery fails: %s", async reason => {
  const f = fixture(); const first = await f.service.importF5Resources(actor);
  if (reason === "shape") f.responses[`/projects/${projectId}`].project.config.scanners = "private-payload";
  if (reason === "cycle") f.responses["/scanners?limit=100&cursor=opaque%2B%2F%3D"].next = "opaque+/=";
  if (reason === "duplicate") f.responses["/scanners?limit=100&cursor=opaque%2B%2F%3D"].scanners = [{ id: scannerId }];
  if (reason === "identity") f.responses[`/scanners/${scannerId}`].scanner.id = "other";
  if (reason === "versions") f.responses[`/scanners/${scannerId}/versions`].versions = [];
  await expect(f.service.importF5Resources(actor)).rejects.toMatchObject({ component: "f5", code: "f5_catalog_invalid" });
  expect(await f.service.snapshot(actor)).toEqual(first);
});
it("isolates NeMo refresh, source instances and control units; disappearance only marks F5 imports unavailable", async () => {
  const f = fixture(); const first = await f.service.importF5Resources(actor);
  const nemo = { request: async () => ({ items: [] }) };
  const afterNemo = await f.service.importResources(actor, nemo);
  expect(afterNemo.state.entities.every(e => e.imported?.available)).toBe(true);
  const otherSource = new NmgrService(f.db, "test", { ...f.remote, sourceId: "source-b" });
  expect((await otherSource.snapshot(actor)).state.entities).toEqual([]);
  expect((await f.service.snapshot({ ...actor, unit: "RMG" })).state.entities).toEqual([]);
  f.responses["/scanners?limit=100"] = { scanners: [] };
  const gone = await f.service.importF5Resources(actor);
  expect(gone.state.entities.find(e => e.id === first.state.entities[0]!.id)?.imported?.available).toBe(false);
  expect(gone.state.entities.find(e => e.kind === "Profile")?.refs).toEqual([]);
});
it("keeps NeMo operations available during F5 network waits and rejects stale F5 discovery", async () => {
  const f = fixture(); let release!: () => void, started!: () => void;
  const pause = new Promise<void>(resolve => { release = resolve; }); const reached = new Promise<void>(resolve => { started = resolve; });
  const request = f.remote.request.getMockImplementation()!;
  f.remote.request.mockImplementationOnce(async path => { const result = await request(path); started(); await pause; return result; });
  const pending = f.service.importF5Resources(actor); await reached;
  await f.service.importResources(actor, { request: async () => ({ items: [] }) });
  expect((await f.service.snapshot(actor)).revision).toBe(1);
  release(); await pending;
  f.remote.request.mockImplementationOnce(async path => { const result = await request(path); await f.service.importF5Resources(actor); return result; });
  await expect(f.service.importF5Resources(actor)).rejects.toThrow(/changed during import/);
});
it("pins a new managed Profile to an imported published Scanner without inventing scanner content", async () => {
  const f = fixture(); const initial = await f.service.importF5Resources(actor);
  const scanner = initial.state.entities.find(e => e.kind === "Guardrail")!;
  expect(scanner.config).toBeUndefined();
  const nemo = { request: vi.fn() };
  const created = await f.service.command(actor, { type: "create", expectedRevision: initial.revision, requestId: crypto.randomUUID(), draft: { id: "new-profile", kind: "Profile", name: "New Profile", description: "Use an existing Scanner", location: "ALL", mandatory: false, refs: [scanner.id], attributes: { bu: "", agent: "", data: "" }, threshold: 5 } }, nemo);
  const requested = await f.service.command(actor, { type: "action", action: "request", id: "new-profile", expectedRevision: created.revision, requestId: crypto.randomUUID() }, nemo);
  expect(requested.bindings["new-profile@1"]?.publishedRefs?.[scanner.id]?.f5).toMatchObject({ id: scannerId, version: versionId, direction: "request" });
  expect(nemo.request).not.toHaveBeenCalled();
});
it("keeps frozen published versions approvable and deployable after a newer draft appears", async () => {
  const f = fixture(); const first = await f.service.importF5Resources(actor);
  const scanner = first.state.entities.find(e => e.kind === "Guardrail")!;
  const nemo = { request: vi.fn() };
  const created = await f.service.command(actor, { type: "create", requestId: crypto.randomUUID(), expectedRevision: first.revision, draft: { id: "frozen-profile", kind: "Profile", name: "Frozen", description: "Pin exact version", location: "ALL", mandatory: false, refs: [scanner.id], attributes: { bu: "", agent: "", data: "" }, threshold: 5 } }, nemo);
  await f.service.command(actor, { type: "action", action: "request", id: "frozen-profile", requestId: crypto.randomUUID(), expectedRevision: created.revision }, nemo);
  const draftId = "55555555-5555-4555-8555-555555555555";
  f.responses[`/scanners/${scannerId}`].scanner.versionMeta = { id: draftId, name: "next-draft", published: false };
  f.responses[`/scanners/${scannerId}/versions`].versions.push({ id: draftId, name: "next-draft", published: false });
  const refreshed = await f.service.importF5Resources(actor);
  expect(refreshed.state.entities.find(e => e.id === scanner.id)?.deployed).toBeNull();
  const approved = await f.service.command({ ...actor, id: "approver", role: "User Admin" }, { type: "action", action: "approve", id: "frozen-profile", requestId: crypto.randomUUID(), expectedRevision: refreshed.revision }, nemo);
  expect(approved.state.entities.find(e => e.id === scanner.id)?.deployed).toBeNull();
  expect(approved.state.entities.find(e => e.id === "frozen-profile")?.deployed).toBeNull();
  const deployed = await f.service.command({ ...actor, id: "tech", role: "IT Admin" }, { type: "action", action: "deploy", id: "frozen-profile", requestId: crypto.randomUUID(), expectedRevision: approved.revision }, nemo);
  expect(deployed.jobs["frozen-profile"]).toMatchObject({ phase: "f5-project-create", status: "pending" });
  expect(deployed.bindings["frozen-profile@1"]?.publishedRefs?.[scanner.id]?.f5?.version).toBe(versionId);
  const doc = (await f.db.readDocument<NmgrDocument>())!;
  delete doc.jobs["frozen-profile"]; await f.db.writeDocument("", doc);
  f.responses[`/scanners/${scannerId}/versions`].versions.find((v: any) => v.id === versionId).published = false;
  const unavailable = await f.service.importF5Resources(actor);
  await expect(f.service.command({ ...actor, id: "tech", role: "IT Admin" }, { type: "action", action: "deploy", id: "frozen-profile", requestId: crypto.randomUUID(), expectedRevision: unavailable.revision }, nemo)).rejects.toThrow(/frozen F5 Scanner version/);
  expect(nemo.request).not.toHaveBeenCalled();
});
it("does not replace managed release evidence or expose another unit's managed Scanner", async () => {
  const f = fixture(); await f.service.importF5Resources(actor);
  const doc = (await f.db.readDocument<NmgrDocument>())!;
  const scanner = doc.state.entities.find(e => e.kind === "Guardrail")!;
  delete scanner.imported; scanner.name = "Managed requirement"; scanner.unit = "RMG";
  doc.jobs[scanner.id] = { actor: "tech", phase: "f5-test", status: "done", started: "2026-11-09" };
  await f.db.writeDocument("", doc);
  const result = await f.service.importF5Resources(actor);
  expect(result.state.entities.filter(e => e.kind === "Guardrail")).toEqual([]);
  expect(result.state.entities.find(e => e.kind === "Profile")?.refs).toEqual([]);
  const saved = (await f.db.readDocument<NmgrDocument>())!;
  expect(saved.state.entities.find(e => e.id === scanner.id)).toEqual(scanner);
  expect(saved.jobs).toEqual(doc.jobs); expect(saved.bindings[`${scanner.id}@1`]).toEqual(doc.bindings[`${scanner.id}@1`]);
});
it("keeps actionable HTTP failures and safe validation logs with the last successful data", async () => {
  const f = fixture(); const initial = await f.service.importF5Resources(actor);
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    f.remote.request.mockRejectedValueOnce(new DeploymentError("f5", "f5_http_403", "F5 request failed (403). Check token permissions.", undefined, 403));
    await expect(f.service.importF5Resources(actor)).rejects.toMatchObject({ code: "f5_http_403", message: expect.stringContaining("GET /scanners") });
    expect(await f.service.snapshot(actor)).toEqual(initial);
    f.responses[`/projects/${projectId}`].project.config.scanners = "SECRET_DATA";
    await expect(f.service.importF5Resources(actor)).rejects.toThrow(/project.config.scanners: expected array/);
    const logs = info.mock.calls.map(call => String(call[0])).join("\n");
    expect(logs).toContain("f5_import_failed"); expect(logs).toContain("project.config.scanners"); expect(logs).toContain("errorReference");
    expect(logs).not.toContain("SECRET_DATA"); expect(logs).not.toContain("NEVER_PERSIST");
  } finally { info.mockRestore(); }
});
