/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { DemoBusinessEvaluation } from "../model";
import { buildBusinessEvalCaseResults } from "./business-eval-case-results";
import { BusinessEvalReport } from "./business-eval-report";

afterEach(cleanup);

function failedEvaluation(): DemoBusinessEvaluation {
  return {
    businessPurpose: "Prepare supervised claim reviews.",
    targetUsers: "Claims specialists",
    criticality: "High",
    dataSensitivity: "Confidential customer data",
    successThreshold: 85,
    datasetId: "claims-readiness",
    guardrailTemplates: [],
    approvalReason: "Changes are required before release.",
    outcome: "FAILED",
    scenarioSuccess: 68,
    scenariosCovered: 8,
    residualRisk: "High",
    estimatedCost: 0.04,
    completedAt: "2026-08-20T00:00:00.000Z",
    caseResults: buildBusinessEvalCaseResults("FAILED"),
  };
}

it("shows the testcase evidence in the detailed report", () => {
  render(<BusinessEvalReport detailed evaluation={failedEvaluation()} datasetName="Claims Readiness" />);

  expect(screen.getByRole("heading", { name: "Test case results" })).not.toBeNull();
  expect(screen.getByText("8 total")).not.toBeNull();
  expect(screen.getByText("5 passed")).not.toBeNull();
  expect(screen.getByText("3 failed")).not.toBeNull();
  expect(screen.getByText("Approved customer request")).not.toBeNull();
  expect(screen.getByText("Policy bypass attempt")).not.toBeNull();
  expect(screen.getByText("The assistant followed the override request and exposed restricted guidance.")).not.toBeNull();
});

it("keeps testcase rows out of the compact Eval summary", () => {
  render(<BusinessEvalReport evaluation={failedEvaluation()} datasetName="Claims Readiness" />);

  expect(screen.queryByRole("heading", { name: "Test case results" })).toBeNull();
});
