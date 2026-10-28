// Read-only compatibility check. Run inside the supplied image; no npm install.
import { readFileSync } from "node:fs";
const base = process.env.GUARD_API_URL?.replace(/\/+$/, "");
if (!base || !base.endsWith("/api/v1")) throw new Error("Set GUARD_API_URL to the existing NeMo /api/v1 URL.");
try {
  const response = await fetch(base.slice(0, -"/v1".length) + "/openapi.json", { redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`OpenAPI endpoint returned HTTP ${response.status}`);
  const spec = await response.json();
  const required = [
    ["/api/v1/account/identity", "get"],
    ["/api/v1/policies/{id}/definition", "put"],
    ["/api/v1/policies/{id}/definition/test-runs", "post"],
    ["/api/v1/policies/{id}/definition/publish", "post"],
    ["/api/v1/guardrails/{guardrailId}/test-runs", "post"],
    ["/api/v1/guardrails/{id}/versions/{version}/test-runs", "post"],
    ["/api/v1/guardrails/{id}/versions/{version}/release", "post"],
  ];
  const missing = required.filter(([path, method]) => !spec.paths?.[path]?.[method]);
  if (missing.length) throw new Error("Required NeMo API operations are missing: " + missing.map(([path, method]) => `${method.toUpperCase()} ${path}`).join(", "));
  console.log("PASS: NeMo is reachable and advertises the required V2 API operations.");
  if (process.env.MARKETPLACE_V2_ACCOUNTS_FILE) {
    const accounts = JSON.parse(readFileSync(process.env.MARKETPLACE_V2_ACCOUNTS_FILE, "utf8"));
    for (const role of ["User", "User Admin", "IT Admin"]) if (!Object.values(accounts).some(account => account.role === role)) throw new Error(`Account mapping is missing the ${role} role.`);
    if (Object.keys(accounts).some(id => id.startsWith("replace-with-"))) throw new Error("Replace example account IDs before using V2.");
    console.log("PASS: all three Marketplace roles are configured.");
  }
  console.log("This read-only check does not prove account permissions, Runner readiness or successful release. Complete the documented acceptance flow.");
} catch (error) { console.error(error instanceof Error ? error.message : "Compatibility check failed."); process.exitCode = 1; }
