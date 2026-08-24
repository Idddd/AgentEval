import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { getRouter } from "@/router";

function matchRouteIds(pathname: string) {
  const router = getRouter();
  router.update({
    context: router.options.context,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  return router.matchRoutes(pathname).map((match) => match.routeId);
}

describe("Agent Garden routes", () => {
  it("matches a marketplace detail as a deep link", () => {
    const routeIds = matchRouteIds(
      "/individual/agent-garden/adk-customer-service",
    );

    expect(routeIds).toContain("/$projectId/agent-garden/$agentId");
    expect(routeIds).not.toContain("/$projectId/agent-garden/");
  });
});
