import { expect, it } from "vitest";
import { openDatabase } from "./storage/database";
import { NmgrService, type NmgrDocument } from "./nmgr";
const url = process.env.MARKETPLACE_TEST_DATABASE_URL;
it.skipIf(!url)("persists V2 state and prevents two connections from overwriting a revision", async () => {
  if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Use an isolated test database");
  const env = { MARKETPLACE_DATABASE_URL: url, MARKETPLACE_DATABASE_PASSWORD: process.env.MARKETPLACE_TEST_DATABASE_PASSWORD }, first = await openDatabase(env), second = await openDatabase(env);
  const workspace = crypto.randomUUID(), actor = { id: "author", name: "Author", role: "User" as const, unit: "ISS" }, remote = { request: async () => { throw new Error("not expected"); } };
  try {
    const service = new NmgrService(first, workspace), other = new NmgrService(second, workspace);
    const input = { type: "create", requestId: crypto.randomUUID(), expectedRevision: 0, draft: { id: "db-control", kind: "Guardrail", name: "Database control", description: "Persistent intent", location: "ALL", mandatory: false, refs: [], attributes: { bu: "", agent: "", data: "" }, threshold: 5 } };
    const attempts = await Promise.allSettled([service.command(actor, input, remote), other.command(actor, { ...input, requestId: crypto.randomUUID(), draft: { ...input.draft, id: "second-control" } }, remote)]);
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await other.snapshot(actor)).state.entities).toHaveLength(1);
    const doc = (await second.readDocument<NmgrDocument>(`nmgr:${workspace}`))!;
    doc.jobs[doc.state.entities[0]!.id] = { actor: "tech", phase: "profile-create", status: "pending", inflight: true, started: new Date().toISOString() };
    await second.writeDocument(`nmgr:${workspace}`, doc);
    const recovered = new NmgrService(first, workspace);
    await expect(recovered.command({ ...actor, id: "tech", role: "IT Admin" }, { type: "advance", id: doc.state.entities[0]!.id, requestId: crypto.randomUUID(), expectedRevision: doc.revision }, remote)).rejects.toThrow(/uncertain/);
  } finally { await first.close(); await second.close(); }
});
