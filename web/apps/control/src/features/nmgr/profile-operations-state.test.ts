import { expect, it } from "vitest";
import { seed, type State } from "./model";
import { operatingProfile, operatingModeLabel, changeOperatingMode, operatingAction, appendOperatingTraffic } from "./profile-operations-state";
import { guardrailMode, stageEvents, profileStages } from "../business-demo/profile-runtime";

const fixture = () => {
  const state = seed();
  const profile = state.entities.find((item) => item.kind === "Profile")!;
  return { state, id: profile.id, guardrail: profile.deployedRefs[0]! };
};
it("keeps mode changes pending until the approver approves the same Profile configuration", () => {
  const { state, id, guardrail } = fixture(), now = Date.now();
  const before = operatingProfile(state.entities.find((item) => item.id === id)!, state, now);
  let next = changeOperatingMode(state, id, guardrail, "monitoring", "User", now);
  expect(guardrailMode(operatingProfile(next.entities.find((item) => item.id === id)!, next, now), guardrail)).toBe(guardrailMode(before, guardrail));
  next = operatingAction(next, id, "request", "User", now);
  expect(() => operatingAction(next, id, "approve", "User", now)).toThrow(/Approver/);
  next = operatingAction(next, id, "approve", "User Admin", now + 10);
  expect(guardrailMode(operatingProfile(next.entities.find((item) => item.id === id)!, next, now), guardrail)).toBe("monitoring");
  expect(next.entities.find((item) => item.id === id)?.runtime?.approval).toBe("approved");
  expect(next.entities.find((item) => item.id === id)?.status).toBe(state.entities.find((item) => item.id === id)?.status);
});
it("bypasses without new traces, retains history and resumes in Monitoring", () => {
  const { state, id, guardrail } = fixture(), now = Date.now();
  let next = appendOperatingTraffic(state, id, "risk", now);
  const previous = next.entities.find((item) => item.id === id)!.runtime!.events;
  next = operatingAction(next, id, "bypass", "User", now + 5);
  const bypassed = appendOperatingTraffic(next, id, "safe", now + 10000);
  expect(bypassed.entities.find((item) => item.id === id)!.runtime!.events).toEqual(previous);
  next = operatingAction(bypassed, id, "resume", "User", now + 20000);
  const profile = operatingProfile(next.entities.find((item) => item.id === id)!, next, now);
  expect(guardrailMode(profile, guardrail)).toBe("monitoring");
  expect(profile.runtime?.approval).toBe("off");
  expect(operatingModeLabel(profile)).toBe("Monitoring");
  expect(profile.runtime?.events.length).toBeGreaterThan(0);
});
it("records a detected risk without blocking in Monitoring and blocks after Preventing approval", () => {
  const { state, id, guardrail } = fixture(), now = Date.now();
  let next = operatingAction(operatingAction(state, id, "bypass", "User", now), id, "resume", "User", now + 1);
  next = appendOperatingTraffic(next, id, "risk", now + 10000);
  let profile = operatingProfile(next.entities.find((item) => item.id === id)!, next, now);
  expect(stageEvents(profile, profileStages(profile)[0]!).some((event) => event.decision === "would_block" && !event.enforced)).toBe(true);
  next = changeOperatingMode(next, id, guardrail, "active", "User", now + 20000);
  next = operatingAction(next, id, "request", "User", now + 20001);
  next = operatingAction(next, id, "approve", "User Admin", now + 20002);
  next = appendOperatingTraffic(next, id, "risk", now + 30000);
  profile = operatingProfile(next.entities.find((item) => item.id === id)!, next, now);
  expect(stageEvents(profile, profileStages(profile)[0]!).some((event) => event.decision === "block" && event.enforced)).toBe(true);
});
it("rejects approval when a linked Guardrail version changes and preserves saved provider bindings", () => {
  const { state, id, guardrail } = fixture(), now = Date.now();
  let next = changeOperatingMode(state, id, guardrail, "monitoring", "User", now);
  next = operatingAction(next, id, "request", "User", now);
  next = { ...next, entities: next.entities.map((item) => item.id === guardrail ? { ...item, deployed: 2 } : item) };
  expect(() => operatingAction(next, id, "approve", "User Admin", now + 1)).toThrow(/Configuration changed/);
  expect(operatingProfile(next.entities.find((item) => item.id === id)!, next, now).policies[0]?.version).toBe(2);
});
it("prevents out-of-scope mutations and bounds retained traffic", () => {
  const { state, id, guardrail } = fixture(), now = Date.now();
  const outside: State = { ...state, entities: state.entities.map((item) => item.id === id ? { ...item, unit: "Line 2" } : item) };
  expect(() => changeOperatingMode(outside, id, guardrail, "monitoring", "User", now)).toThrow(/scope/);
  expect(() => changeOperatingMode(state, id, guardrail, "monitoring", "IT Admin", now)).toThrow(/User/);
  let next = state;
  for (let index = 0; index < 110; index++) next = appendOperatingTraffic(next, id, "safe", now + index * 5000);
  expect(next.entities.find((item) => item.id === id)!.runtime!.events.length).toBeLessThanOrEqual(220);
  expect(next.entities.find((item) => item.id === id)!.runtime!.rollups?.length).toBeGreaterThan(0);
});
it("does not initialize traffic in other Profiles when one Profile receives traffic", () => {
  const { state, id } = fixture();
  const other = state.entities.find((item) => item.kind === "Profile" && item.id !== id)!;
  other.unit = "RMG";
  const before = structuredClone(other);
  const next = appendOperatingTraffic(state, id, "safe", Date.now());
  expect(next.entities.find((item) => item.id === other.id)).toEqual(before);
});
