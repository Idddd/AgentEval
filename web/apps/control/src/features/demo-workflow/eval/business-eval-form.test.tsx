/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { BusinessEvalForm } from "./business-eval-form";

it("shows the exact pinned Guardrail Policy coverage before Admin Eval", () => {
  render(<BusinessEvalForm value={{ datasetId: "dataset", selectedTemplateIds: ["release"] }} datasets={[{
    id: "dataset",
    demoSessionId: "session",
    projectId: "admin",
    source: "FIXTURE",
    createdByPersona: "admin",
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    name: "Service readiness",
    description: "",
    scenarioCount: 8,
  }]} templates={[{
    id: "release",
    name: "Production Safety",
    description: "Production policy coverage",
    version: "3",
    applicableTargetKinds: ["agent"],
    cases: [],
    defaultFor: ["agent"],
    sourcePolicies: [
      { id: "prompt", version: "1", name: "Prompt Injection Protection", description: "", ruleCount: 1, testCaseCount: 1 },
      { id: "pii", version: "2", name: "Sensitive Data Protection", description: "", ruleCount: 2, testCaseCount: 3 },
    ],
    runtimePosture: { safetyLevel: "strict", outputDelivery: "full_buffered" },
  }]} />);

  expect(screen.getByText("2 pinned Policies · 4 Policy tests")).not.toBeNull();
  expect(screen.getByText("Prompt Injection Protection · v1")).not.toBeNull();
  expect(screen.getByText("Sensitive Data Protection · v2")).not.toBeNull();
  expect(screen.getByText("strict · full buffered")).not.toBeNull();
});
