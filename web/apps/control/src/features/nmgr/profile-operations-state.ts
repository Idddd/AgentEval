import { deployedEntity, type State, type Entity, type Role } from "./model";
import { initializeProfileRuntime, setGuardrailMode, transitionProfile, trafficEvents, profileStages, stageEvents, type GuardrailMode, type ProfileAction } from "../business-demo/profile-runtime";
import type { Entity as OperatingProfile } from "../business-demo/model";
import { compactTraces, assertStorageCapacity } from "../business-demo/trace-retention";

export function operatingProfile(profile: Entity, state: State, now: number): OperatingProfile {
  const active = deployedEntity(profile);
  const guards = profile.deployedRefs.map((id) => state.entities.find((item) => item.id === id && item.kind === "Guardrail" && item.deployed !== null)).filter((guard): guard is Entity => !!guard).map(deployedEntity);
  const preventing = profile.runtime?.modes ? Object.values(profile.runtime.modes).includes("active")
    : profile.runtime ? (profile.runtime.stages?.[0]?.mode ?? (profile.runtime.approval === "approved" ? "active" : "monitoring")) !== "monitoring"
    : profile.mode !== "Pass all";
  let adapted: OperatingProfile = {
    id: profile.id, kind: "guardrails", name: active.name, text: active.description, useCase: active.description,
    busu: active.attributes.bu, location: active.location, agentType: active.attributes.agent, dataType: active.attributes.data,
    owner: active.unit, status: preventing ? "Active" : "Ready", version: profile.deployed ?? profile.version,
    createdAt: Date.parse(profile.deployedAt ?? profile.updated), updatedAt: Date.parse(profile.updated), revisions: [],
    policies: guards.map((guard) => ({ policyId: guard.id, name: guard.name, text: guard.description, version: guard.deployed ?? guard.version,
      workflow: { businessId: guard.id, stage: "Ready", configs: { provider: guard.provider ?? "NeMo" }, ...(guard.config ? { config: guard.config } : {}) },
    })),
    ...(profile.runtime ? { runtime: profile.runtime } : {}),
  };
  adapted = initializeProfileRuntime(adapted, now);
  if (adapted.runtime && !adapted.runtime.modes) adapted = { ...adapted, runtime: { ...adapted.runtime,
    modes: Object.fromEntries(guards.map((guard) => [guard.id, preventing ? "active" as const : "monitoring" as const])),
  } };
  if (!profile.runtime && profile.mode === "Pass all" && adapted.runtime) adapted = { ...adapted, runtime: { ...adapted.runtime, bypass: true } };
  return adapted;
}

function target(state: State, id: string, role?: Role): Entity {
  const profile = state.entities.find((item) => item.id === id && item.kind === "Profile" && item.deployed !== null);
  if (!profile) throw new Error("Select a deployed Profile.");
  if (role && role !== "IT Admin" && profile.unit !== "ISS") throw new Error("Profile is outside the current Control Unit scope.");
  return profile;
}
function savedOperation(state: State, profile: Entity, next: OperatingProfile, now: number, actor: string, action: string): State {
  if (!next.runtime) throw new Error("Operating configuration is unavailable.");
  return { ...state,
    entities: state.entities.map((item) => item.id === profile.id ? { ...item, runtime: next.runtime!, mode: next.runtime!.bypass ? "Pass all" : "Normal", updated: new Date(now).toISOString() } : item),
    audit: [{ id: crypto.randomUUID(), time: new Date(now).toISOString(), entity: profile.id, actor, action }, ...state.audit],
  };
}
export function changeOperatingMode(state: State, id: string, guardrail: string, mode: GuardrailMode, role: Role, now: number): State {
  if (role !== "User") throw new Error("Only Control Unit User can change operating modes.");
  const profile = target(state, id, role);
  return savedOperation(state, profile, setGuardrailMode(operatingProfile(profile, state, now), guardrail, mode), now, role, "operating mode drafted");
}
export function operatingAction(state: State, id: string, action: ProfileAction, role: Role, now: number): State {
  if (["approve", "reject"].includes(action) ? role !== "User Admin" : role !== "User") throw new Error(["approve", "reject"].includes(action) ? "Only Control Unit Approver can approve or reject operating modes." : "Only Control Unit User can manage Profile operation.");
  const profile = target(state, id, role);
  return savedOperation(state, profile, transitionProfile(operatingProfile(profile, state, now), action, role === "User Admin" ? "Admin" : role, now), now, role, `operating ${action}`);
}
export function appendOperatingTraffic(state: State, id: string, scenario: "safe" | "risk" | "error", now: number): State {
  const profile = target(state, id);
  const adapted = operatingProfile(profile, state, now);
  if (adapted.runtime?.bypass) return state;
  const next = { ...adapted, runtime: { ...adapted.runtime!, events: [...trafficEvents(adapted, now, scenario, crypto.randomUUID()), ...(adapted.runtime?.events ?? [])] } };
  const profiles = state.entities.filter((item) => item.kind === "Profile" && item.deployed !== null && (item.id === id || item.runtime)).map((item) => item.id === id ? next : operatingProfile(item, state, now));
  const retained = compactTraces(profiles, now);
  assertStorageCapacity(retained);
  const runtimes = new Map(retained.map((item) => [item.id, item.runtime!]));
  return { ...state, entities: state.entities.map((item) => runtimes.has(item.id) ? { ...item, runtime: runtimes.get(item.id)! } : item) };
}
export function operatingScans(profile: Entity, state: State, now: number, initialTime = now) {
  const adapted = operatingProfile(profile, state, initialTime);
  return stageEvents(adapted, profileStages(adapted)[0]!).filter((event) => event.completedAt <= now).map((event) => ({
    id: event.id, profile: profile.id, guardrail: event.guardrailId, result: event.decision === "error" ? "Error" : event.decision === "block" ? "Blocked" : event.decision === "would_block" ? "Detected" : "Passed",
    latency: event.durationMs, time: new Date(event.receivedAt).toISOString(), version: Number(event.version), input: event.scannedContent ?? "Content submitted to the scanner.", message: event.message,
  }));
}
export function operatingModeLabel(profile: OperatingProfile) {
  if (profile.runtime?.bypass) return "Bypass";
  const mode = profileStages(profile)[0]!.mode;
  return mode === "active" ? "Preventing" : mode === "mixed" ? "Mixed" : "Monitoring";
}
