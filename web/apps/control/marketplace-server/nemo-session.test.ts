import { expect, it, vi } from "vitest";
vi.mock("./storage/database", () => ({ openDatabase: async () => ({ exclusive: (fn: () => Promise<unknown>) => fn(), readDocument: async () => undefined }) }));
import { nmgrApi } from "./nmgr-api";
const env = { MARKETPLACE_DATA_MODE: "live", GUARD_API_URL: "http://nemo.internal/api/v1", GUARD_AUTH_ORIGIN: "http://nemo.local", GUARD_USERNAME: "service@example.com", GUARD_PASSWORD: "server-only-password", MARKETPLACE_PUBLIC_ORIGIN: "http://127.0.0.1:18082", MARKETPLACE_DATABASE_URL: "mariadb://test@localhost/test", MARKETPLACE_V2_LOCAL_ACCESS: "true", MARKETPLACE_V2_LOCAL_ACTOR_ID: "author", MARKETPLACE_V2_ACCOUNTS_JSON: JSON.stringify({ author: { name: "Local Author", role: "User", unit: "ISS" } }) };
const identity = { userId: "service", role: "user", authentication: "session", effectivePermissions: null };
const cookie = "tali-guard.session_token=upstream-only-session";
const request = (path = "/api/nmgr/workspace") => new Request(env.MARKETPLACE_PUBLIC_ORIGIN + path);
const fetcherFor = () => vi.fn<typeof fetch>(async url => String(url).endsWith("/sign-in/email") ? Response.json({ token: "secret-response-token" }, { headers: { "Set-Cookie": cookie + "; HttpOnly" } }) : Response.json(identity));
it("enters with a fixed local actor using only backend NeMo credentials", async () => {
  const fetcher = fetcherFor();
  const response = await nmgrApi(request(), env, fetcher);
  expect(response.status).toBe(200);
  const snapshot = await response.json();
  expect(snapshot.actor).toEqual({ id: "author", name: "Local Author", role: "User", unit: "ISS" });
  expect(snapshot.accessMode).toBe("local");
  expect(JSON.stringify(snapshot)).not.toMatch(/server-only-password|upstream-only-session|secret-response-token/);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ email: "service@example.com", password: "server-only-password", rememberMe: false });
  expect(new Headers(fetcher.mock.calls[1]![1]!.headers).get("cookie")).toBe(cookie);
});
it("coalesces concurrent NeMo logins and reuses the service session", async () => {
  const fetcher = fetcherFor();
  const responses = await Promise.all([nmgrApi(request(), env, fetcher), nmgrApi(request(), env, fetcher), nmgrApi(request(), env, fetcher)]);
  expect(responses.map(r => r.status)).toEqual([200, 200, 200]);
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/sign-in/email"))).toHaveLength(1);
});
it("renews an expired service session once and retries the rejected request", async () => {
  let identities = 0;
  const fetcher = vi.fn<typeof fetch>(async url => {
    if (String(url).endsWith("/sign-in/email")) return Response.json({}, { headers: { "Set-Cookie": cookie } });
    return ++identities === 2 ? Response.json({}, { status: 401 }) : Response.json(identity);
  });
  expect((await nmgrApi(request(), env, fetcher)).status).toBe(200);
  expect((await nmgrApi(request(), env, fetcher)).status).toBe(200);
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/sign-in/email"))).toHaveLength(2);
});
it.each([401, 429, 500])("fails closed and avoids a login storm after upstream failure %s", async status => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ message: "secret upstream detail" }, { status }));
  for (let i = 0; i < 2; i++) { const response = await nmgrApi(request(), env, fetcher); expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret upstream"); }
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("does not accept NeMo passwords from the browser", async () => {
  const fetcher = fetcherFor();
  const response = await nmgrApi(new Request(env.MARKETPLACE_PUBLIC_ORIGIN + "/api/nmgr/auth/login", { method: "POST", body: JSON.stringify({ username: "attacker", password: "attacker" }) }), env, fetcher);
  expect(response.status).toBe(404); expect(fetcher).not.toHaveBeenCalled();
});
it("never permits direct fixed-identity access with a non-loopback deployment origin", async () => {
  const fetcher = fetcherFor();
  const response = await nmgrApi(request(), { ...env, MARKETPLACE_PUBLIC_ORIGIN: "https://marketplace.internal" }, fetcher);
  expect(response.status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
});
it("rejects local writes with a missing origin", async () => {
  const fetcher = fetcherFor();
  const response = await nmgrApi(new Request(env.MARKETPLACE_PUBLIC_ORIGIN + "/api/nmgr/commands", { method: "POST", body: "{}" }), env, fetcher);
  expect(response.status).toBe(403); expect(fetcher).not.toHaveBeenCalled();
});
it("does not accept a client-selected actor or a platform admin service account", async () => {
  const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith("/sign-in/email") ? Response.json({}, { headers: { "Set-Cookie": cookie } }) : Response.json({ ...identity, role: "admin" }));
  expect((await nmgrApi(request(), env, fetcher)).status).toBe(503);
  expect((await nmgrApi(request("/api/nmgr/workspace?actor=tech"), env, fetcher)).status).toBe(404);
});
