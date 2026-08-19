import { describe, expect, it } from "vitest";
import {
  itemIsActive,
  projectNavGroups,
  visibleProjectNavGroups,
} from "./app-shell";

function labelsFor(persona: "admin" | "agent-wizard" | "end-user") {
  return visibleProjectNavGroups(
    persona === "admin" ? "admin" : persona === "agent-wizard" ? "member" : "frt",
    persona,
    persona === "admin",
  ).flatMap((group) => group.items.map((item) => item.label));
}

function navItem(label: string) {
  return projectNavGroups.flatMap((group) => group.items).find((item) => item.label === label)!;
}

describe("role lifecycle navigation", () => {
  it("shows end users only approved capabilities and their instances", () => {
    expect(labelsFor("end-user")).toEqual(["Agent Garden", "My Instances"]);
  });

  it("gives Agent Wizard one build lifecycle plus the published garden", () => {
    expect(labelsFor("agent-wizard")).toEqual(["My Builds", "Agent Garden"]);
  });

  it("gives Admin review, governance, monitoring, and published catalog surfaces", () => {
    expect(labelsFor("admin")).toEqual([
      "Reviews",
      "Guardrails",
      "Behavior",
      "Production Monitoring",
      "Agent Garden",
    ]);
  });

  it("keeps the lifecycle navigation active throughout evaluation detail routes", () => {
    expect(itemIsActive(navItem("Reviews"), "/individual/evaluation/catalog", "individual")).toBe(true);
    expect(itemIsActive(navItem("Reviews"), "/individual/evaluation/targets/demo", "individual")).toBe(true);
    expect(itemIsActive(navItem("Reviews"), "/individual/evaluation/behavior", "individual")).toBe(false);
    expect(itemIsActive(navItem("Behavior"), "/individual/evaluation/behavior", "individual")).toBe(true);
    expect(itemIsActive(navItem("Reviews"), "/individual/evaluation/overview", "individual")).toBe(false);
    expect(itemIsActive(navItem("Production Monitoring"), "/individual/evaluation/overview", "individual")).toBe(true);
  });

  it("keeps Guardrails active on its detail pages", () => {
    expect(itemIsActive(
      navItem("Guardrails"),
      "/individual/governance/guardrails/guardrail-production",
      "individual",
    )).toBe(true);
  });
});
