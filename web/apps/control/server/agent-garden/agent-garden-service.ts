import { randomUUID } from "node:crypto";
import {
  agentConnectionSchema,
  agentGardenEntrySchema,
  createAgentConnectionSchema,
  createAgentGardenEntrySchema,
  type AgentConnection,
  type AgentGardenEntry,
  type AgentGardenSnapshot,
  type CreateAgentConnectionInput,
  type CreateAgentGardenEntryInput,
} from "@tasklattice/contracts";
import { ProjectStore } from "../projects/project-store";
import {
  createSecretStore,
  type SecretStore,
} from "../secrets/secret-store";
import {
  HttpAgentDiscoveryClient,
  type AgentDiscoveryClient,
} from "./agent-discovery";
import { AgentGardenStore } from "./agent-garden-store";
import { builtInAgentCatalog } from "./built-in-agent-catalog";
import { databaseAgentCatalog } from "./database-agent-catalog";

const integrationLabels: Record<
  CreateAgentGardenEntryInput["integrationType"],
  string
> = {
  a2a: "A2A Standard",
  langgraph: "LangGraph",
  langflow: "LangFlow",
  "bedrock-agentcore": "Bedrock AgentCore",
  "azure-ai-foundry": "Azure AI Foundry",
  "pydantic-ai": "Pydantic AI",
  "vertex-ai-agent-engine": "Vertex AI Agent Engine",
  "watsonx-orchestrate": "watsonx Orchestrate",
  custom: "Custom / Other",
};

function resourceId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "") || "agent";
  return `${slug}-${randomUUID().slice(0, 8)}`;
}

function safeError(error: unknown): string {
  return (
    error instanceof Error ? error.message : String(error)
  ).slice(0, 4_000);
}

function usageCapabilities(
  mode: CreateAgentGardenEntryInput["usageMode"],
): AgentGardenEntry["usageCapabilities"] {
  return {
    interactive: mode !== "CALLABLE",
    canDelegate: false,
    acceptsDelegation: mode !== "INTERACTIVE",
  };
}

export class AgentGardenService {
  constructor(
    readonly store = new AgentGardenStore(),
    readonly projects = new ProjectStore(
      store.projectId,
      store.database(),
    ),
    readonly discovery: AgentDiscoveryClient = new HttpAgentDiscoveryClient(),
    readonly secrets: SecretStore = createSecretStore(),
  ) {}

  async snapshot(): Promise<AgentGardenSnapshot> {
    const [, connections] = await Promise.all([
      this.store.ensureAgents(databaseAgentCatalog),
      this.store.listConnections(),
    ]);
    const persistedAgents = await this.store.listAgents();
    const builtInIds = new Set(
      builtInAgentCatalog.map((agent) => agent.id),
    );
    const databaseIds = new Set(
      databaseAgentCatalog.map((agent) => agent.id),
    );
    const persistedById = new Map(
      persistedAgents.map((agent) => [agent.id, agent]),
    );
    return {
      agents: [
        ...builtInAgentCatalog,
        ...databaseAgentCatalog.map(
          (agent) => persistedById.get(agent.id) ?? agent,
        ),
        ...persistedAgents.filter(
          (agent) =>
            !builtInIds.has(agent.id) &&
            !databaseIds.has(agent.id),
        ),
      ],
      connections,
    };
  }

  async register(
    rawInput: CreateAgentGardenEntryInput,
  ): Promise<AgentGardenEntry> {
    const input = createAgentGardenEntrySchema.parse(rawInput);
    const now = new Date().toISOString();
    const agent = agentGardenEntrySchema.parse({
      id: resourceId(input.name),
      name: input.name,
      description: input.description,
      source: "PROJECT_REGISTERED",
      integrationType: input.integrationType,
      platformLabel: integrationLabels[input.integrationType],
      category: input.category,
      owner: input.owner,
      tags: input.tags,
      status: "UNCHECKED",
      usageMode: input.usageMode,
      usageCapabilities: usageCapabilities(input.usageMode),
      endpoint: input.endpoint,
      agentCardUrl: input.agentCardUrl ?? null,
      authType: input.authType,
      authReference: input.authReference,
      internalNetworkOnly: input.internalNetworkOnly,
      configuration: input.configuration,
      skills: [],
      specializationId: null,
      createdAt: now,
      updatedAt: now,
      lastDiscoveredAt: null,
      lastDiscoveryError: null,
    });
    await this.store.saveAgent(agent);
    return this.discover(agent.id);
  }

  async discover(id: string): Promise<AgentGardenEntry> {
    const current = await this.requireProjectRegisteredAgent(id);
    const checking = await this.store.saveAgent({
      ...current,
      status: "UNCHECKED",
      updatedAt: new Date().toISOString(),
      lastDiscoveryError: null,
    });
    try {
      const credential = checking.authReference
        ? await this.secrets.get(checking.authReference)
        : undefined;
      const result = await this.discovery.discover(checking, credential);
      return this.store.saveAgent({
        ...checking,
        endpoint: result.endpoint,
        agentCardUrl: result.agentCardUrl,
        skills: result.skills,
        status: "READY",
        updatedAt: new Date().toISOString(),
        lastDiscoveredAt: new Date().toISOString(),
        lastDiscoveryError: null,
      });
    } catch (error) {
      return this.store.saveAgent({
        ...checking,
        status: "UNAVAILABLE",
        updatedAt: new Date().toISOString(),
        lastDiscoveryError: safeError(error),
      });
    }
  }

  async remove(id: string): Promise<boolean> {
    await this.requireProjectRegisteredAgent(id);
    if (await this.store.countConnectionsForAgent(id)) {
      throw new Error(
        "This Agent is connected to a Coordinator. Disconnect it before removal.",
      );
    }
    return this.store.deleteAgent(id);
  }

  async connect(
    rawInput: CreateAgentConnectionInput,
  ): Promise<AgentConnection> {
    const input = createAgentConnectionSchema.parse(rawInput);
    const [coordinator, connectedAgent] = await Promise.all([
      this.projects.get(input.coordinatorInstanceId),
      this.requireConnectableAgent(input.connectedAgentId),
    ]);
    if (!coordinator) throw new Error("Coordinator Instance was not found.");
    if (!["openclaw", "hermes"].includes(coordinator.agentPlatform)) {
      throw new Error(
        "This Instance runtime cannot delegate tasks to connected Agents.",
      );
    }
    if (!connectedAgent.usageCapabilities.acceptsDelegation) {
      throw new Error("This Agent does not accept delegated tasks.");
    }
    if (connectedAgent.status !== "READY") {
      throw new Error("Only a READY Agent can be connected to a Coordinator.");
    }
    const knownSkills = new Set(
      connectedAgent.skills.map((skill) => skill.id),
    );
    const unknownSkills = input.allowedSkillIds.filter(
      (skillId) => !knownSkills.has(skillId),
    );
    if (unknownSkills.length) {
      throw new Error(
        `Agent skills were not discovered: ${unknownSkills.join(", ")}.`,
      );
    }
    const existing = await this.store.findConnection(
      input.coordinatorInstanceId,
      input.connectedAgentId,
    );
    if (existing) throw new Error("This Agent is already connected.");
    const now = new Date().toISOString();
    return this.store.saveConnection(
      agentConnectionSchema.parse({
        id: randomUUID(),
        ...input,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  async disconnect(id: string): Promise<boolean> {
    return this.store.deleteConnection(id);
  }

  private async requireProjectRegisteredAgent(
    id: string,
  ): Promise<AgentGardenEntry> {
    const agent = await this.store.getAgent(id);
    if (!agent) throw new Error("Registered Agent was not found.");
    if (agent.source !== "PROJECT_REGISTERED") {
      throw new Error("Built-in Agents are managed by TaskLattice.");
    }
    return agent;
  }

  private async requireConnectableAgent(
    id: string,
  ): Promise<AgentGardenEntry> {
    const builtIn = builtInAgentCatalog.find((agent) => agent.id === id);
    if (builtIn) {
      if (!builtIn.usageCapabilities.acceptsDelegation) {
        return builtIn;
      }
      return this.store.saveAgent(builtIn);
    }
    const agent = await this.store.getAgent(id);
    if (agent) return agent;
    const seeded = databaseAgentCatalog.find(
      (candidate) => candidate.id === id,
    );
    if (seeded) return this.store.saveAgent(seeded);
    throw new Error("Registered Agent was not found.");
  }
}
