// Requires the two disposable *_test databases; never points at the local business database.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const image = process.argv[2] ?? "marketplace-v2:uat-20261023-dual-db";
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Docker operation failed: ${args[0]}`);
  return result.stdout.trim();
}
const results = [];
for (const [dialect, url] of [
  ["postgresql", "postgresql://marketplace@host.docker.internal:15441/marketplace_compat_test"],
  ["mariadb", "mariadb://marketplace@host.docker.internal:13307/marketplace_compat_test"],
]) {
  const name = `marketplace-image-${dialect}-smoke`;
  docker(["run", "-d", "--name", name, "--memory", "384m", "--cpus", "1", "--read-only", "--tmpfs", "/tmp", "--user", "1000720000:0",
    "-p", "127.0.0.1:18086:8080", "-e", `MARKETPLACE_DATABASE_URL=${url}`, "-e", "MARKETPLACE_DATABASE_PASSWORD=compat-test-only",
    "-e", "MARKETPLACE_DB_TLS=false", "-e", "GUARD_API_URL=http://host.docker.internal:18083/api/v1",
    "-e", "MARKETPLACE_PUBLIC_ORIGIN=http://127.0.0.1:18086", "-e", 'MARKETPLACE_V2_ACCOUNTS_JSON={"test":{"name":"Test","role":"User","unit":"ISS"}}', image]);
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try { ready = (await fetch("http://127.0.0.1:18086/api/nmgr/ready", { signal: AbortSignal.timeout(2000) })).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.ok(ready, `${dialect} image readiness failed`);
    for (const path of ["/api/health", "/v3/guardrails", "/v2/guardrails", "/v2-mock/guardrails"]) {
      assert.equal((await fetch(`http://127.0.0.1:18086${path}`)).status, 200);
    }
    results.push({ dialect, ready: true, readonlyRoot: true, arbitraryUid: true });
  } finally { docker(["rm", "-f", name]); }
}
console.log(JSON.stringify({ image, results }));
