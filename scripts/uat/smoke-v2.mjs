import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../.."), dir = resolve(root, ".artifacts/uat-nemo");
const accounts = JSON.parse(readFileSync(resolve(dir, "v2-test-accounts.json"), "utf8"));
const base = process.env.V2_SMOKE_URL ?? "http://127.0.0.1:18082";
const suffix = Date.now().toString(36), guardrail = `uat-v2-${suffix}`, profile = `uat-profile-${suffix}`;
async function api(actor, path, body) {
  const response = await fetch(base + "/api/nmgr/" + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${accounts[actor].secret}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(35000) });
  const value = await response.json();
  if (!response.ok) throw new Error(`Marketplace ${response.status}: ${value.error?.message}`);
  return value;
}
async function cmd(actor, body) {
  const snapshot = await api(actor, "workspace");
  return api(actor, "commands", { ...body, expectedRevision: snapshot.revision, requestId: crypto.randomUUID() });
}
async function finish(id) {
  let phase;
  for (let attempt = 0; attempt < 100; attempt++) {
    const snapshot = await api("tech", "workspace"), job = snapshot.jobs[id];
    if (phase !== job.phase) { phase = job.phase; console.log(id + ": " + phase); }
    if (job.status === "done") return snapshot;
    if (job.status !== "pending" || job.inflight) throw new Error(`${id}: ${job.status}: ${job.message ?? "inflight"}`);
    await cmd("tech", { type: "advance", id });
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error("NeMo operation did not finish in time.");
}
const fields = { name: "V2 real acceptance", description: "Block the literal phrase marketplace-secret", location: "ALL", mandatory: false, refs: [], attributes: { bu: "UAT", agent: "test", data: "synthetic" }, threshold: 5 };
const savedGuardrail = await cmd("user", { type: "create", draft: { ...fields, id: guardrail, kind: "Guardrail" } });
if (!savedGuardrail.state.entities.find(e => e.id === guardrail)?.sourcePending || savedGuardrail.jobs[guardrail] || savedGuardrail.bindings[`${guardrail}@1`]) throw new Error("New requirements must wait for Tech source selection.");
const implemented = await cmd("tech", { type: "action", id: guardrail, action: "implement", provider: "NeMo", config: { scannerType: "keyword", direction: "request", content: "marketplace-secret", versionName: "v1", versionDescription: "Local acceptance" } });
if (implemented.jobs[guardrail]?.status !== "done") throw new Error("Implementation did not synchronize the NeMo Policy draft.");
const policyId = implemented.bindings[`${guardrail}@1`]?.policyId;
if (!policyId || implemented.bindings[`${guardrail}@1`]?.released) throw new Error("Tech implementation must create an unpublished Policy.");
await cmd("tech", { type: "evaluate", id: guardrail, dataset: "Real NeMo acceptance", cases: [{ input: "marketplace-secret", expected: "block", phase: "input" }, { input: "hello world", expected: "allow", phase: "input" }] });
let result = await finish(guardrail);
if (result.bindings[`${guardrail}@1`]?.policyId !== policyId) throw new Error("Evaluation did not reuse the saved Policy ID.");
if (result.state.entities.find(e => e.id === guardrail).status !== "TEST PASSED") throw new Error("Real policy evaluation failed: " + JSON.stringify(result.state.entities.find(e => e.id === guardrail).runs[0]?.evidence));
await cmd("user", { type: "action", id: guardrail, action: "request" });
await cmd("approver", { type: "action", id: guardrail, action: "approve" });
await cmd("tech", { type: "action", id: guardrail, action: "deploy" });
await finish(guardrail);
const savedProfile = await cmd("user", { type: "create", draft: { ...fields, name: "V2 real Profile", id: profile, kind: "Profile", refs: [guardrail] } });
if (savedProfile.jobs[profile]?.status !== "done") throw new Error("Save did not confirm the NeMo Profile draft: " + JSON.stringify(savedProfile.jobs[profile]));
const profileId = savedProfile.bindings[`${profile}@1`]?.guardrailId;
if (!profileId || savedProfile.bindings[`${profile}@1`]?.released) throw new Error("Save must create an unpublished Profile.");
await cmd("user", { type: "action", id: profile, action: "request" });
await cmd("approver", { type: "action", id: profile, action: "approve" });
const approved = await api("user", "workspace");
if (approved.state.entities.find(e => e.id === profile).deployed !== null) throw new Error("Approval incorrectly activated the Profile.");
await cmd("tech", { type: "action", id: profile, action: "deploy" });
result = await finish(profile);
if (result.state.entities.find(e => e.id === profile).status !== "DEPLOYED") throw new Error("Profile release not confirmed.");
if (result.bindings[`${profile}@1`]?.guardrailId !== profileId) throw new Error("Release did not reuse the saved Profile ID.");
writeFileSync(resolve(dir, "v2-smoke-result.json"), JSON.stringify({ guardrail, profile, bindings: result.bindings, entities: result.state.entities.filter(e => [guardrail, profile].includes(e.id)), verifiedAt: new Date().toISOString() }, null, 2));
console.log("PASS: Save creates unpublished NeMo drafts; same Policy/Profile IDs reused through three-account evaluation, approval, publish, frozen-version test and release. No endpoint traffic claim.");
