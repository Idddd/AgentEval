import { describe, expect, it } from "vitest";
import type { Agent, SandboxAuditEvent } from "@tasklattice/contracts";
import { adaptAgentToAuditorLogs, filterAuditorLogs } from "./auditor-log-utils";

const agent = {
  schemaVersion: 2,
  id: "2b0dc5a0-0d15-4b90-bc3f-71112b812efd",
  name: "audit-agent",
  description: "",
  runtime: "openshell",
  agentPlatform: "openclaw",
  modelDeploymentId: "deployment",
  systemPrompt: "",
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
  sandboxName: "tali-audit-agent",
  status: "READY",
  createdAt: "2026-07-19T01:00:00.000Z",
  updatedAt: "2026-07-19T01:02:00.000Z",
  logs: ["Sandbox starting.", "Runtime warning: retry requested."],
} satisfies Agent;

const audit = [{
  id: "audit-1",
  timestamp: "2026-07-19T01:03:00.000Z",
  source: "gateway",
  category: "network",
  severity: "HIGH",
  decision: "BLOCKED",
  summary: "Outbound request blocked",
  raw: "{}",
}] satisfies SandboxAuditEvent[];

describe("auditor log adapter", () => {
  it("maps lifecycle, provisioning, and audit data into ordered log lines", () => {
    const entries = adaptAgentToAuditorLogs(agent, audit);
    expect(entries.map((entry) => entry.timestamp)).toEqual([...entries.map((entry) => entry.timestamp)].sort());
    expect(entries.some((entry) => entry.message === "Instance is ready.")).toBe(true);
    expect(entries.find((entry) => entry.id === "audit-audit-1")).toMatchObject({ level: "error", source: "gateway", component: "Gateway" });
  });

  it("filters by time, level, source, component, and text", () => {
    const entries = adaptAgentToAuditorLogs(agent, audit);
    const result = filterAuditorLogs(entries, { level: "error", source: "gateway", component: "Gateway", search: "outbound", timeRange: "1h" }, Date.parse("2026-07-19T01:10:00.000Z"));
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("audit-audit-1");
  });
});
