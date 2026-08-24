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

describe("Guard Governance routes", () => {
  it.each([
    ["/individual/governance/guardrails", "/$projectId/governance/guardrails/"],
    [
      "/individual/governance/guardrails/relay-preview",
      "/$projectId/governance/guardrails/relay-preview",
    ],
    ["/individual/governance/assignments", "/$projectId/governance/assignments"],
    [
      "/individual/governance/policy-library",
      "/$projectId/governance/policy-library",
    ],
    ["/individual/governance/enforcements", "/$projectId/governance/enforcements"],
    ["/individual/governance/integrations", "/$projectId/governance/integrations"],
    ["/individual/governance/evidence", "/$projectId/governance/evidence"],
  ])("matches %s inside the isolated layout", (pathname, routeId) => {
    const matches = matchRouteIds(pathname);
    expect(matches).toContain("/$projectId/governance");
    expect(matches).toContain(routeId);
  });

  it("matches Guardrail detail inside the governance namespace", () => {
    expect(
      matchRouteIds(
        "/individual/governance/guardrails/guardrail-production",
      ),
    ).toContain("/$projectId/governance/guardrails/$guardrailId");
  });

  it("keeps the legacy Guardrails route available for canonical redirect", () => {
    expect(matchRouteIds("/individual/guardrails")).toContain(
      "/$projectId/guardrails",
    );
  });
});
