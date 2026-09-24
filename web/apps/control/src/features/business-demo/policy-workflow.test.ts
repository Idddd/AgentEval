import { expect, it } from "vitest";
import { blankDraft, advanceProcessing, restoreIntegratedEntities } from "./model";
import { saveBusinessPolicy, configurePolicy, policyStatus } from "./policy-workflow";
import { emptyConfig } from './evaluation';
const draft = { ...blankDraft, name: "PII requirements", text: "Protect customer data" };
it('creates a configuration version without reusing approval or evaluation and preserves linked versions', () => {
  const submitted = saveBusinessPolicy(draft, true, 'Admin', 'Admin', []);
  const started = configurePolicy([submitted],submitted.id,'start','Admin','Admin',{});
  const evaluated = advanceProcessing(configurePolicy(started,submitted.id,'complete','Admin','Admin',{Guard:'Original rule'}),Date.now()+10000);
  const ready = configurePolicy(evaluated,submitted.id,'approve','Admin','Admin',{});
  const config = {...emptyConfig(),content:'Updated rule',versionName:'v2'};
  const revised = configurePolicy(ready,submitted.id,'revise','Admin','Admin',{},'',config)[0]!;
  expect(revised.version).toBe(2);
  expect(revised.workflow?.config).toEqual(config);
  expect(revised.workflow?.stage).toBe('Configuring');
  expect(revised.workflow?.evaluation).toBeUndefined();
  expect(revised.workflow?.approval).toBeUndefined();
  expect(revised.revisions.find(r=>r.version===1)?.workflow?.config?.content).toBe('Original rule');
  expect(revised.revisions.find(r=>r.version===1)?.workflow?.approval?.by).toBe('Admin');
  expect(restoreIntegratedEntities(JSON.stringify({version:4,items:[revised]}))).toEqual([revised]);
  expect(ready[0]?.workflow?.stage).toBe('Ready');
  expect(() => configurePolicy(ready,submitted.id,'revise','User','ISS',{},'',config)).toThrow();
  expect(() => configurePolicy(ready,submitted.id,'revise','Agent Wizard','IT Admin',{},'',config,{name:'Changed',text:'Changed'})).toThrow();
  const userRevision = configurePolicy(ready,submitted.id,'revise','User','ISS',{},'',ready[0]!.workflow!.config,{name:'Updated requirement',text:'New business rule'})[0]!;
  expect(userRevision.name).toBe('Updated requirement');
  expect(userRevision.workflow?.config).toEqual(ready[0]!.workflow?.config);
  expect(userRevision.workflow?.stage).toBe('Awaiting Agent Wizard');
  expect(userRevision.workflow?.evaluation).toBeUndefined();
});
it("evaluates selected sources on one record and requires Admin approval", () => {
  const submitted = saveBusinessPolicy(draft, true, "ISS", "User", []);
  expect(submitted.workflow.stage).toBe("Awaiting Agent Wizard");
  expect(submitted.source).toBe('Guard');
  expect(submitted.workflow.sources).toEqual(['Guard']);
  expect(advanceProcessing([submitted], Date.now() + 10000)[0]?.workflow?.stage).toBe("Awaiting Agent Wizard");
  expect(() => configurePolicy([submitted], submitted.id, "start", "User", "ISS", {})).toThrow("Agent Wizard");
  const started = configurePolicy([submitted], submitted.id, "start", "Agent Wizard", "Admin", {});
  const done = configurePolicy(started, submitted.id, "complete", "Agent Wizard", "Admin", { Guard: "Reject PII input", F5: "Detect PII" });
  expect(done).toHaveLength(1);
  expect(done[0]?.workflow?.stage).toBe('Evaluating');
  expect(done[0]?.workflow?.evaluation?.results).toHaveLength(1);
  expect(() => configurePolicy(done, submitted.id, 'approve', 'Admin', 'Admin', {})).toThrow();
  const completed = advanceProcessing(done, Date.now() + 10000);
  expect(completed[0]?.workflow?.stage).toBe('Pending approve');
  expect(() => configurePolicy(completed, submitted.id, 'approve', 'Agent Wizard', 'Admin', {})).toThrow('Only Admin');
  const approved = configurePolicy(completed, submitted.id, 'approve', 'Admin', 'Admin', {});
  expect(approved[0]?.workflow?.stage).toBe('Ready');
  expect(approved[0]?.workflow?.approval?.by).toBe('Admin');
  expect(restoreIntegratedEntities(JSON.stringify({ version: 4, items: approved }))).toEqual(approved);
});
it("requires technical fields and supports a return and resubmit cycle", () => {
  const submitted = saveBusinessPolicy(draft, true, "ISS", "User", []);
  const started = configurePolicy([submitted], submitted.id, "start", "Agent Wizard", "Admin", {});
  expect(() => configurePolicy(started, submitted.id, "complete", "Agent Wizard", "Admin", {}, '', {scannerType:'custom',direction:'both',content:'',versionName:'v1',versionDescription:''})).toThrow("Enter detection content");
  expect(() => configurePolicy(started, submitted.id, "return", "Agent Wizard", "Admin", {})).toThrow("clarify");
  const returned = configurePolicy(started, submitted.id, "return", "Agent Wizard", "Admin", {}, "Specify personal data categories")[0]!;
  expect(returned.workflow?.stage).toBe("Submitted");
  const resubmitted = saveBusinessPolicy({ ...draft, text: "Protect names and email addresses" }, true, "ISS", "User", [returned], returned);
  expect(resubmitted.workflow.stage).toBe("Awaiting Agent Wizard");
  expect(saveBusinessPolicy(draft, true, "IT Admin", "Agent Wizard", []).workflow.stage).toBe("Awaiting Agent Wizard");
});

it("presents pending implementation to User and actionable input to Tech until ready", () => {
  const submitted = saveBusinessPolicy(draft, true, "ISS", "User", []);
  const started = configurePolicy([submitted], submitted.id, "start", "Agent Wizard", "Admin", {});
  for (const item of [submitted, started[0]!]) {
    expect(policyStatus(item, "User")).toBe("Submitted");
    expect(policyStatus(item, "Agent Wizard")).toBe("Submitted");
  }
  const returned = configurePolicy(started, submitted.id, "return", "Agent Wizard", "Admin", {}, "Clarify scope")[0]!;
  expect(policyStatus(returned, "User")).toBe("Submitted");
  const done = configurePolicy(started, submitted.id, "complete", "Agent Wizard", "Admin", { Guard: "Block PII" })[0]!;
  expect(policyStatus(done, "User")).toBe("Evaluating");
  expect(policyStatus(done, "Agent Wizard")).toBe("Evaluating");
});

it("allows Admin to create and configure without switching roles", () => {
 const item = saveBusinessPolicy(draft, true, "Admin", "Admin", []);
 const started = configurePolicy([item], item.id, "start", "Admin", "Admin", {});
 expect(started[0]?.workflow?.stage).toBe("Configuring");
 expect(policyStatus(item, "Admin")).toBe("Submitted");
 expect(saveBusinessPolicy(draft, false, "IT Admin", "Agent Wizard", []).workflow.stage).toBe("Draft");
});
