import { expect, it } from "vitest";
import { blankDraft, advanceProcessing, restoreIntegratedEntities } from "./model";
import { saveBusinessPolicy, configurePolicy, policyStatus } from "./policy-workflow";
const draft = { ...blankDraft, name: "PII requirements", text: "Protect customer data" };
it("waits for a technical user and completes two independent source policies", () => {
  const submitted = saveBusinessPolicy(draft, true, "ISS", "User", []);
  expect(submitted.workflow.stage).toBe("Awaiting Agent Wizard");
  expect(submitted.source).toBeUndefined();
  expect(advanceProcessing([submitted], Date.now() + 10000)[0]?.workflow?.stage).toBe("Awaiting Agent Wizard");
  expect(() => configurePolicy([submitted], submitted.id, "start", "User", "ISS", {})).toThrow("Agent Wizard");
  const started = configurePolicy([submitted], submitted.id, "start", "Agent Wizard", "Admin", {});
  const done = configurePolicy(started, submitted.id, "complete", "Agent Wizard", "Admin", { Guard: "Reject PII input", F5: "Detect PII" });
  expect(done).toHaveLength(2); expect(new Set(done.map((p) => p.source)).size).toBe(2);
  expect(done.every((p) => p.status === "Ready" && p.workflow?.stage === "Ready")).toBe(true);
  expect(restoreIntegratedEntities(JSON.stringify({ version: 3, items: done }))).toEqual(done);
});
it("requires technical fields and supports a return and resubmit cycle", () => {
  const submitted = saveBusinessPolicy(draft, true, "ISS", "User", []);
  const started = configurePolicy([submitted], submitted.id, "start", "Agent Wizard", "Admin", {});
  expect(() => configurePolicy(started, submitted.id, "complete", "Agent Wizard", "Admin", {})).toThrow("technical configuration");
  expect(() => configurePolicy(started, submitted.id, "return", "Agent Wizard", "Admin", {})).toThrow("clarify");
  const returned = configurePolicy(started, submitted.id, "return", "Agent Wizard", "Admin", {}, "Specify personal data categories")[0]!;
  expect(returned.workflow?.stage).toBe("Needs input");
  const resubmitted = saveBusinessPolicy({ ...draft, text: "Protect names and email addresses" }, true, "ISS", "User", [returned], returned);
  expect(resubmitted.workflow.stage).toBe("Awaiting Agent Wizard");
  expect(saveBusinessPolicy(draft, true, "IT Admin", "Agent Wizard", []).workflow.stage).toBe("Awaiting Agent Wizard");
});

it("presents pending implementation to User and actionable input to Tech until ready", () => {
  const submitted = saveBusinessPolicy(draft, true, "ISS", "User", []);
  const started = configurePolicy([submitted], submitted.id, "start", "Agent Wizard", "Admin", {});
  for (const item of [submitted, started[0]!]) {
    expect(policyStatus(item, "User")).toBe("Pending implement");
    expect(policyStatus(item, "Agent Wizard")).toBe("Needs input");
  }
  const returned = configurePolicy(started, submitted.id, "return", "Agent Wizard", "Admin", {}, "Clarify scope")[0]!;
  expect(policyStatus(returned, "User")).toBe("Pending implement");
  const done = configurePolicy(started, submitted.id, "complete", "Agent Wizard", "Admin", { Guard: "Block PII" })[0]!;
  expect(policyStatus(done, "User")).toBe("Ready");
  expect(policyStatus(done, "Agent Wizard")).toBe("Ready");
});

it("allows Admin to create and configure without switching roles", () => {
 const item = saveBusinessPolicy(draft, true, "Admin", "Admin", []);
 const started = configurePolicy([item], item.id, "start", "Admin", "Admin", {});
 expect(started[0]?.workflow?.stage).toBe("Configuring");
 expect(policyStatus(item, "Admin")).toBe("Needs input");
 expect(saveBusinessPolicy(draft, false, "IT Admin", "Agent Wizard", []).workflow.stage).toBe("Draft");
});
