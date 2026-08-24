import { describe, expect, it } from "vitest";
import type { Agent } from "@tasklattice/contracts";
import { endpointStatus, formatUptime, getCapabilityCounts, getInstanceAccessState, getInstanceDisplayStatus, getTerminalAccessState, normalizeInstanceDetailTab, resolveAvailableInstanceDetailTab } from "./instance-detail-model";

const agent = {
  schemaVersion: 2,
  id: "2b0dc5a0-0d15-4b90-bc3f-71112b812efd",
  name: "research-agent",
  description: "",
  runtime: "openshell",
  agentPlatform: "openclaw",
  modelDeploymentId: "deployment",
  systemPrompt: "You are a research Agent.",
  policyId: "default",
  providerAccountId: "provider",
  providerName: "DeepSeek",
  model: "deepseek-chat",
  modelType: "llm",
  inferenceMode: "PLATFORM_MANAGED",
  accessPolicyIds: ["11111111-1111-4111-8111-111111111111"],
  modelRoutingId: "routing-a",
  modelRoutingBindingId: "binding-a",
  modelRoutingStatus: "READY",
  modelRoutingComplianceDomain: "GLOBAL",
  modelRoutingCapabilities: {
    automaticRouting: "ENABLED",
    routerType: "COMPLEXITY_ROUTER",
    complexityTierCount: 4,
    sessionAffinity: "ENABLED",
    adaptiveRouting: "DISABLED",
    failover: "ENABLED",
    generalFallback: "ENABLED",
    contextWindowFallback: "DISABLED",
    contentPolicyFallback: "DISABLED",
    retries: "ENABLED",
    requestAudit: "ENABLED",
  },
  modelRoutingKeyFingerprint: "sha256:123456789abc",
  costKeyAlias: "alias",
  sandboxName: "tali-research-agent",
  status: "READY",
  createdAt: "2026-07-18T08:00:00.000Z",
  updatedAt: "2026-07-18T08:05:00.000Z",
  logs: [],
  skillIds: ["one", "two"],
  mcpServerIds: ["mcp"],
  knowledgeSourceIds: [],
  httpEndpoint: { kind: "openclaw-webui", status: "READY", url: "https://agent.example" },
} satisfies Agent;

describe("instance detail model", () => {
  it("normalizes invalid tabs to overview", () => {
    expect(normalizeInstanceDetailTab("capabilities")).toBe("capabilities");
    expect(normalizeInstanceDetailTab("auditor-log")).toBe("auditor-log");
    expect(normalizeInstanceDetailTab("activity")).toBe("auditor-log");
    expect(normalizeInstanceDetailTab("terminal")).toBe("terminal");
    expect(normalizeInstanceDetailTab("runtime")).toBe("overview");
    expect(normalizeInstanceDetailTab("unknown")).toBe("overview");
  });

  it("maps backend lifecycle states", () => {
    expect(getInstanceDisplayStatus("PROVISIONING")).toBe("creating");
    expect(getInstanceDisplayStatus("READY")).toBe("ready");
    expect(getInstanceDisplayStatus("FAILED")).toBe("failed");
  });

  it("enables access only when the endpoint and terminal target are ready", () => {
    const targets = [{ id: "agent", containerName: "agent", primary: true, available: true, shells: [] }];
    const access = getInstanceAccessState(agent, targets);
    expect(access.webUI).toMatchObject({ enabled: true, url: "https://agent.example" });
    expect(access.terminal.enabled).toBe(true);
    expect(getInstanceAccessState({ ...agent, status: "PROVISIONING" }, undefined).webUI.enabled).toBe(false);
  });

  it("maps unavailable Agent states and permissions to disabled Terminal reasons", () => {
    expect(getTerminalAccessState({ ...agent, status: "PROVISIONING" })).toMatchObject({ enabled: false, disabledReason: "Terminal is unavailable while the agent is starting." });
    expect(getTerminalAccessState({ ...agent, status: "FAILED" })).toMatchObject({ enabled: false, disabledReason: "Terminal is unavailable because the agent is unhealthy." });
    expect(getTerminalAccessState({ ...agent, status: "DESTROYING" })).toMatchObject({ enabled: false, disabledReason: "Terminal is unavailable while the agent is stopping." });
    expect(getTerminalAccessState(agent, undefined, { canExecAgent: false })).toMatchObject({ enabled: false, disabledReason: "You do not have permission to open this terminal." });
  });

  it("uses the Agent terminal target reason without exposing Runtime details", () => {
    expect(getTerminalAccessState(agent, [{ id: "agent", containerName: "agent", primary: true, available: false, reason: "Terminal access is disabled for this Agent.", shells: [] }])).toEqual({ enabled: false, disabledReason: "Terminal access is disabled for this Agent." });
  });

  it("does not keep Terminal enabled from stale targets after preflight fails", () => {
    const targets = [{ id: "agent", containerName: "agent", primary: true, available: true, shells: [] }];
    expect(getTerminalAccessState(agent, targets, { unavailableReason: "Terminal target check failed." })).toEqual({ enabled: false, disabledReason: "Terminal target check failed." });
  });

  it("prevents a direct Terminal URL from bypassing availability", () => {
    expect(resolveAvailableInstanceDetailTab("terminal", { enabled: false, disabledReason: "Unavailable" })).toBe("overview");
    expect(resolveAvailableInstanceDetailTab("terminal", { enabled: true })).toBe("terminal");
  });

  it("formats uptime and capability counts from real fields", () => {
    expect(formatUptime(agent, Date.parse("2026-07-18T10:05:00.000Z"))).toBe("2h 5m");
    expect(getCapabilityCounts(agent)).toEqual({ skills: 2, mcpServers: 1, knowledgeBases: 0 });
    expect(endpointStatus(agent)).toBe("available");
  });
});
