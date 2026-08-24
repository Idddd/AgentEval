import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { getRouter } from "@/router";

function routeIds(pathname: string) {
  const router = getRouter();
  router.update({
    context: router.options.context,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  return router.matchRoutes(pathname).map((match) => match.routeId);
}

describe("session demo workflow routes", () => {
  it.each([
    ["/individual/create", "/$projectId/create"],
    ["/individual/builds", "/$projectId/builds"],
    [
      "/individual/technical-validation",
      "/$projectId/technical-validation",
    ],
  ])("matches %s", (pathname, expected) => {
    expect(routeIds(pathname)).toContain(expected);
  });
});
