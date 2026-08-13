import { describe, expect, it } from "vitest";
import type { ProjectRole } from "@/types/project";
import {
  itemIsActive,
  navItemVisibleForRole,
  projectNavGroups,
  visibleProjectNavGroups,
} from "./app-shell";

function visibleLabels(groupLabel: string, role: ProjectRole) {
  return projectNavGroups
    .find((group) => group.label === groupLabel)!
    .items.filter((item) => navItemVisibleForRole(item, role))
    .map((item) => item.label);
}

describe("Evaluation navigation", () => {
  it("labels the merged observer page as Production Monitoring", () => {
    expect(
      projectNavGroups
        .find((group) => group.label === "Evaluation")
        ?.items.map((item) => item.label),
    ).toEqual(["Eval", "Behavior", "ID Management"]);
    expect(
      projectNavGroups
        .find((group) => group.label === "Observer")
        ?.items.map((item) => item.label),
    ).toEqual(["Traces", "Production Monitoring", "Cost"]);
  });

  it("keeps the Eval active state scoped to the catalog", () => {
    const group = projectNavGroups.find((item) => item.label === "Evaluation")!;
    const catalog = group.items[0]!;
    expect(itemIsActive(catalog, "/individual/evaluation/catalog", "individual")).toBe(true);
    expect(itemIsActive(catalog, "/individual/evaluation/targets/demo", "individual")).toBe(false);
  });

  it("scopes Behavior and ID Management active states to their own pages", () => {
    const items = projectNavGroups.find((item) => item.label === "Evaluation")!.items;
    expect(itemIsActive(items[1]!, "/individual/evaluation/behavior", "individual")).toBe(true);
    expect(itemIsActive(items[1]!, "/individual/evaluation/id-management", "individual")).toBe(false);
    expect(itemIsActive(items[2]!, "/individual/evaluation/id-management", "individual")).toBe(true);
  });
});

describe("Guard Governance navigation", () => {
  it("replaces Security Guardrails with the governance page and hides its old group", () => {
    expect(projectNavGroups.some((group) => group.label === "Guard Governance")).toBe(false);
    const securityGuardrails = projectNavGroups
      .find((group) => group.label === "Security")!
      .items.find((item) => item.label === "Guardrails");
    expect(securityGuardrails?.to).toBe("/$projectId/governance/guardrails");
  });

  it("keeps Guardrails active on a governance detail route", () => {
    const guardrails = projectNavGroups
      .find((group) => group.label === "Security")!
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
  it("shows End user only the complete Agentic group", () => {
    const groups = visibleProjectNavGroups("frt", "end-user", true);

    expect(groups.map((group) => group.label)).toEqual(["Agentic"]);
    expect(groups[0]!.items.map((item) => item.label)).toEqual([
      "Agent Garden",
      "Instances",
      "Skills",
      "MCP Servers",
      "Knowledge Base",
      "Memory",
    ]);
  });

  it("keeps Agent Wizard on the existing ADA navigation permissions", () => {
    const groups = visibleProjectNavGroups("ada", "agent-wizard", true);
    const labels = (group: string) =>
      groups.find((item) => item.label === group)?.items.map((item) => item.label) ?? [];

    expect(labels("Agentic")).toEqual(["Skills", "MCP Servers"]);
    expect(labels("Evaluation")).toEqual(["Eval", "Behavior"]);
    expect(labels("Observer")).toEqual(["Traces", "Production Monitoring"]);
  });

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
  });

  it("restricts compliance to policy, behavior, and traceability surfaces", () => {
    expect(visibleLabels("Agentic", "compliance")).toEqual([]);
    expect(visibleLabels("Evaluation", "compliance")).toEqual(["Behavior"]);
    expect(visibleLabels("Security", "compliance")).toEqual([
      "Access Policies",
      "Runtime Policies",
      "Audit Logs",
    ]);
    expect(visibleLabels("Observer", "compliance")).toEqual([
      "Traces",
      "Production Monitoring",
    ]);
  });

  it("gives ADA and ISS risk-assessment, behavior, and traceability surfaces", () => {
    for (const role of ["ada", "iss"] as const) {
      expect(visibleLabels("Agentic", role)).toEqual(["Skills", "MCP Servers"]);
      expect(visibleLabels("Evaluation", role)).toEqual(["Eval", "Behavior"]);
      expect(visibleLabels("Security", role)).toEqual(["Audit Logs"]);
      expect(visibleLabels("Observer", role)).toEqual(["Traces", "Production Monitoring"]);
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
    expect(visibleLabels("Evaluation", "frt")).toEqual(["Eval", "Behavior", "ID Management"]);
    expect(visibleLabels("Security", "frt")).toEqual([
      "Access Policies",
      "Runtime Policies",
      "Audit Logs",
    ]);
    expect(visibleLabels("Observer", "frt")).toEqual(["Traces", "Production Monitoring"]);
  });
});
