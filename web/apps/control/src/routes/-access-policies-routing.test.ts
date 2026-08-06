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

describe("Access Policies routes", () => {
  it("matches the policy list as an index route", () => {
    const routeIds = matchRouteIds("/individual/access-policies");

    expect(routeIds).toContain("/$projectId/access-policies/");
  });

  it("matches policy details without rendering the list route as a parent", () => {
    const routeIds = matchRouteIds(
      "/individual/access-policies/research-readonly",
    );

    expect(routeIds).toContain("/$projectId/access-policies/$policyId");
    expect(routeIds).not.toContain("/$projectId/access-policies/");
  });
});
