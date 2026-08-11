import { describe, expect, it } from "vitest";
import type { ProjectRole } from "@/types/project";
import { itemIsActive, navItemVisibleForRole, projectNavGroups } from "./app-shell";

function visibleLabels(groupLabel: string, role: ProjectRole) {
  return projectNavGroups
    .find((group) => group.label === groupLabel)!
    .items.filter((item) => navItemVisibleForRole(item, role))
    .map((item) => item.label);
}

describe("Evaluation navigation", () => {
  it("keeps the Evaluation section consolidated under Eval and moves the merged Overview to Observer", () => {
    expect(
      projectNavGroups
        .find((group) => group.label === "Evaluation")
        ?.items.map((item) => item.label),
    ).toEqual(["Eval"]);
    expect(
      projectNavGroups
        .find((group) => group.label === "Observer")
        ?.items.map((item) => item.label),
    ).toEqual(["Traces", "Overview", "Cost"]);
  });

  it("keeps the Eval active state scoped to the catalog", () => {
    const group = projectNavGroups.find((item) => item.label === "Evaluation")!;
    const catalog = group.items[0]!;
    expect(itemIsActive(catalog, "/individual/evaluation/catalog", "individual")).toBe(true);
    expect(itemIsActive(catalog, "/individual/evaluation/targets/demo", "individual")).toBe(false);
  });
});

describe("Guard Governance navigation", () => {
  it("adds five isolated governance entries without replacing Security Guardrails", () => {
    expect(
      projectNavGroups
        .find((group) => group.label === "Guard Governance")
        ?.items.map((item) => item.label),
    ).toEqual([
      "Guardrails",
      "Assignments",
      "Enforcements",
      "Integrations",
      "Evidence",
    ]);
    expect(
      projectNavGroups
        .find((group) => group.label === "Security")
        ?.items.some((item) => item.to === "/$projectId/guardrails"),
    ).toBe(true);
  });

  it("keeps Guardrails active on a governance detail route", () => {
    const guardrails = projectNavGroups
      .find((group) => group.label === "Guard Governance")!
      .items.find((item) => item.label === "Guardrails")!;
    expect(
      itemIsActive(
        guardrails,
        "/individual/governance/guardrails/guardrail-production",
        "individual",
      ),
    ).toBe(true);
  });
});

describe("Role-based navigation whitelist", () => {
  it("shows every item to admin", () => {
    for (const group of projectNavGroups) {
      expect(visibleLabels(group.label, "admin")).toEqual(
        group.items.map((item) => item.label),
      );
    }
  });

  it("shows member every item allowed by its role whitelist", () => {
    for (const group of projectNavGroups) {
      expect(visibleLabels(group.label, "member")).toEqual(
        group.items
          .filter((item) => navItemVisibleForRole(item, "member"))
          .map((item) => item.label),
      );
    }
    expect(visibleLabels("Security", "member")).not.toContain("Guardrails");
    expect(visibleLabels("Guard Governance", "member")).toContain("Guardrails");
  });

  it("restricts compliance to policy, behavior, and traceability surfaces", () => {
    expect(visibleLabels("Agentic", "compliance")).toEqual([]);
    expect(visibleLabels("Evaluation", "compliance")).toEqual([]);
    expect(visibleLabels("Security", "compliance")).toEqual([
      "Access Policies",
      "Runtime Policies",
      "Audit Logs",
    ]);
    expect(visibleLabels("Observer", "compliance")).toEqual([
      "Traces",
      "Overview",
    ]);
  });

  it("gives ADA and ISS risk-assessment, behavior, and traceability surfaces", () => {
    for (const role of ["ada", "iss"] as const) {
      expect(visibleLabels("Agentic", role)).toEqual(["Skills", "MCP Servers"]);
      expect(visibleLabels("Evaluation", role)).toEqual(["Eval"]);
      expect(visibleLabels("Security", role)).toEqual(["Audit Logs"]);
      expect(visibleLabels("Observer", role)).toEqual(["Traces", "Overview"]);
    }
  });

  it("gives FRT everything except policy compliance and admin-only surfaces", () => {
    expect(visibleLabels("Agentic", "frt")).toEqual([
      "Agent Garden",
      "Instances",
      "Skills",
      "MCP Servers",
      "Knowledge Base",
      "Memory",
    ]);
    expect(visibleLabels("Evaluation", "frt")).toEqual(["Eval"]);
    expect(visibleLabels("Security", "frt")).toEqual([
      "Access Policies",
      "Runtime Policies",
      "Audit Logs",
    ]);
    expect(visibleLabels("Observer", "frt")).toEqual(["Traces", "Overview"]);
  });
});
