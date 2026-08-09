import { describe, expect, it, vi } from "vitest";
import type {
  Agent,
  CreateAgentGardenEntryInput,
} from "@tasklattice/contracts";
import { createTestStore } from "../test/store";
import type { SecretStore } from "../secrets/secret-store";
import type { AgentDiscoveryClient } from "./agent-discovery";
import { AgentGardenService } from "./agent-garden-service";
import { AgentGardenStore } from "./agent-garden-store";

function coordinator(id = "coordinator-a"): Agent {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id,
    name: "Hermes Coordinator",
    description: "",
    runtime: "openshell",
    agentPlatform: "hermes",
    modelDeploymentId: "model-a",
    providerAccountId: "provider-a",
    providerName: "LiteLLM",
    model: "production-chat",
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
    costKeyAlias: `tali-${id}`,
    sandboxName: `tali-${id}`,
    status: "READY",
    policyId: "restricted",
    systemPrompt: "Coordinate work and report the resulting evidence.",
    createdAt: now,
    updatedAt: now,
    logs: [],
  };
}

const githubAgentInput: CreateAgentGardenEntryInput = {
  name: "GitHub Operations",
  description: "Handles repository triage and pull request review tasks.",
  integrationType: "a2a",
  endpoint: "https://agents.example.com/github",
  category: "Developer Tools",
  owner: "Developer Experience",
  tags: ["GitHub", "Automation"],
  usageMode: "CALLABLE",
  authType: "none",
  authReference: "",
  internalNetworkOnly: false,
  configuration: {},
};

describe("AgentGardenService", () => {
  it("keeps interactive runtimes out of the delegatable Agent set", async () => {
    const projectStore = createTestStore();
    const service = new AgentGardenService(
      new AgentGardenStore(projectStore.projectId, projectStore.database()),
      projectStore,
    );

    const snapshot = await service.snapshot();
    const openClaw = snapshot.agents.find(
      (agent) => agent.integrationType === "openclaw",
    );
    const claudeCode = snapshot.agents.find(
      (agent) => agent.integrationType === "claude-code",
    );

    expect(openClaw?.usageCapabilities).toEqual({
      interactive: true,
      canDelegate: true,
      acceptsDelegation: false,
    });
    expect(claudeCode).toMatchObject({
      source: "BUILT_IN",
      status: "COMING_SOON",
      usageCapabilities: { acceptsDelegation: false },
    });
    expect(
      snapshot.agents.filter((agent) => agent.integrationType === "a2a"),
    ).toHaveLength(15);
    expect(
      snapshot.agents.filter((agent) => agent.integrationType === "langgraph"),
    ).toHaveLength(1);
    expect(
      snapshot.agents.some(
        (agent) => agent.id === "openclaw-incident-investigator",
      ),
    ).toBe(false);
    expect(
      snapshot.agents.filter(
        (agent) => agent.configuration.catalogKind === "EXAMPLE_BLUEPRINT",
      ),
    ).toHaveLength(12);
    await expect(
      service.store.getAgent("adk-customer-service"),
    ).resolves.toMatchObject({
      name: "Customer Service",
      source: "BUILT_IN",
      platformLabel: "ADK",
    });

    await service.snapshot();
    await expect(service.store.listAgents()).resolves.toHaveLength(16);
  });

  it("connects a callable built-in demo without duplicating its card", async () => {
    const projectStore = createTestStore();
    await projectStore.save(coordinator());
    const service = new AgentGardenService(
      new AgentGardenStore(projectStore.projectId, projectStore.database()),
      projectStore,
    );

    const connection = await service.connect({
      coordinatorInstanceId: "coordinator-a",
      connectedAgentId: "a2a-github-daily-triage",
      allowedSkillIds: ["daily-repository-triage"],
      approvalMode: "AUTO_READ_ONLY",
    });
    expect(connection.connectedAgentId).toBe("a2a-github-daily-triage");

    const snapshot = await service.snapshot();
    expect(
      snapshot.agents.filter((agent) => agent.id === "a2a-github-daily-triage"),
    ).toHaveLength(1);
    await expect(service.remove("a2a-github-daily-triage")).rejects.toThrow(
      "managed by TaskLattice",
    );
  });

  it("connects a database-seeded example blueprint", async () => {
    const projectStore = createTestStore();
    await projectStore.save(coordinator());
    const service = new AgentGardenService(
      new AgentGardenStore(projectStore.projectId, projectStore.database()),
      projectStore,
    );

    const connection = await service.connect({
      coordinatorInstanceId: "coordinator-a",
      connectedAgentId: "adk-customer-service",
      allowedSkillIds: ["recommend-customer-resolution"],
      approvalMode: "ALWAYS_ASK",
    });

    expect(connection).toMatchObject({
      connectedAgentId: "adk-customer-service",
      allowedSkillIds: ["recommend-customer-resolution"],
      approvalMode: "ALWAYS_ASK",
    });
    await expect(
      service.store.getAgent("adk-customer-service"),
    ).resolves.toMatchObject({
      configuration: {
        catalogKind: "EXAMPLE_BLUEPRINT",
      },
    });
  });

  it("registers, discovers, connects, and disconnects an A2A Agent", async () => {
    const projectStore = createTestStore();
    await projectStore.save(coordinator());
    const discovery: AgentDiscoveryClient = {
      discover: vi.fn(async (agent) => ({
        endpoint: agent.endpoint!,
        agentCardUrl: "https://agents.example.com/.well-known/agent-card.json",
        skills: [
          {
            id: "daily-repository-triage",
            name: "Daily repository triage",
            description: "Reviews the current day of repository activity.",
            tags: ["GitHub"],
          },
        ],
      })),
    };
    const secrets: SecretStore = {
      put: vi.fn(async () => "memory://test/secret"),
      get: vi.fn(async () => "secret"),
      delete: vi.fn(async () => undefined),
    };
    const service = new AgentGardenService(
      new AgentGardenStore(projectStore.projectId, projectStore.database()),
      projectStore,
      discovery,
      secrets,
    );

    const agent = await service.register(githubAgentInput);
    expect(agent).toMatchObject({
      source: "PROJECT_REGISTERED",
      status: "READY",
      usageCapabilities: {
        interactive: false,
        canDelegate: false,
        acceptsDelegation: true,
      },
    });
    expect(agent.skills.map((skill) => skill.id)).toEqual([
      "daily-repository-triage",
    ]);

    const connection = await service.connect({
      coordinatorInstanceId: "coordinator-a",
      connectedAgentId: agent.id,
      allowedSkillIds: ["daily-repository-triage"],
      approvalMode: "AUTO_READ_ONLY",
    });
    expect(connection.connectedAgentId).toBe(agent.id);
    await expect(service.remove(agent.id)).rejects.toThrow(
      "Disconnect it before removal",
    );

    expect(await service.disconnect(connection.id)).toBe(true);
    expect(await service.remove(agent.id)).toBe(true);
  });

  it("rejects an interactive-only registered Agent connection", async () => {
    const projectStore = createTestStore();
    await projectStore.save(coordinator());
    const discovery: AgentDiscoveryClient = {
      discover: vi.fn(async (agent) => ({
        endpoint: agent.endpoint!,
        agentCardUrl: null,
        skills: [],
      })),
    };
    const service = new AgentGardenService(
      new AgentGardenStore(projectStore.projectId, projectStore.database()),
      projectStore,
      discovery,
    );
    const interactive = await service.register({
      ...githubAgentInput,
      name: "Interactive repository workbench",
      usageMode: "INTERACTIVE",
    });

    await expect(
      service.connect({
        coordinatorInstanceId: "coordinator-a",
        connectedAgentId: interactive.id,
        allowedSkillIds: [],
        approvalMode: "ALWAYS_ASK",
      }),
    ).rejects.toThrow("does not accept delegated tasks");
  });
});
