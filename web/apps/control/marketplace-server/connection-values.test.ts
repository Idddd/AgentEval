import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { connectionValues } from "./connection-values";
import { connectionEnvironment } from "./nmgr-connection-config";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const request = new Request("https://ui.test/api/nmgr/connection");
function inspect(env: NodeJS.ProcessEnv, saved = {}) {
  return connectionValues(connectionEnvironment(request, env, saved), connectionEnvironment(request, env), saved);
}
it("reads token files and distinguishes missing, empty and invalid content without returning secrets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "connection-values-")); dirs.push(dir);
  const file = join(dir, "token");
  expect(inspect({ GUARD_API_TOKEN_FILE: file }).nemoToken?.effective).toMatchObject({ status: "unreadable", code: "ENOENT", source: "GUARD_API_TOKEN_FILE" });
  await writeFile(file, "  \n");
  expect(inspect({ GUARD_API_TOKEN_FILE: file }).nemoToken?.effective.status).toBe("empty");
  await writeFile(file, "Bearer secret-value-1234");
  expect(inspect({ GUARD_API_TOKEN_FILE: file }).nemoToken?.effective).toMatchObject({ status: "invalid", code: "bearer_prefix" });
  await writeFile(file, "secret-value-1234\n");
  const result = inspect({ GUARD_API_TOKEN_FILE: file, F5_API_TOKEN_FILE: file });
  expect(result.nemoToken?.effective).toMatchObject({ status: "loaded", preview: "••••••••1234", length: 17, trimmed: true });
  expect(result.f5Token?.effective.status).toBe("loaded");
  expect(JSON.stringify(result)).not.toContain("secret-value-1234");
});
it("shows both deployment values and saved overrides using the actual provider precedence", () => {
  const result = inspect({ GUARD_API_TOKEN: "environment-token-1111", GUARD_API_TOKEN_FILE: "/unused", F5_API_TOKEN: "unused-token", F5_API_TOKEN_FILE: "/missing" }, { nemoToken: "manual-token-2222" });
  expect(result.nemoToken).toMatchObject({ overridden: true, effective: { source: "Saved settings", preview: "••••••••2222" }, deployment: { source: "GUARD_API_TOKEN", preview: "••••••••1111" } });
  expect(result.f5Token?.effective.status).toBe("unreadable");
});
it("redacts database credentials and query values; exposes no malformed URL or short token", () => {
  const result = inspect({ MARKETPLACE_DATABASE_URL: "postgres://user:private-password@db.test/app?schema=private-schema", MARKETPLACE_DATABASE_PASSWORD: "separate-password", GUARD_API_TOKEN: "tiny", F5_API_URL: "https://user:secret@f5.test/backend/v1?token=private-query" });
  expect(result.databaseUrl?.effective.preview).toBe("postgres://***:***@db.test/app?schema=***");
  expect(result.databasePassword?.effective.status).toBe("loaded");
  expect(result.nemoToken?.effective.preview).toBe("••••••••");
  expect(result.f5Url?.effective.status).toBe("invalid");
  for (const secret of ["private-password", "private-schema", "separate-password", "private-query", "tiny"]) expect(JSON.stringify(result)).not.toContain(secret);
  expect(inspect({ GUARD_API_URL: "not-a-url-with-secret" }).nemoUrl?.effective).toMatchObject({ status: "invalid", preview: "" });
});
