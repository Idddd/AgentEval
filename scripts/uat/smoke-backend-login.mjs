import assert from "node:assert/strict";
const base = process.env.UAT_MARKETPLACE_ORIGIN ?? "http://127.0.0.1:18084";
const get = path => fetch(base + path, { signal: AbortSignal.timeout(30_000) });
let ready = false;
for (let i = 0; i < 20; i++) {
  try { ready = (await get("/api/nmgr/ready")).ok; } catch {}
  if (ready) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.ok(ready, "Marketplace did not become ready");
const response = await get("/api/nmgr/workspace");
assert.equal(response.status, 200, "Direct local workspace access failed");
assert.equal(response.headers.get("set-cookie"), null);
const snapshot = await response.json();
assert.equal(snapshot.accessMode, "local");
assert.ok(snapshot.actor.id);
assert.ok(!JSON.stringify(snapshot).includes("session_token"));
const parallel = await Promise.all(Array.from({ length: 4 }, () => get("/api/nmgr/workspace")));
assert.ok(parallel.every(r => r.status === 200));
const record = snapshot.state.entities.find(e => e.provider !== "F5");
if (record) {
  const status = await get(`/api/nmgr/workspace?resource=${encodeURIComponent(record.id)}`);
  assert.equal(status.status, 200);
  const observation = await status.json();
  assert.equal(observation.id, record.id);
  assert.notEqual(observation.status, "unavailable", "Backend observation could not use the configured session");
  console.log(`NeMo resource query: ${observation.status}`);
}
const noOrigin = await fetch(base + "/api/nmgr/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
assert.equal(noOrigin.status, 403);
assert.equal((await get("/api/nmgr/auth/login")).status, 404);
for (const path of ["/v3/guardrails", "/v2/guardrails", "/v2-mock/guardrails"]) assert.equal((await get(path)).status, 200);
console.log(JSON.stringify({ actor: snapshot.actor.name, role: snapshot.actor.role, records: snapshot.state.entities.length, revision: snapshot.revision, noBrowserCredentials: true, status: "passed" }));
