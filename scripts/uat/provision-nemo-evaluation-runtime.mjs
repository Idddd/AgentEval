// Provision a single isolated scan endpoint against the profile created by smoke-v2.mjs.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const directory = resolve(import.meta.dirname, "../../.artifacts/uat-nemo");
const result = JSON.parse(readFileSync(resolve(directory, "v2-smoke-result.json"), "utf8"));
const config = parseEnv(readFileSync(resolve(directory, "marketplace.env"), "utf8"));
const accounts = JSON.parse(readFileSync(resolve(directory, "v2-test-accounts.json"), "utf8"));
const origin = new URL(config.GUARD_API_URL).origin;
if (new URL(origin).hostname !== "127.0.0.1") throw new Error("Local NeMo only.");
const binding = result.bindings[`${result.profile}@1`];
if (!binding?.released || !binding.guardrailId || !binding.version) throw new Error("Run strict Marketplace smoke-v2.mjs before provisioning the endpoint.");
const file = resolve(directory, "nemo-endpoint.json");
const saved = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
if (saved?.ready && saved.guardrail === result.guardrail) {
  console.log(`Ready local NeMo endpoint ${saved.endpointId} for ${result.guardrail}.`);
  process.exit(0);
}

async function call(path, body, cookie) {
  const response = await fetch(origin + path, {
    method: "POST", signal: AbortSignal.timeout(25000),
    headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Local NeMo ${path} returned HTTP ${response.status}${value.error?.code ? " " + value.error.code : ""}`);
  return { value, cookie: response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ") };
}
const { cookie: author } = await call("/api/auth/sign-in/email", { email: accounts.user.email, password: accounts.user.password });
let endpoint = saved?.guardrail === result.guardrail ? saved : null;
const save = () => writeFileSync(file, JSON.stringify(endpoint, null, 2), { mode: 0o600 });
if (!endpoint) {
  const { value } = await call("/api/v1/endpoints", { name: `Marketplace UAT ${result.guardrail}`, adapter: "f5-scan", scanFlagOnlyDefault: false }, author);
  if (!value.id || !value.credential) throw new Error("NeMo did not return an endpoint credential.");
  endpoint = { endpointId: value.id, credential: value.credential, guardrail: result.guardrail };
  save();
}
if (!endpoint.router) {
  const draft = { routes: [{ id: "fallback", name: "Fallback", kind: "fallback", enabled: true,
    selector: { expression: { combinator: "and", conditions: [] } },
    targets: [{ id: "uat", guardrailId: binding.guardrailId, guardrailVersion: binding.version, weightBps: 10000 }],
  }] };
  const { value: router } = await call("/api/v1/routers", { name: `Marketplace UAT ${result.guardrail}`, endpointIds: [endpoint.endpointId], draft }, author);
  endpoint.router = router.id;
  endpoint.draftRevision = router.draftRevision;
  save();
}
if (!endpoint.change) {
  const path = `/api/v1/routers/${endpoint.router}`;
  const { value: review } = await call(path + "/publication-preview", { expectedDraftRevision: endpoint.draftRevision }, author);
  const { value: change } = await call(path + "/change-requests", { expectedDraftRevision: endpoint.draftRevision, reviewedSnapshot: review.snapshot,
    reviewedEndpointIds: review.endpointIds, reason: "Local Marketplace integration check", ticket: "" }, author);
  endpoint.change = change.id;
  save();
}
if (!endpoint.approved) {
  // Business accounts own router changes in this NeMo version; two distinct
  // identities are required by the no-self-approval check.
  await new Promise(resolve => setTimeout(resolve, 11000));
  const { cookie: approver } = await call("/api/auth/sign-in/email", { email: accounts.approver.email, password: accounts.approver.password });
  await call(`/api/v1/routers/${endpoint.router}/change-requests/${endpoint.change}/approve`, {}, approver);
  endpoint.approved = true;
  save();
}
for (let attempt = 0; attempt < 20; attempt++) {
  const outcomes = [];
  for (const input of ["hello world", "marketplace-secret"]) {
    const response = await fetch(`http://127.0.0.1:18091/runtime/v1/endpoints/${endpoint.endpointId}/backend/v1/scans`, {
      method: "POST", signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${endpoint.credential}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input, flagOnly: false }),
    });
    const value = await response.json().catch(() => ({}));
    outcomes.push(response.ok ? value.result?.outcome : `HTTP ${response.status}`);
  }
  if (outcomes.join(",") === "cleared,blocked") {
    endpoint.ready = true;
    save();
    console.log(`Ready local NeMo endpoint ${endpoint.endpointId}: safe cleared, synthetic keyword blocked.`);
    process.exit(0);
  }
  if ([0, 19].includes(attempt)) console.log(`Waiting on NeMo runner: ${outcomes.join(", ")}`);
  await new Promise(resolve => setTimeout(resolve, 1500));
}
throw new Error("Local NeMo endpoint did not return the expected cleared/blocked outcomes.");
