import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { hasNemoCredentials, nemoServiceFetch } from "./nemo-session";

const env = { GUARD_API_URL: "https://nemo.internal/api/v1", GUARD_API_TOKEN: "server-secret" };
it("uses the backend bearer token instead of browser credentials or password login", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
  expect(hasNemoCredentials(env)).toBe(true);
  const send = nemoServiceFetch({ ...env, GUARD_USERNAME: "old-account", GUARD_PASSWORD: "old-password" }, fetcher);
  await send(`${env.GUARD_API_URL}/policies`, { method: "POST", body: "{}", headers: { Authorization: "Bearer browser-token", Cookie: "browser-session", "Content-Type": "application/json" } });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [target, options] = fetcher.mock.calls[0]!;
  expect(target).toBe(`${env.GUARD_API_URL}/policies`);
  expect(options).toMatchObject({ method: "POST", body: "{}", redirect: "manual" });
  expect(new Headers(options!.headers).get("authorization")).toBe("Bearer server-secret");
  expect(new Headers(options!.headers).has("cookie")).toBe(false);
});
it("reads a mounted token file and picks up rotation on the next request client", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nemo-token-")), path = join(dir, "token");
  try {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
    for (const value of ["first-token", "rotated-token"]) {
      writeFileSync(path, value + "\n");
      await nemoServiceFetch({ ...env, GUARD_API_TOKEN_FILE: path }, fetcher)(`${env.GUARD_API_URL}/policies`);
      expect(new Headers(fetcher.mock.lastCall![1]!.headers).get("authorization")).toBe(`Bearer ${value}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it.each(["", "  ", "Bearer token", "token\r\ninjected"]) ("fails closed for malformed configured tokens: %j", token => {
  const fetcher = vi.fn<typeof fetch>();
  expect(() => nemoServiceFetch({ ...env, GUARD_API_TOKEN: token, GUARD_USERNAME: "old", GUARD_PASSWORD: "old" }, fetcher)).toThrow(/token/i);
  expect(fetcher).not.toHaveBeenCalled();
});
it("fails closed when the token file is missing", () => {
  expect(() => nemoServiceFetch({ ...env, GUARD_API_TOKEN_FILE: "missing-token-file" })).toThrow(/token/i);
});
it.each([
  { MARKETPLACE_NEMO_AUTH_MODE: "password", GUARD_API_TOKEN: "stale-token" },
  { MARKETPLACE_NEMO_AUTH_MODE: "password", GUARD_API_TOKEN_FILE: "missing-old-token-file" },
  { MARKETPLACE_NEMO_AUTH_MODE: "token", GUARD_USERNAME: "old-user", GUARD_PASSWORD: "old-password" },
])("does not switch from a selected missing credential source to stale alternate credentials: %j", selected => {
  const fetcher = vi.fn<typeof fetch>();
  expect(hasNemoCredentials(selected)).toBe(true);
  expect(() => nemoServiceFetch({ GUARD_API_URL: env.GUARD_API_URL, ...selected }, fetcher)).toThrow(selected.MARKETPLACE_NEMO_AUTH_MODE === "password" ? /username and password/i : /token/i);
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([401, 403])("does not retry or leak upstream authentication errors (%s)", async status => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ error: { message: "server-secret" } }, { status }));
  await expect(nemoServiceFetch(env, fetcher)(`${env.GUARD_API_URL}/policies`, { method: "POST", body: "{}" })).rejects.toThrow(/NeMo.*token/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(["https://evil.example/api/v1/policies", "https://nemo.internal/api/v1/../../elsewhere"]) ("never sends the service token outside the API: %s", async target => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(nemoServiceFetch(env, fetcher)(target)).rejects.toThrow(/target/);
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not retry uncertain writes", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => { throw new Error("connection lost"); });
  await expect(nemoServiceFetch(env, fetcher)(`${env.GUARD_API_URL}/policies`, { method: "POST" })).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
