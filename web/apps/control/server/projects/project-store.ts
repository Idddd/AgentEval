import { createHash } from "node:crypto";
import type {
  Agent,
  AgentSpecializationDefinition,
  ResourceKind,
  KnowledgeSourceDefinition,
  InferenceGateway,
  ModelRouting,
  ModelRoutingAuditEvent,
  ModelRoutingBinding,
  McpServerDefinition,
  McpToolDefinition,
  ModelDeployment,
  ProviderAccount,
  SandboxPolicy,
  SkillDefinition,
} from "@tasklattice/contracts";
import { prisma } from "../db/prisma";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { CostAnalyticsStore } from "../providers/cost-analytics-store";

type ResourceDelegateName =
  | "skillRecord"
  | "mcpServerRecord"
  | "knowledgeSourceRecord"
  | "agentSpecializationRecord";

function costKeyIdentifier(value: string): string {
  return value.startsWith("sha256:")
    ? value
    : `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function decode<T>(payload: Prisma.JsonValue): T {
  return payload as T;
}

function decodeSkillDefinition(payload: unknown): SkillDefinition {
  const {
    bindings: _legacyBindings,
    ...skill
  } = payload as unknown as SkillDefinition & { bindings?: number };
  return skill;
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function agentPayload(agent: Agent): Prisma.InputJsonValue {
  const { accessPolicyIds: _accessPolicyIds, ...payload } = agent;
  return jsonInput(payload);
}

function mcpConnectionPayload(server: McpServerDefinition): Prisma.InputJsonValue {
  const {
    id: _id,
    litellmServerId: _litellmServerId,
    status: _status,
    tools: _tools,
    lastDiscoveryAttemptAt: _lastDiscoveryAttemptAt,
    lastDiscoveredAt: _lastDiscoveredAt,
    lastDiscoveryError: _lastDiscoveryError,
    ...connection
  } = server;
  return jsonInput(connection);
}

export function parseAgent(
  payload: string | Prisma.JsonValue,
  accessPolicyIds: string[] = [],
): Agent {
  const agent = (typeof payload === "string" ? JSON.parse(payload) : payload) as Partial<Agent>;
  if (
    agent.schemaVersion !== 2 ||
    typeof agent.id !== "string" ||
    typeof agent.name !== "string" ||
    typeof agent.sandboxName !== "string" ||
    typeof agent.model !== "string" ||
    typeof agent.systemPrompt !== "string" ||
    typeof agent.createdAt !== "string" ||
    typeof agent.updatedAt !== "string" ||
    !Array.isArray(agent.logs) ||
    agent.inferenceMode !== "PLATFORM_MANAGED" ||
    typeof agent.modelRoutingId !== "string" ||
    typeof agent.modelRoutingBindingId !== "string" ||
    typeof agent.modelRoutingKeyFingerprint !== "string" ||
    !agent.modelRoutingCapabilities ||
    !agent.modelRoutingComplianceDomain ||
    !agent.modelRoutingStatus
  ) throw new Error("Stored Instance data is incomplete.");
  return { ...agent, accessPolicyIds } as Agent;
}

function parseCurrentAgent(
  payload: Prisma.JsonValue,
  accessPolicyIds: string[],
): Agent | undefined {
  const candidate = payload as Partial<Agent>;
  return candidate.schemaVersion === 2 ? parseAgent(payload, accessPolicyIds) : undefined;
}

function parseProviderAccount(payload: Prisma.JsonValue): ProviderAccount {
  return decode<ProviderAccount>(payload);
}

function parseModelDeployment(payload: Prisma.JsonValue): ModelDeployment {
  return decode<ModelDeployment>(payload);
}

function canonicalModelRouting(routing: ModelRouting): ModelRouting {
  return {
    ...routing,
    publicModelAlias: `tali-routing-${routing.id}`,
  };
}

function parseModelRouting(payload: Prisma.JsonValue): ModelRouting {
  return canonicalModelRouting(decode<ModelRouting>(payload));
}

export class ProjectStore {
  private readonly costs: CostAnalyticsStore;
  readonly projectId: string;
  private readonly db: PrismaClient;

  constructor(
    projectId = "individual",
    db?: PrismaClient,
  ) {
    this.projectId = projectId;
    this.db = db ?? prisma();
    this.costs = new CostAnalyticsStore(this.db, this.projectId);
  }

  costAnalytics(): CostAnalyticsStore {
    return this.costs;
  }

  database(): PrismaClient {
    return this.db;
  }

  private resourceDelegate(name: ResourceDelegateName): {
    upsert(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<{ payload: Prisma.JsonValue } | null>;
    findMany(args: unknown): Promise<Array<{ payload: Prisma.JsonValue }>>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  } {
    return this.db[name] as never;
  }

  private async saveResourceRecord<T extends { id: string }>(
    delegateName: ResourceDelegateName,
    record: T,
  ): Promise<T> {
    await this.resourceDelegate(delegateName).upsert({
      where: { projectId_id: { projectId: this.projectId, id: record.id } },
      create: {
        projectId: this.projectId,
        id: record.id,
        payload: jsonInput(record),
      },
      update: { payload: jsonInput(record) },
    });
    return record;
  }

  private async getResourceRecord<T>(
    delegateName: ResourceDelegateName,
    id: string,
  ): Promise<T | undefined> {
    const row = await this.resourceDelegate(delegateName).findUnique({
      where: { projectId_id: { projectId: this.projectId, id } },
      select: { payload: true },
    });
    return row ? decode<T>(row.payload) : undefined;
  }

  private async listResourceRecords<T>(delegateName: ResourceDelegateName): Promise<T[]> {
    const rows = await this.resourceDelegate(delegateName).findMany({
      where: { projectId: this.projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { payload: true },
    });
    return rows.map((row) => decode<T>(row.payload));
  }

  private async deleteResourceRecord(delegateName: ResourceDelegateName, id: string): Promise<boolean> {
    const result = await this.resourceDelegate(delegateName).deleteMany({
      where: { projectId: this.projectId, id },
    });
    return result.count > 0;
  }

  saveSkillDefinition(skill: SkillDefinition): Promise<SkillDefinition> {
    return this.saveResourceRecord("skillRecord", skill);
  }
  getSkillDefinition(id: string): Promise<SkillDefinition | undefined> {
    return this.getResourceRecord<SkillDefinition & { bindings?: number }>("skillRecord", id)
      .then((skill) => skill ? decodeSkillDefinition(skill) : undefined);
  }
  async listSkillDefinitions(): Promise<SkillDefinition[]> {
    return (await this.listResourceRecords<SkillDefinition & { bindings?: number }>("skillRecord"))
      .map(decodeSkillDefinition);
  }
  deleteSkillDefinition(id: string): Promise<boolean> {
    return this.deleteResourceRecord("skillRecord", id);
  }
  getSkillArtifact(skillId: string, version: string) {
    return this.db.skillArtifactRecord.findUnique({
      where: { skillId_version: { skillId, version } },
    });
  }
  async saveMcpServerDefinition(server: McpServerDefinition): Promise<McpServerDefinition> {
    await this.db.mcpServerRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: server.id } },
      create: {
        projectId: this.projectId,
        id: server.id,
        litellmServerId: server.litellmServerId,
        payload: mcpConnectionPayload(server),
        discoveryStatus: server.status,
        lastDiscoveryAttemptAt: server.lastDiscoveryAttemptAt,
        lastDiscoveredAt: server.lastDiscoveredAt,
        lastDiscoveryError: server.lastDiscoveryError,
      },
      update: {
        litellmServerId: server.litellmServerId,
        payload: mcpConnectionPayload(server),
        discoveryStatus: server.status,
        lastDiscoveryAttemptAt: server.lastDiscoveryAttemptAt,
        lastDiscoveredAt: server.lastDiscoveredAt,
        lastDiscoveryError: server.lastDiscoveryError,
      },
    });
    return server;
  }
  async getMcpServerDefinition(id: string): Promise<McpServerDefinition | undefined> {
    const row = await this.db.mcpServerRecord.findUnique({
      where: { projectId_id: { projectId: this.projectId, id } },
      include: { tools: { orderBy: { name: "asc" } } },
    });
    return row ? this.decodeMcpServer(row) : undefined;
  }
  async listMcpServerDefinitions(): Promise<McpServerDefinition[]> {
    const rows = await this.db.mcpServerRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      include: { tools: { orderBy: { name: "asc" } } },
    });
    return rows.map((row) => this.decodeMcpServer(row));
  }
  async saveMcpDiscovery(
    id: string,
    result: {
      status: McpServerDefinition["status"];
      attemptedAt: string;
      discoveredAt?: string;
      error?: string;
      tools?: McpToolDefinition[];
    },
  ): Promise<McpServerDefinition> {
    const attemptedAt = new Date(result.attemptedAt);
    await this.db.$transaction(async (transaction) => {
      await transaction.mcpServerRecord.update({
        where: { projectId_id: { projectId: this.projectId, id } },
        data: {
          discoveryStatus: result.status,
          lastDiscoveryAttemptAt: attemptedAt,
          ...(result.discoveredAt ? { lastDiscoveredAt: new Date(result.discoveredAt) } : {}),
          lastDiscoveryError: result.error ?? null,
        },
      });
      if (result.tools) {
        await transaction.mcpToolRecord.deleteMany({
          where: { projectId: this.projectId, mcpServerId: id },
        });
        if (result.tools.length) {
          await transaction.mcpToolRecord.createMany({
            data: result.tools.map((tool) => ({
              projectId: this.projectId,
              mcpServerId: id,
              name: tool.name,
              title: tool.title ?? null,
              description: tool.description ?? null,
              inputSchema: jsonInput(tool.inputSchema),
              ...(tool.outputSchema ? { outputSchema: jsonInput(tool.outputSchema) } : {}),
              ...(tool.annotations ? { annotations: jsonInput(tool.annotations) } : {}),
              discoveredAt: new Date(tool.discoveredAt),
            })),
          });
        }
      }
    });
    const server = await this.getMcpServerDefinition(id);
    if (!server) throw new Error("MCP server was not found.");
    return server;
  }
  deleteMcpServerDefinition(id: string): Promise<boolean> {
    return this.deleteResourceRecord("mcpServerRecord", id);
  }
  saveKnowledgeSourceDefinition(source: KnowledgeSourceDefinition): Promise<KnowledgeSourceDefinition> {
    return this.saveResourceRecord("knowledgeSourceRecord", source);
  }
  getKnowledgeSourceDefinition(id: string): Promise<KnowledgeSourceDefinition | undefined> {
    return this.getResourceRecord("knowledgeSourceRecord", id);
  }
  listKnowledgeSourceDefinitions(): Promise<KnowledgeSourceDefinition[]> {
    return this.listResourceRecords("knowledgeSourceRecord");
  }
  deleteKnowledgeSourceDefinition(id: string): Promise<boolean> {
    return this.deleteResourceRecord("knowledgeSourceRecord", id);
  }
  listAgentSpecializations(): Promise<AgentSpecializationDefinition[]> {
    return this.listResourceRecords("agentSpecializationRecord");
  }

  private decodeMcpServer(row: {
    id: string;
    litellmServerId: string;
    payload: Prisma.JsonValue;
    discoveryStatus: McpServerDefinition["status"];
    lastDiscoveryAttemptAt: Date | null;
    lastDiscoveredAt: Date | null;
    lastDiscoveryError: string | null;
    tools: Array<{
      name: string;
      title: string | null;
      description: string | null;
      inputSchema: Prisma.JsonValue;
      outputSchema: Prisma.JsonValue | null;
      annotations: Prisma.JsonValue | null;
      discoveredAt: Date;
    }>;
  }): McpServerDefinition {
    const connection = decode<Omit<McpServerDefinition, "id" | "litellmServerId" | "status" | "tools" | "lastDiscoveryAttemptAt" | "lastDiscoveredAt" | "lastDiscoveryError">>(row.payload);
    return {
      id: row.id,
      litellmServerId: row.litellmServerId,
      ...connection,
      status: row.discoveryStatus,
      tools: row.tools.map((tool) => ({
        name: tool.name,
        ...(tool.title ? { title: tool.title } : {}),
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema: decode<Record<string, unknown>>(tool.inputSchema),
        ...(tool.outputSchema ? { outputSchema: decode<Record<string, unknown>>(tool.outputSchema) } : {}),
        ...(tool.annotations ? { annotations: decode<McpToolDefinition["annotations"]>(tool.annotations) } : {}),
        discoveredAt: tool.discoveredAt.toISOString(),
      })),
      lastDiscoveryAttemptAt: row.lastDiscoveryAttemptAt?.toISOString() ?? null,
      lastDiscoveredAt: row.lastDiscoveredAt?.toISOString() ?? null,
      lastDiscoveryError: row.lastDiscoveryError,
    };
  }

  async isResourceInUse(kind: ResourceKind, id: string): Promise<boolean> {
    const agentField = kind === "skills" ? "skillIds" : kind === "mcp-servers" ? "mcpServerIds" : "knowledgeSourceIds";
    if ((await this.list()).some((agent) => (agent[agentField] ?? []).includes(id))) return true;
    const specializationField = kind === "skills" ? "defaultSkillIds" : kind === "mcp-servers" ? "defaultMcpServerIds" : "defaultKnowledgeSourceIds";
    return (await this.listAgentSpecializations())
      .some((specialization) => specialization[specializationField].includes(id));
  }

  async save(agent: Agent): Promise<Agent> {
    await this.db.agentRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: agent.id } },
      create: {
        projectId: this.projectId,
        id: agent.id,
        payload: agentPayload(agent),
        createdAt: agent.createdAt,
      },
      update: { payload: agentPayload(agent) },
    });
    const binding = await this.getModelRoutingBindingForAgent(agent.id);
    if (binding) await this.saveBindingAttribution(binding, agent);
    return agent;
  }

  async get(id: string): Promise<Agent | undefined> {
    const row = await this.db.agentRecord.findUnique({
      where: { projectId_id: { projectId: this.projectId, id } },
      select: {
        payload: true,
        accessPolicyBindings: {
          orderBy: { accessPolicyId: "asc" },
          select: { accessPolicyId: true },
        },
      },
    });
    return row
      ? parseCurrentAgent(
          row.payload,
          row.accessPolicyBindings.map((binding) => binding.accessPolicyId),
        )
      : undefined;
  }

  async list(): Promise<Agent[]> {
    const rows = await this.db.agentRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: { createdAt: "desc" },
      select: {
        payload: true,
        accessPolicyBindings: {
          orderBy: { accessPolicyId: "asc" },
          select: { accessPolicyId: true },
        },
      },
    });
    return rows.flatMap((row) => {
      const agent = parseCurrentAgent(
        row.payload,
        row.accessPolicyBindings.map((binding) => binding.accessPolicyId),
      );
      return agent ? [agent] : [];
    });
  }

  async replaceAgentAccessPolicies(
    instanceId: string,
    accessPolicyIds: readonly string[],
    boundBy = "agent-service",
  ): Promise<Agent> {
    const uniquePolicyIds = [...new Set(accessPolicyIds)];
    if (
      uniquePolicyIds.length !== accessPolicyIds.length ||
      uniquePolicyIds.length < 1 ||
      uniquePolicyIds.length > 64
    ) throw new Error("Select between 1 and 64 unique Access Policies.");

    return this.db.$transaction(async (transaction) => {
      const instance = await transaction.agentRecord.findUnique({
        where: { projectId_id: { projectId: this.projectId, id: instanceId } },
        select: { id: true },
      });
      if (!instance) throw new Error("Agent Instance not found.");

      const policies = await transaction.accessPolicyRecord.findMany({
        where: { projectId: this.projectId, id: { in: uniquePolicyIds } },
        select: { id: true },
      });
      const available = new Set(policies.map((policy) => policy.id));
      const missing = uniquePolicyIds.filter((id) => !available.has(id));
      if (missing.length) {
        throw new Error(`Access Policy not found: ${missing.join(", ")}.`);
      }

      await transaction.agentInstanceAccessPolicyBindingRecord.deleteMany({
        where: { projectId: this.projectId, instanceId },
      });
      await transaction.agentInstanceAccessPolicyBindingRecord.createMany({
        data: uniquePolicyIds.map((accessPolicyId) => ({
          projectId: this.projectId,
          instanceId,
          accessPolicyId,
          boundBy,
        })),
      });

      const updated = await transaction.agentRecord.findUniqueOrThrow({
        where: { projectId_id: { projectId: this.projectId, id: instanceId } },
        select: {
          payload: true,
          accessPolicyBindings: {
            orderBy: { accessPolicyId: "asc" },
            select: { accessPolicyId: true },
          },
        },
      });
      return parseAgent(
        updated.payload,
        updated.accessPolicyBindings.map((binding) => binding.accessPolicyId),
      );
    });
  }

  async listAgentsForReporting(): Promise<Array<Pick<Agent, "id" | "name" | "sandboxName" | "costKeyAlias" | "modelRoutingKeyFingerprint">>> {
    return (await this.list()).map((agent) => ({
      id: agent.id,
      name: agent.name,
      sandboxName: agent.sandboxName,
      costKeyAlias: agent.costKeyAlias ?? `tali-${agent.name}`,
      modelRoutingKeyFingerprint: agent.modelRoutingKeyFingerprint,
    }));
  }

  async delete(id: string): Promise<void> {
    await this.db.agentRecord.deleteMany({ where: { projectId: this.projectId, id } });
  }

  async saveProviderAccount(account: ProviderAccount, credentialPayload?: string): Promise<ProviderAccount> {
    const credential = credentialPayload ?? await this.getProviderAccountCredential(account.id);
    if (!credential) throw new Error("An API credential is required for a new Provider Account.");
    await this.db.providerAccountRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: account.id } },
      create: {
        projectId: this.projectId,
        id: account.id,
        payload: jsonInput(account),
        credentialPayload: credential,
        createdAt: account.createdAt,
      },
      update: {
        payload: jsonInput(account),
        credentialPayload: credential,
      },
    });
    return account;
  }

  async getProviderAccount(id: string): Promise<ProviderAccount | undefined> {
    const row = await this.db.providerAccountRecord.findUnique({
      where: { projectId_id: { projectId: this.projectId, id } },
      select: { payload: true },
    });
    return row ? parseProviderAccount(row.payload) : undefined;
  }
  async listProviderAccounts(): Promise<ProviderAccount[]> {
    const rows = await this.db.providerAccountRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => parseProviderAccount(row.payload));
  }
  async getProviderAccountCredential(id: string): Promise<string | undefined> {
    const row = await this.db.providerAccountRecord.findUnique({
      where: { projectId_id: { projectId: this.projectId, id } },
      select: { credentialPayload: true },
    });
    return row?.credentialPayload;
  }

  async saveModelDeployment(deployment: ModelDeployment): Promise<ModelDeployment> {
    await this.db.modelDeploymentRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: deployment.id } },
      create: {
        projectId: this.projectId,
        id: deployment.id,
        providerAccountId: deployment.providerAccountId,
        payload: jsonInput(deployment),
        createdAt: deployment.createdAt,
      },
      update: { payload: jsonInput(deployment) },
    });
    const account = await this.getProviderAccount(deployment.providerAccountId);
    await this.costs.saveModelEndpointMapping({
      id: `deployment:${deployment.id}:${deployment.createdAt}`,
      modelEndpointId: deployment.id,
      modelEndpointName: deployment.displayName,
      liteLLMModelName: deployment.litellmModelName,
      liteLLMModelGroup: deployment.litellmModelName,
      liteLLMModelId: deployment.modelId,
      provider: deployment.providerName,
      providerAccountId: deployment.providerAccountId,
      providerAccountName: account?.name ?? deployment.providerAccountId,
      validFrom: deployment.createdAt,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
    });
    return deployment;
  }

  async getModelDeployment(id: string): Promise<ModelDeployment | undefined> {
    const row = await this.db.modelDeploymentRecord.findUnique({
      where: { projectId_id: { projectId: this.projectId, id } },
      select: { payload: true },
    });
    return row ? parseModelDeployment(row.payload) : undefined;
  }
  async listModelDeployments(providerAccountId?: string): Promise<ModelDeployment[]> {
    return this.listModelDeploymentsForReporting(providerAccountId);
  }
  async listModelDeploymentsForReporting(providerAccountId?: string): Promise<ModelDeployment[]> {
    const rows = await this.db.modelDeploymentRecord.findMany({
      where: {
        projectId: this.projectId,
        ...(providerAccountId ? { providerAccountId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => parseModelDeployment(row.payload));
  }
  async deleteModelDeployment(id: string): Promise<boolean> {
    const result = await this.db.modelDeploymentRecord.deleteMany({
      where: { projectId: this.projectId, id },
    });
    return result.count > 0;
  }
  async listAgentIdsUsingModelDeployments(ids: readonly string[]): Promise<string[]> {
    if (!ids.length) return [];
    const idSet = new Set(ids);
    return (await this.list()).flatMap((agent) =>
      agent.modelDeploymentId && idSet.has(agent.modelDeploymentId) ? [agent.id] : [],
    );
  }
  async deleteProviderAccount(id: string): Promise<boolean> {
    const result = await this.db.providerAccountRecord.deleteMany({
      where: { projectId: this.projectId, id },
    });
    return result.count > 0;
  }

  async saveInferenceGateway(gateway: InferenceGateway): Promise<InferenceGateway> {
    await this.db.inferenceGatewayRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: gateway.id } },
      create: {
        projectId: this.projectId,
        id: gateway.id,
        payload: jsonInput(gateway),
        createdAt: gateway.createdAt,
      },
      update: { payload: jsonInput(gateway) },
    });
    return gateway;
  }
  async getInferenceGateway(id: string): Promise<InferenceGateway | undefined> {
    const row = await this.db.inferenceGatewayRecord.findUnique({
      where: { projectId_id: { projectId: this.projectId, id } },
      select: { payload: true },
    });
    return row ? decode<InferenceGateway>(row.payload) : undefined;
  }
  async listInferenceGateways(): Promise<InferenceGateway[]> {
    const rows = await this.db.inferenceGatewayRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { payload: true },
    });
    return rows.map((row) => decode<InferenceGateway>(row.payload));
  }

  async saveModelRouting(routing: ModelRouting): Promise<ModelRouting> {
    const canonicalRouting = canonicalModelRouting(routing);
    await this.db.modelRoutingRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: canonicalRouting.id } },
      create: {
        projectId: this.projectId,
        id: canonicalRouting.id,
        payload: jsonInput(canonicalRouting),
        createdAt: canonicalRouting.createdAt,
      },
      update: { payload: jsonInput(canonicalRouting) },
    });
    await this.saveModelRoutingAttribution(canonicalRouting);
    return canonicalRouting;
  }
  async saveDefaultModelRouting(routing: ModelRouting): Promise<ModelRouting> {
    const canonicalRouting = canonicalModelRouting(routing);
    const existing = await this.listModelRoutings();
    const now = canonicalRouting.updatedAt;
    const routings = existing.map((candidate) =>
      candidate.id === canonicalRouting.id
        ? { ...canonicalRouting, isDefault: true }
        : candidate.isDefault
          ? { ...candidate, isDefault: false, updatedAt: now }
          : candidate,
    );
    if (!routings.some((candidate) => candidate.id === canonicalRouting.id))
      throw new Error("Routing not found.");
    await this.db.$transaction(
      routings.map((candidate) =>
        this.db.modelRoutingRecord.upsert({
          where: {
            projectId_id: {
              projectId: this.projectId,
              id: candidate.id,
            },
          },
          create: {
            projectId: this.projectId,
            id: candidate.id,
            payload: jsonInput(candidate),
            createdAt: candidate.createdAt,
          },
          update: { payload: jsonInput(candidate) },
        }),
      ),
    );
    await this.saveModelRoutingAttribution(canonicalRouting);
    return { ...canonicalRouting, isDefault: true };
  }
  private async saveModelRoutingAttribution(
    routing: ModelRouting,
  ): Promise<void> {
    const gateway = await this.getInferenceGateway(routing.gatewayId);
    await this.costs.saveModelEndpointMapping({
      id: `model-routing:${routing.id}:${routing.createdAt}`,
      modelEndpointId: `model-routing:${routing.id}`,
      modelEndpointName: routing.name,
      liteLLMModelName: routing.publicModelAlias,
      liteLLMModelGroup: routing.publicModelAlias,
      provider: "LiteLLM",
      providerAccountId: routing.gatewayId,
      providerAccountName: gateway?.name ?? routing.gatewayId,
      validFrom: routing.createdAt,
      createdAt: routing.createdAt,
      updatedAt: routing.updatedAt,
    });
  }
  async getModelRouting(id: string): Promise<ModelRouting | undefined> {
    const row = await this.db.modelRoutingRecord.findUnique({
      where: { projectId_id: { projectId: this.projectId, id } },
      select: { payload: true },
    });
    return row ? parseModelRouting(row.payload) : undefined;
  }
  async listModelRoutings(): Promise<ModelRouting[]> {
    const rows = await this.db.modelRoutingRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => parseModelRouting(row.payload));
  }
  async deleteModelRouting(id: string): Promise<boolean> {
    const result = await this.db.modelRoutingRecord.deleteMany({
      where: { projectId: this.projectId, id },
    });
    return result.count > 0;
  }

  async saveModelRoutingBinding(binding: ModelRoutingBinding): Promise<ModelRoutingBinding> {
    const previous = await this.getModelRoutingBindingForAgent(binding.agentId);
    if (previous && previous.id !== binding.id && !previous.revokedAt) {
      const previousAgent = await this.get(previous.agentId);
      await this.saveBindingAttribution(
        { ...previous, revokedAt: binding.createdAt },
        previousAgent,
      );
    }
    await this.db.modelRoutingBindingRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: binding.id } },
      create: {
        projectId: this.projectId,
        id: binding.id,
        modelRoutingId: binding.modelRoutingId,
        agentId: binding.agentId,
        payload: jsonInput(binding),
        createdAt: binding.createdAt,
      },
      update: { payload: jsonInput(binding) },
    });
    await this.saveBindingAttribution(binding, await this.get(binding.agentId));
    return binding;
  }
  private async saveBindingAttribution(binding: ModelRoutingBinding, agent?: Agent): Promise<void> {
    const routing = await this.getModelRouting(binding.modelRoutingId);
    await this.costs.saveAttribution({
      id: `binding:${binding.id}`,
      projectId: this.projectId,
      environmentId: "production",
      instanceId: binding.agentId,
      instanceName: agent?.name ?? binding.agentId,
      liteLLMVirtualKeyId: costKeyIdentifier(binding.liteLLMTokenId),
      hashedToken: binding.keyFingerprint,
      virtualKeyAlias: binding.keyAlias,
      liteLLMUserId: binding.agentId,
      ...(binding.liteLLMTeamId ? { liteLLMTeamId: binding.liteLLMTeamId } : {}),
      ...(routing?.gatewayId ? { providerAccountId: routing.gatewayId } : {}),
      validFrom: binding.createdAt,
      ...(binding.revokedAt ? { validTo: binding.revokedAt } : {}),
      createdAt: binding.createdAt,
      updatedAt: binding.revokedAt ?? agent?.updatedAt ?? binding.createdAt,
    });
  }
  async getModelRoutingBindingForAgent(agentId: string): Promise<ModelRoutingBinding | undefined> {
    const row = await this.db.modelRoutingBindingRecord.findFirst({
      where: { projectId: this.projectId, agentId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return row ? decode<ModelRoutingBinding>(row.payload) : undefined;
  }
  async listModelRoutingBindings(modelRoutingId: string): Promise<ModelRoutingBinding[]> {
    const rows = await this.db.modelRoutingBindingRecord.findMany({
      where: { projectId: this.projectId, modelRoutingId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => decode<ModelRoutingBinding>(row.payload));
  }
  async appendModelRoutingAudit(event: ModelRoutingAuditEvent): Promise<ModelRoutingAuditEvent> {
    await this.db.modelRoutingAuditRecord.create({
      data: {
        projectId: this.projectId,
        eventId: event.eventId,
        modelRoutingId: event.modelRoutingId,
        payload: jsonInput(event),
        createdAt: event.timestamp,
      },
    });
    return event;
  }
  async listModelRoutingAudit(modelRoutingId: string): Promise<ModelRoutingAuditEvent[]> {
    const rows = await this.db.modelRoutingAuditRecord.findMany({
      where: { projectId: this.projectId, modelRoutingId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => decode<ModelRoutingAuditEvent>(row.payload));
  }

  async saveSandboxPolicy(policy: SandboxPolicy): Promise<SandboxPolicy> {
    const createdAt = policy.createdAt ?? new Date().toISOString();
    await this.db.sandboxPolicyRecord.upsert({
      where: { projectId_id: { projectId: this.projectId, id: policy.id } },
      create: {
        projectId: this.projectId,
        id: policy.id,
        payload: jsonInput(policy),
        createdAt,
      },
      update: { payload: jsonInput(policy) },
    });
    return policy;
  }
  async listSandboxPolicies(): Promise<SandboxPolicy[]> {
    const rows = await this.db.sandboxPolicyRecord.findMany({
      where: { projectId: this.projectId },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    return rows.map((row) => decode<SandboxPolicy>(row.payload));
  }
  async deleteSandboxPolicy(id: string): Promise<void> {
    await this.db.sandboxPolicyRecord.deleteMany({ where: { projectId: this.projectId, id } });
  }
  async isSandboxPolicyInUse(id: string): Promise<boolean> {
    return (await this.list()).some((agent) => agent.policyId === id);
  }
}
