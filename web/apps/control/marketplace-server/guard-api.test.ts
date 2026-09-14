import { expect, it, vi } from "vitest";
import { allowedGuardRoute, guardProxy, runtimeResponse } from "./guard-api";
const env = {
  MARKETPLACE_DATA_MODE: "live",
  GUARD_API_URL: "http://guard.internal:8080/api/v1",
};
const request = (path = "/policies", method = "GET", headers = {}) =>
  new Request(`http://localhost/api/guard${path}`, {
    method,
    headers: {
      Authorization: "Bearer personal-token",
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(method !== "GET" ? { body: "{}" } : {}),
  });
it("defaults to mock and exposes neither upstream URLs nor secrets", async () => {
  expect(await runtimeResponse({}).json()).toMatchObject({
    mode: "mock",
    policyAuthoring: false,
  });
  const response = runtimeResponse(env);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).not.toContain("guard.internal");
  expect(runtimeResponse({ MARKETPLACE_DATA_MODE: "live" }).status).toBe(503);
  expect(
    runtimeResponse({
      ...env,
      GUARD_API_URL: "https://user:secret@guard/api/v1",
    }).status,
  ).toBe(503);
});
it("allows only the scoped OpenAPI operations", () => {
  expect(allowedGuardRoute("/policies/a/validation-runs/run-1", "GET")).toBe(
    true,
  );
  for (const path of [
    "/account/tokens",
    "/endpoints",
    "/policies/../../account",
    "/policies/a%2Fb",
    "//other.host",
  ])
    expect(allowedGuardRoute(path, "POST")).toBe(false);
  expect(allowedGuardRoute("/policies/a", "DELETE")).toBe(false);
});
it("forwards per-user authorization and exact body, never upstream cookies", async () => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({ id: "new" }, { status: 201 }),
  );
  const response = await guardProxy(
    request("/guardrails", "POST", { Cookie: "unrelated=secret" }),
    env,
    fetcher,
  );
  expect(response.status).toBe(201);
  const [url, init] = fetcher.mock.calls[0]!;
  expect(url).toBe("http://guard.internal:8080/api/v1/guardrails");
  expect(init?.headers).toEqual({
    Authorization: "Bearer personal-token",
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  expect(init?.redirect).toBe("manual");
  expect(init?.body).toBe("{}");
});
it("blocks unauthenticated, cross-origin, mock-mode and unconfigured authoring requests", async () => {
  const fetcher = vi.fn();
  expect(
    (
      await guardProxy(
        new Request("http://localhost/api/guard/policies"),
        env,
        fetcher,
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await guardProxy(
        request("/policies", "POST", { Origin: "https://attacker.test" }),
        env,
        fetcher,
      )
    ).status,
  ).toBe(403);
  expect((await guardProxy(request(), {}, fetcher)).status).toBe(409);
  const req = new Request("http://localhost/api/guard-policy-draft", {
    method: "POST",
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  expect((await guardProxy(req, env, fetcher)).status).toBe(501);
  expect(fetcher).not.toHaveBeenCalled();
});
it("keeps auth errors and uncertain writes distinct from successful data", async () => {
  const unauthorized = await guardProxy(
    request(),
    env,
    vi.fn(async () =>
      Response.json(
        { error: { code: "denied", message: "Denied" } },
        { status: 403 },
      ),
    ),
  );
  expect(unauthorized.status).toBe(403);
  const failed = await guardProxy(
    request("/policies", "POST"),
    env,
    vi.fn(async () => {
      throw new Error("socket reset with secret");
    }),
  );
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("secret");
  const redirect = await guardProxy(
    request(),
    env,
    vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://other.test" },
        }),
    ),
  );
  expect(redirect.status).toBe(502);
});
it("supports an explicitly configured TLS reverse proxy origin without trusting forwarded headers", async () => {
  const fetcher = vi.fn(async () => Response.json({ items: [] }));
  const config = {
    ...env,
    MARKETPLACE_PUBLIC_ORIGIN: "https://marketplace.internal",
  };
  expect(
    (
      await guardProxy(
        request("/policies", "POST", {
          Origin: "https://marketplace.internal",
        }),
        config,
        fetcher,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await guardProxy(
        request("/policies", "POST", {
          Origin: "https://attacker.test",
          "X-Forwarded-Host": "attacker.test",
        }),
        config,
        fetcher,
      )
    ).status,
  ).toBe(403);
});
