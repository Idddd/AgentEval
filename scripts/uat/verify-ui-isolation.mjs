// Read-only release smoke: uses disposable localhost containers and synthetic
// configuration, never a real NeMo/F5/database account or existing container.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const image = process.argv[2];
if (!image || !/^[a-z0-9][a-z0-9./:_-]*$/.test(image)) throw new Error("Usage: node verify-ui-isolation.mjs IMAGE [REPORT.json] [--keep-last]");
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 60_000 });
  assert.equal(result.status, 0, `Docker command failed: ${result.stderr}`);
  return result.stdout.trim();
}
const inspect = JSON.parse(docker(["image", "inspect", image]))[0];
assert(inspect.Config.Healthcheck.Test.join(" ").includes("/api/health"), "Image healthcheck must check UI health");
assert(!inspect.Config.Healthcheck.Test.join(" ").includes("/api/nmgr/ready"));
const base = {
  GUARD_API_URL: "http://127.0.0.1:9/api/v1",
  GUARD_API_TOKEN: "smoke-business-fixture",
  MARKETPLACE_DATABASE_URL: "postgres://smoke:synthetic@127.0.0.1:9/marketplace_smoke",
};
const cases = [
  ["missing-nemo-url", { GUARD_API_URL: "" }, "nemo", "nemo_url_missing"],
  ["invalid-nemo-url", { GUARD_API_URL: "ftp://nemo.invalid/api/v1" }, "nemo", "nemo_url_invalid"],
  ["missing-database", { MARKETPLACE_DATABASE_URL: "" }, "database", "database_config_invalid"],
  ["invalid-database", { MARKETPLACE_DATABASE_URL: "invalid" }, "database", "database_config_invalid"],
  ["invalid-token-format", { GUARD_API_TOKEN: "Bearer invalid" }, "nemo", "nemo_token_config_invalid"],
  ["missing-token-secret", { MARKETPLACE_NEMO_AUTH_MODE: "token", GUARD_API_TOKEN: "" }, "nemo", "nemo_token_config_invalid"],
  ["legacy-password-without-token", { MARKETPLACE_NEMO_AUTH_MODE: "password", GUARD_API_TOKEN: "" }, "nemo", "nemo_token_config_invalid"],
  ["legacy-auth-selector-ignored", { MARKETPLACE_NEMO_AUTH_MODE: "invalid" }, "database", "database_unreachable"],
  ["legacy-password-selector-ignored", { MARKETPLACE_NEMO_AUTH_MODE: "password", GUARD_API_TOKEN: "synthetic-stale-token" }, "database", "database_unreachable"],
  ["token-mode-stale-password", { MARKETPLACE_NEMO_AUTH_MODE: "token", GUARD_API_TOKEN: "", GUARD_USERNAME: "synthetic-old-user", GUARD_PASSWORD: "synthetic-old-password" }, "nemo", "nemo_token_config_invalid"],
  ["missing-f5-secret", { MARKETPLACE_F5_ENABLED: "true" }, "f5", "f5_config_invalid"],
  ["partial-f5-config", { F5_API_URL: "https://f5.invalid/backend/v1" }, "f5", "f5_config_invalid"],
  ["complete-url-ignores-legacy-password-secret", { MARKETPLACE_DATABASE_PASSWORD_REQUIRED: "true" }, "database", "database_unreachable"],
  ["missing-database-ca", { MARKETPLACE_DB_TLS: "true", MARKETPLACE_DB_CA_FILE: "/missing/ca.crt" }, "database", "database_config_invalid"],
  ["database-offline", {}, "database", "database_unreachable"],
  ["nemo-offline", {}, "nemo", "nemo_unreachable", "/api/nmgr/workspace"],
];
const report = { image, imageId: inspect.Id, platform: `${inspect.Os}/${inspect.Architecture}`, checkedAt: new Date().toISOString(), cases: [] };
for (let index = 0; index < cases.length; index++) {
  const [label, overrides, component, code, path = "/api/nmgr/ready"] = cases[index];
  const name = `ui-isolation-${process.pid}-${index}`;
  let keep = false;
  try {
    docker(["run", "-d", "--pull=never", "--name", name, "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop=ALL", "--security-opt", "no-new-privileges", "-p", "127.0.0.1::8080", ...Object.entries({ ...base, ...overrides }).flatMap(([key, value]) => ["-e", `${key}=${value}`]), image]);
    const address = docker(["port", name, "8080/tcp"]);
    assert(/^127\.0\.0\.1:\d+$/.test(address));
    const origin = `http://${address}`;
    let healthy = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { healthy = (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch {}
      if (healthy) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert(healthy, `${label}: UI must start even with broken real configuration`);
    const failed = await fetch(origin + path, { headers: { Authorization: "Bearer smoke-user-fixture" }, signal: AbortSignal.timeout(25000) });
    const body = await failed.json();
    assert.equal(failed.status, 503, `${label}: explicit failure`);
    assert.equal(body.error.component, component, label);
    assert.equal(body.error.code, code, label);
    assert(body.error.settings.length > 0);
    assert.equal(failed.headers.get("x-request-id"), body.error.requestId);
    for (const route of ["/v2/guardrails?role=tech", "/v2-mock/guardrails", "/v3/guardrails"]) {
      const page = await fetch(origin + route);
      assert.equal(page.status, 200, `${label}: ${route} must still serve the UI shell`);
      assert.match(page.headers.get("content-type"), /text\/html/);
      const html = await page.text();
      const asset = html.match(/(?:src|href)="([^\"]*\/assets\/[^\"]+\.js)"/);
      assert(asset, `${label}: real built JavaScript asset must be referenced`);
      assert((await fetch(new URL(asset[1], origin))).ok, `${label}: JavaScript assets remain reachable`);
    }
    assert((await fetch(`${origin}/api/health`)).ok, `${label}: failure must not kill UI`);
    // docker logs may place application error output on stderr instead of stdout.
    const allLogs = spawnSync("docker", ["logs", name], { encoding: "utf8" });
    assert.equal(allLogs.status, 0);
    assert((allLogs.stdout + allLogs.stderr).includes(body.error.requestId), `${label}: correlated diagnostic log`);
    assert(!JSON.stringify(body).includes("synthetic"));
    keep = process.argv.includes("--keep-last") && index === cases.length - 1;
    report.cases.push({ case: label, uiHealth: 200, errorStatus: failed.status, component, code, reference: body.error.requestId, ...(keep ? { container: name, origin } : {}) });
    console.log(`PASS ${label}: UI 200, V3 ${failed.status} ${component}/${code}${keep ? ` (${origin}, ${name})` : ""}`);
  } finally {
    if (!keep) docker(["rm", "-f", name]);
  }
}
const output = process.argv[3];
if (output && !output.startsWith("--")) writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(`Verified ${report.cases.length} failure cases against ${report.imageId}.`);
