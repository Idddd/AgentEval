import { describe, expect, it } from "vitest";
import { importConfigurationJson, parseConfigurationJson } from "./configuration-import";
import { seed, transition } from "./model";

const guardrail = {
  kind: "Guardrail", id: "gr-json-example", name: "JSON Guardrail",
  description: "Block disclosure of account identifiers.",
  policies: ["Do not reveal account identifiers."],
  config: { scannerType: "keyword", direction: "both", content: "account number", versionName: "v1", versionDescription: "Imported configuration" },
};
const profile = {
  kind: "Profile", id: "pf-json-example", name: "JSON Profile",
  description: "Protect customer conversations.", refs: [guardrail.id, "default-pii-response"],
  threshold: 7.5, thresholdMetric: "Block Rate", thresholdWindow: 5,
};

describe("NMGR configuration JSON import", () => {
  it.each(["NeMo", "F5"])("retains the selected %s provider when importing", (provider) => {
    expect(parseConfigurationJson(JSON.stringify([{ ...guardrail, provider }]), seed())[0]?.provider).toBe(provider);
  });
  it.each(["Line 1.5", "Line 2"])("accepts the fixed %s Control Unit", (unit) => {
    expect(parseConfigurationJson(JSON.stringify([{ ...guardrail, unit }]), seed())[0]?.unit).toBe(unit);
  });
  it("imports linked configurations together as drafts without activating or overwriting existing data", () => {
    const state = seed();
    const before = structuredClone(state);
    const next = importConfigurationJson(state, JSON.stringify([profile, { ...guardrail, status: "DEPLOYED", deployed: 9, runs: [{ passed: true }] }]));
    expect(state).toEqual(before);
    expect(next.entities.slice(2)).toEqual(state.entities);
    expect(next.entities.slice(0, 2).map((e) => e.id)).toEqual([profile.id, guardrail.id]);
    const importedGuard = next.entities[1]!;
    expect(importedGuard).toMatchObject({ status: "DRAFT", version: 1, deployed: null, runs: [], unit: "ISS", config: guardrail.config });
    expect(next.entities[0]).toMatchObject({ status: "DRAFT", refs: profile.refs, threshold: 7.5, thresholdMetric: "Block Rate", thresholdWindow: 5 });
    expect(next.audit.slice(0, 2).map((a) => a.entity)).toEqual([profile.id, guardrail.id]);
    expect(next.audit.slice(2)).toEqual(state.audit);
    const requested = transition(next, profile.id, "request", "User");
    expect(() => transition(requested, profile.id, "approve", "User Admin")).toThrow("deployed Guardrail");
  });

  it("accepts entity envelopes and separate Guardrail/Profile arrays", () => {
    expect(parseConfigurationJson(JSON.stringify({ entities: [guardrail] }), seed())[0]?.id).toBe(guardrail.id);
    const { kind: _kind, ...guard } = guardrail;
    expect(parseConfigurationJson(JSON.stringify({ guardrails: [guard], profiles: [] }), seed())[0]?.kind).toBe("Guardrail");
  });

  it.each([
    ["malformed JSON", "{broken"],
    ["empty import", "[]"],
    ["duplicate IDs in the file", JSON.stringify([guardrail, guardrail])],
    ["existing IDs", JSON.stringify([{ ...guardrail, id: "default-pii-response" }])],
    ["unknown reference", JSON.stringify([{ ...profile, refs: ["missing-guardrail"] }])],
    ["invalid threshold", JSON.stringify([{ ...profile, threshold: 101 }])],
    ["invalid regex", JSON.stringify([{ ...guardrail, config: { ...guardrail.config, scannerType: "regex", content: "[" } }])],
    ["missing business requirement", JSON.stringify([{ ...guardrail, description: "" }])],
    ["missing mandatory binding", JSON.stringify([{ ...profile, refs: [guardrail.id] }, guardrail])],
  ])("rejects %s without partially changing the workspace", (_reason, text) => {
    const state = seed();
    if (_reason === "missing mandatory binding")
      state.entities.find((item) => item.id === "default-pii-response")!.mandatory = true;
    const before = structuredClone(state);
    expect(() => importConfigurationJson(state, text)).toThrow();
    expect(state).toEqual(before);
  });

  it("checks the latest workspace again when confirming a preview", () => {
    const text = JSON.stringify([guardrail]);
    const state = seed();
    expect(parseConfigurationJson(text, state)).toHaveLength(1);
    const updated = importConfigurationJson(state, text);
    expect(() => importConfigurationJson(updated, text)).toThrow("already exists");
  });
});
