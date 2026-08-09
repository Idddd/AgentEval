import { createHash, randomUUID } from "node:crypto";
import type {
  CreateKnowledgeSourceDefinitionInput,
  CreateMcpServerDefinitionInput,
  CreateSkillDefinitionInput,
  ResourceCatalog,
  ResourceKind,
  KnowledgeSourceDefinition,
  McpServerDefinition,
  SkillDefinition,
  UpdateKnowledgeSourceDefinitionInput,
  UpdateMcpServerDefinitionInput,
  UpdateSkillDefinitionInput,
} from "@tasklattice/contracts";
import {
  LiteLLMClient,
  type LiteLLMAdminClient,
  type LiteLLMMcpServerInput,
  type LiteLLMVectorStoreInput,
} from "../providers/litellm-client";
import { ProjectStore } from "../projects/project-store";
import { ProjectQuotaService } from "../quotas/project-quota-service";
import { createSecretStore, type SecretStore } from "../secrets/secret-store";
import { mcpServerTemplates } from "./mcp-server-templates";
import {
  vectorStoreBridgeApiBase,
  vectorStoreBridgeApiKey,
} from "./vector-store-bridge-auth";

function resourceId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "") || "resource";
  return `${slug}-${randomUUID().slice(0, 8)}`;
}

function liteLLMServerId(projectId: string, resourceId: string): string {
  const projectHash = createHash("sha256").update(projectId).digest("hex").slice(0, 10);
  return `tali_${projectHash}_${resourceId.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 80)}`;
}

export class ResourceCatalogService {
  constructor(
    readonly store = new ProjectStore(),
    readonly quotas = new ProjectQuotaService(store),
    readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
    readonly secrets: SecretStore = createSecretStore(),
  ) {}

  async catalog(): Promise<ResourceCatalog> {
    return {
      skills: await this.store.listSkillDefinitions(),
      mcpServers: await this.store.listMcpServerDefinitions(),
      mcpServerTemplates,
      knowledgeSources: await this.store.listKnowledgeSourceDefinitions(),
      specializations: await this.store.listAgentSpecializations(),
    };
  }

  async createSkill(input: CreateSkillDefinitionInput): Promise<SkillDefinition> {
    return this.store.saveSkillDefinition({
      id: resourceId(input.name),
      ...input,
      updatedAt: new Date().toISOString(),
    });
  }

  async updateSkill(id: string, input: UpdateSkillDefinitionInput): Promise<SkillDefinition> {
    const current = await this.store.getSkillDefinition(id);
    if (!current) throw new Error("Skill was not found.");
    return this.store.saveSkillDefinition({
      ...current,
      ...input,
      id,
      updatedAt: new Date().toISOString(),
    });
  }

  async verifySkillArtifact(id: string): Promise<SkillDefinition> {
    const skill = await this.store.getSkillDefinition(id);
    if (!skill) throw new Error("Skill was not found.");
    const artifact = await this.store.getSkillArtifact(skill.id, skill.version);
    if (!artifact) throw new Error("Skill artifact was not found.");
    const digest =
      `sha256:${createHash("sha256").update(artifact.archive).digest("hex")}`;
    if (digest !== artifact.digest || digest !== skill.digest) {
      throw new Error("Skill artifact digest does not match the catalog.");
    }
    return skill;
  }

  async skillArtifact(id: string) {
    const skill = await this.verifySkillArtifact(id);
    const artifact = await this.store.getSkillArtifact(skill.id, skill.version);
    if (!artifact) throw new Error("Skill artifact was not found.");
    return {
      archive: artifact.archive,
      contentType: artifact.contentType,
      digest: artifact.digest,
      fileName: `${skill.id}-${skill.version}.tar.gz`,
    };
  }

  async createMcpServer(input: CreateMcpServerDefinitionInput): Promise<McpServerDefinition> {
    this.assertSafeRegistration(input);
    await this.quotas.assertCanCreate("mcp");
    const id = resourceId(input.name);
    const server = await this.store.saveMcpServerDefinition({
      id,
      litellmServerId: liteLLMServerId(this.store.projectId, id),
      ...input,
      status: "UNCHECKED",
      tools: [],
      lastDiscoveryAttemptAt: null,
      lastDiscoveredAt: null,
      lastDiscoveryError: null,
    });
    try {
      await this.requireAdapter("registerMcpServer")(await this.liteLLMInput(server));
      await this.syncProjectObjectPermissions();
      return await this.discoverMcpServer(server.id);
    } catch (error) {
      return this.store.saveMcpDiscovery(server.id, {
        status: this.failureStatus(error),
        attemptedAt: new Date().toISOString(),
        error: safeError(error),
      });
    }
  }

  async updateMcpServer(id: string, input: UpdateMcpServerDefinitionInput): Promise<McpServerDefinition> {
    this.assertSafeRegistration(input);
    const current = await this.store.getMcpServerDefinition(id);
    if (!current) throw new Error("MCP server was not found.");
    const next = await this.store.saveMcpServerDefinition({
      ...current,
      ...input,
      id,
      status: "UNCHECKED",
      lastDiscoveryError: null,
    });
    try {
      await this.requireAdapter("updateMcpServer")(await this.liteLLMInput(next));
      await this.syncProjectObjectPermissions();
      return await this.discoverMcpServer(id);
    } catch (error) {
      return this.store.saveMcpDiscovery(id, {
        status: this.failureStatus(error),
        attemptedAt: new Date().toISOString(),
        error: safeError(error),
      });
    }
  }

  async discoverMcpServer(id: string): Promise<McpServerDefinition> {
    const current = await this.store.getMcpServerDefinition(id);
    if (!current) throw new Error("MCP server was not found.");
    const attemptedAt = new Date().toISOString();
    try {
      const tools = await this.requireAdapter("discoverMcpTools")(current.litellmServerId);
      return this.store.saveMcpDiscovery(id, {
        status: "HEALTHY",
        attemptedAt,
        discoveredAt: new Date().toISOString(),
        tools,
      });
    } catch (error) {
      return this.store.saveMcpDiscovery(id, {
        status: this.failureStatus(error),
        attemptedAt,
        error: safeError(error),
      });
    }
  }

  async createKnowledgeSource(input: CreateKnowledgeSourceDefinitionInput): Promise<KnowledgeSourceDefinition> {
    await this.quotas.assertCanCreate("knowledge-base");
    const source = await this.store.saveKnowledgeSourceDefinition({
      id: resourceId(input.name),
      ...input,
      status: "UNAVAILABLE",
      lastReconciliationError: null,
    });
    try {
      await this.requireAdapter("registerVectorStore")(await this.liteLLMVectorStoreInput(source));
      await this.syncProjectObjectPermissions();
      return this.store.saveKnowledgeSourceDefinition({
        ...source,
        status: "REGISTERED",
        lastReconciliationError: null,
      });
    } catch (error) {
      return this.store.saveKnowledgeSourceDefinition({
        ...source,
        status: "UNAVAILABLE",
        lastReconciliationError: safeError(error),
      });
    }
  }

  async updateKnowledgeSource(id: string, input: UpdateKnowledgeSourceDefinitionInput): Promise<KnowledgeSourceDefinition> {
    const current = await this.store.getKnowledgeSourceDefinition(id);
    if (!current) throw new Error("Knowledge source was not found.");
    if (current.vectorStoreId !== input.vectorStoreId) {
      throw new Error("The provider Vector Store ID is immutable. Register a new Knowledge Base instead.");
    }
    const next = await this.store.saveKnowledgeSourceDefinition({
      ...current,
      ...input,
      id,
      status: "UNAVAILABLE",
      lastReconciliationError: null,
    });
    try {
      await this.requireAdapter("updateVectorStore")(await this.liteLLMVectorStoreInput(next));
      await this.syncProjectObjectPermissions();
      return this.store.saveKnowledgeSourceDefinition({
        ...next,
        status: "REGISTERED",
        lastReconciliationError: null,
      });
    } catch (error) {
      return this.store.saveKnowledgeSourceDefinition({
        ...next,
        status: "UNAVAILABLE",
        lastReconciliationError: safeError(error),
      });
    }
  }

  async delete(kind: ResourceKind, id: string): Promise<boolean> {
    if (await this.store.isResourceInUse(kind, id))
      throw new Error("This resource is assigned to a Role or Instance and cannot be deleted.");
    if (kind === "skills") return this.store.deleteSkillDefinition(id);
    if (kind === "mcp-servers") {
      const server = await this.store.getMcpServerDefinition(id);
      if (!server) return false;
      await this.requireAdapter("deleteMcpServer")(server.litellmServerId)
        .catch((error) => {
          if (!isRemoteNotFound(error)) throw error;
        });
      const deleted = await this.store.deleteMcpServerDefinition(id);
      await this.syncProjectObjectPermissions();
      return deleted;
    }
    const source = await this.store.getKnowledgeSourceDefinition(id);
    if (!source) return false;
    await this.requireAdapter("deleteVectorStore")(source.vectorStoreId)
      .catch((error) => {
        if (!isRemoteNotFound(error)) throw error;
      });
    const deleted = await this.store.deleteKnowledgeSourceDefinition(id);
    await this.syncProjectObjectPermissions();
    return deleted;
  }

  private async syncProjectObjectPermissions(): Promise<void> {
    const teamId = await this.quotas.ensureProjectTeam();
    const [mcpServers, vectorStores] = await Promise.all([
      this.store.listMcpServerDefinitions()
        .then((servers) => servers.map((server) => server.litellmServerId)),
      this.store.listKnowledgeSourceDefinitions()
        .then((sources) => sources.map((source) => source.vectorStoreId)),
    ]);
    await this.requireAdapter("updateProjectObjectPermissions")(teamId, {
      mcpServers,
      vectorStores,
    });
  }

  private async liteLLMInput(server: McpServerDefinition): Promise<LiteLLMMcpServerInput> {
    const [credential, staticHeaders, environment] = await Promise.all([
      server.authReference ? this.secrets.get(server.authReference) : Promise.resolve(undefined),
      this.resolveReferences(server.staticHeaders.map((entry) => [entry.name, entry.valueReference])),
      this.resolveReferences(server.environment.map((entry) => [entry.name, entry.valueReference])),
    ]);
    return {
      serverId: server.litellmServerId,
      serverName: server.alias,
      alias: server.alias,
      description: server.description,
      transport: server.transport === "openapi" ? "http" : server.transport,
      authType: server.authType,
      ...(credential ? { credential } : {}),
      ...(server.endpoint ? { url: server.endpoint } : {}),
      ...(server.specPath ? { specPath: server.specPath } : {}),
      ...(server.sourceUrl ? { sourceUrl: server.sourceUrl } : {}),
      accessGroups: server.accessGroups,
      allowedTools: server.allowedTools,
      extraHeaders: server.extraHeaders,
      staticHeaders,
      ...(server.command ? { command: server.command } : {}),
      args: server.args,
      environment,
      ...(server.oauth?.authorizationUrl ? { authorizationUrl: server.oauth.authorizationUrl } : {}),
      ...(server.oauth?.tokenUrl ? { tokenUrl: server.oauth.tokenUrl } : {}),
      ...(server.oauth?.registrationUrl ? { registrationUrl: server.oauth.registrationUrl } : {}),
      ...(server.oauth?.flow ? { oauth2Flow: server.oauth.flow } : {}),
      availableOnPublicInternet: !server.internalNetworkOnly,
    };
  }

  private async resolveReferences(entries: Array<[string, string]>): Promise<Record<string, string>> {
    return Object.fromEntries(await Promise.all(entries.map(async ([name, reference]) => [
      name,
      await this.secrets.get(reference),
    ])));
  }

  private async liteLLMVectorStoreInput(source: KnowledgeSourceDefinition): Promise<LiteLLMVectorStoreInput> {
    const credential = source.provider !== "elasticsearch" && source.credentialReference
      ? await this.secrets.get(source.credentialReference)
      : undefined;
    const usesElasticsearchBridge = source.provider === "elasticsearch";
    return {
      vectorStoreId: source.vectorStoreId,
      provider: source.provider === "elasticsearch" ? "pg_vector" : source.provider,
      name: source.name,
      description: source.description,
      metadata: {
        managed_by: "tali",
        tali_project_id: this.store.projectId,
        tasklattice_provider: source.provider,
        top_k: source.topK,
      },
      litellmParams: {
        ...(usesElasticsearchBridge
          ? {
              api_base: vectorStoreBridgeApiBase(this.store.projectId),
              api_key: vectorStoreBridgeApiKey(),
            }
          : {
              ...(source.apiBase ? { api_base: source.apiBase } : {}),
              ...(source.embeddingModel ? { litellm_embedding_model: source.embeddingModel } : {}),
              ...this.vectorStoreCredentialParams(source.provider, credential),
            }),
      },
    };
  }

  private vectorStoreCredentialParams(
    provider: KnowledgeSourceDefinition["provider"],
    credential: string | undefined,
  ): Record<string, unknown> {
    if (!credential) return {};
    if (credential.trim().startsWith("{")) {
      const parsed = JSON.parse(credential) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("Vector Store credential JSON must be an object.");
      }
      return parsed as Record<string, unknown>;
    }
    if (provider === "vertex_ai") return { vertex_credentials: credential };
    return { api_key: credential };
  }

  private assertSafeRegistration(input: CreateMcpServerDefinitionInput): void {
    if (input.transport !== "stdio") return;
    const template = mcpServerTemplates.find((candidate) => candidate.id === input.templateId);
    const usesReviewedCommand = template?.transport === "stdio"
      && template.command === input.command
      && JSON.stringify(template.args) === JSON.stringify(input.args);
    if (!usesReviewedCommand) {
      throw new Error("Custom stdio commands are not allowed. Select a reviewed built-in MCP Server template.");
    }
  }

  private requireAdapter<K extends keyof LiteLLMAdminClient>(
    name: K,
  ): NonNullable<LiteLLMAdminClient[K]> {
    const adapter = this.litellm[name];
    if (typeof adapter !== "function") {
      throw new Error(`LiteLLM adapter does not implement ${String(name)}.`);
    }
    return adapter.bind(this.litellm) as NonNullable<LiteLLMAdminClient[K]>;
  }

  private failureStatus(error: unknown): McpServerDefinition["status"] {
    return /(?:401|403|credential|permission|oauth|secret)/i.test(safeError(error))
      ? "PERMISSION_REQUIRED"
      : "UNAVAILABLE";
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 4_000) : String(error).slice(0, 4_000);
}

function isRemoteNotFound(error: unknown): boolean {
  return /(?:\b404\b|not found)/i.test(safeError(error));
}
