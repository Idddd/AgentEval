import { StoreError } from "./marketplace-db";
import type { Entity } from "../src/features/nmgr/model";
import type { NmgrBinding, NmgrJob, NmgrRemote } from "./nmgr";
function match(expected: any, actual: any): boolean {
  if (expected === null || typeof expected !== "object") return expected === actual;
  if (!actual || typeof actual !== "object" || Array.isArray(expected) && (!Array.isArray(actual) || expected.length !== actual.length)) return false;
  return Object.keys(expected).every(key => match(expected[key], actual[key]));
}
function requireMatch(condition: unknown) { if (!condition) throw new StoreError(409, "NeMo draft differs from this operation. Check the remote ID, content and revision before retrying."); }
export function emptyNemoPolicy(e: Entity, id: string) {
  return { schema_version: 1, kind: "Policy", metadata: { id, name: e.name, description: e.description, version: "0", tags: [{ namespace: "protection", value: "content_filters", label: "Content filters", source: "declared" }], safety_level: "balanced", output_delivery: "full_buffered" }, parameters: [], rules: [], tests: [], execution: { mode: "sequential", input: "previous_output", stop_on: "block" } };
}
export async function nemoDraftStep(e: Entity, b: NmgrBinding, job: NmgrJob, remote: NmgrRemote, recovering: boolean, unresolved: boolean, remoteId?: string) {
  const policy = `/policies/${encodeURIComponent(b.policyId ?? "")}/definition`, expected = job.expectedRevision ?? 0;
  const checkPolicy = (r: any) => { requireMatch(r?.definition?.metadata?.id === b.policyId && Number.isSafeInteger(r.revision) && r.revision > 0 && match(job.definition, r.definition)); return r; };
  const checkProfile = (r: any, id: string) => { requireMatch(r?.id === id && Number.isSafeInteger(r.draftRevision) && r.draftRevision > 0 && match(job.profile, r)); return r; };
  if (["sync-policy-save", "policy-save"].includes(job.phase)) {
    let existing: any;
    if (recovering) {
      try { existing = await remote.request(policy, "GET"); }
      catch (error) { if (!(error instanceof StoreError && error.status === 404 && expected === 0)) throw error; }
      if (existing && match(job.definition, existing.definition) && [expected, expected + 1].includes(existing.revision)) {
        b.revision = checkPolicy(existing).revision; job.phase = job.purpose === "draft-sync" ? "sync-policy-read" : "policy-read"; return;
      }
      requireMatch(!existing && expected === 0 || existing?.revision === expected);
    }
    const saved = checkPolicy(await remote.request(policy, "PUT", { definition: job.definition, maintainer: e.custodian, expectedRevision: expected, ...(expected === 0 ? { create: true } : {}) }));
    requireMatch([expected, expected + 1].includes(saved.revision)); b.revision = saved.revision;
    job.phase = job.purpose === "draft-sync" ? "sync-policy-read" : "policy-read";
  } else if (["sync-policy-read", "policy-read"].includes(job.phase)) {
    const saved = checkPolicy(await remote.request(policy, "GET")); requireMatch(saved.revision === b.revision);
    b.ruleIds = job.definition.rules.map((r: any) => String(r.id)); b.rails = [...new Set<string>(job.definition.rules.flatMap((r: any) => r.stages))]; b.draftSyncedAt = new Date().toISOString();
    if (job.purpose === "draft-sync") job.status = "done"; else job.phase = "policy-start";
  } else if (job.phase === "sync-profile-save") {
    if (!b.guardrailId) {
      if (recovering && remoteId) {
        const found = checkProfile(await remote.request(`/guardrails/${encodeURIComponent(remoteId)}`, "GET"), remoteId);
        b.guardrailId = found.id; b.draftRevision = found.draftRevision;
      } else {
        if (recovering && unresolved) throw new StoreError(409, "NeMo creation outcome is unknown. Supply the exact remote Guardrail ID to reconcile; no create will be repeated.");
        const created = await remote.request("/guardrails", "POST", job.profile);
        // A successful POST may already have committed even if its response is
        // incompatible. Preserve an uncertain outcome so recovery cannot POST again.
        try {
          requireMatch(typeof created?.id === "string" && created.id.length > 0);
          const saved = checkProfile(created, created.id); b.guardrailId = saved.id; b.draftRevision = saved.draftRevision;
        } catch { throw new Error("NeMo create response could not be verified."); }
      }
    } else {
      const path = `/guardrails/${encodeURIComponent(b.guardrailId)}`;
      if (recovering) {
        const current = await remote.request(path, "GET");
        if (match(job.profile, current) && [expected, expected + 1].includes(current.draftRevision)) { b.draftRevision = checkProfile(current, b.guardrailId).draftRevision; job.phase = "sync-profile-read"; return; }
        requireMatch(current?.id === b.guardrailId && current.draftRevision === expected);
      }
      const saved = checkProfile(await remote.request(path, "PATCH", { ...job.profile, expectedDraftRevision: expected }), b.guardrailId);
      requireMatch([expected, expected + 1].includes(saved.draftRevision)); b.draftRevision = saved.draftRevision;
    }
    job.phase = "sync-profile-read";
  } else if (job.phase === "sync-profile-read") {
    const saved = checkProfile(await remote.request(`/guardrails/${encodeURIComponent(b.guardrailId!)}`, "GET"), b.guardrailId!);
    requireMatch(saved.draftRevision === b.draftRevision); b.draftSyncedAt = new Date().toISOString(); job.status = "done";
  } else throw new StoreError(409, "Unknown draft synchronization phase.");
}
