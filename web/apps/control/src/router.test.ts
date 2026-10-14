import { createMemoryHistory, createRootRoute, createRoute } from "@tanstack/react-router";
import { expect, it, vi } from "vitest";
import { getRouter } from "./router";

// Use a small real route tree to exercise the application's URL integration
// without loading unrelated screens and their backend dependencies.
vi.mock("./routeTree.gen", () => {
  const root = createRootRoute();
  return {
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/guardrails" }),
      createRoute({ getParentRoute: () => root, path: "/policies" }),
      createRoute({ getParentRoute: () => root, path: "/guardrails/$guardrailId" }),
    ]),
  };
});

it.each(["v1", "v2"])("opens existing routes under /%s and preserves the prefix on navigation", async (version) => {
  const router = getRouter();
  router.update({ context: router.options.context, history: createMemoryHistory({ initialEntries: [`/${version}/guardrails?role=tech#Guardrail/tests/`] }) });
  await router.load();
  expect(router.state.statusCode).toBe(200);
  expect(router.state.location.pathname).toBe("/guardrails");
  expect(router.state.location.publicHref).toBe(`/${version}/guardrails?role=tech#Guardrail/tests/`);
  expect(router.buildLocation({ to: "/policies", search: { version: 3, item: "policy-demo" } }).publicHref)
    .toBe(`/${version}/policies?version=3&item=policy-demo`);
  await router.navigate({ to: "/guardrails/$guardrailId", params: { guardrailId: "profile-demo" } });
  expect(router.state.location.publicHref).toBe(`/${version}/guardrails/profile-demo`);
  expect(router.state.location.pathname).toBe("/guardrails/profile-demo");
});

it("redirects unprefixed bookmarks to V1 and defaults new links to V1", async () => {
  const router = getRouter();
  router.update({ context: router.options.context, history: createMemoryHistory({ initialEntries: ["/guardrails"] }) });
  await router.load();
  expect(router.state.statusCode).toBe(307);
  expect(router.state.redirect?.headers.get("Location")).toBe("/v1/guardrails");
  expect(router.buildLocation({ to: "/policies" }).publicHref).toBe("/v1/policies");
});
