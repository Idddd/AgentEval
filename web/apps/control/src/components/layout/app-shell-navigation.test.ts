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

  it("gives Agent Wizard one Build workspace followed by Evaluate", () => {
    expect(labelsFor("agent-wizard")).toEqual(["Build", "Evaluate"]);
  });

  it("gives Admin review, governance, monitoring, and published catalog surfaces", () => {
    expect(labelsFor("admin")).toEqual([
      "Eval",
      "Guardrails",
      "Monitor",
    ]);
  });

  it("keeps the lifecycle navigation active throughout evaluation detail routes", () => {
    expect(itemIsActive(navItem("Eval"), "/individual/evaluation/catalog", "individual")).toBe(true);
    expect(itemIsActive(navItem("Eval"), "/individual/evaluation/overview", "individual")).toBe(false);
    expect(itemIsActive(navItem("Monitor"), "/individual/evaluation/overview", "individual")).toBe(true);
    expect(itemIsActive(navItem("Build"), "/individual/create", "individual")).toBe(true);
    expect(itemIsActive(navItem("Build"), "/individual/builds", "individual")).toBe(true);
    expect(itemIsActive(navItem("Evaluate"), "/individual/evaluation/catalog", "individual")).toBe(true);
    expect(itemIsActive(navItem("Evaluate"), "/individual/technical-validation", "individual")).toBe(true);
  });

  it("keeps Guardrails active on its detail pages", () => {
    expect(itemIsActive(
      navItem("Guardrails"),
      "/individual/governance/guardrails/guardrail-production",
      "individual",
    )).toBe(true);
  });
});
