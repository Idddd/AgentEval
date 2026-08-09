import { randomUUID } from "node:crypto";
import {
  defaultNativeAgentMemoryConfiguration,
  type Agent,
  type AgentMemoryConfiguration,
  type CreateAgentInput,
  type ModelRouting,
  type RunnerSandbox,
  type SandboxAuditEvent,
} from "@tasklattice/contracts";
import { AccessPolicyService } from "../access-policies/access-policy-service";
import { AccessPolicyStore } from "../access-policies/access-policy-store";
import { ProjectStore } from "../projects/project-store";
import { ResourceCatalogService } from "../catalog/resource-catalog-service";
import {
  NemoClawRunnerClient,
  type CreateSandboxInput,
  type RunnerClient,
} from "../runtime/nemoclaw-runner-client";
import {
  LiteLLMClient,
  type LiteLLMAdminClient,
  type LiteLLMInstanceServiceAccountInput,
} from "../providers/litellm-client";
import { PolicyService } from "../policies/policy-service";
import { ModelRoutingService } from "../model-routings/model-routing-service";
import { ProjectQuotaService } from "../quotas/project-quota-service";

export function agentSandboxName(name: string, id: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 14)
      .replace(/-$/, "") || "agent";
  return `tali-${slug}-${id.slice(0, 8)}`;
}

export function applyObservedState(
  agent: Agent,
  observed: RunnerSandbox,
): Agent {
  const status: Agent["status"] =
    observed.phase === "READY"
      ? "READY"
      : observed.phase === "FAILED" || observed.phase === "NOT_FOUND"
        ? "FAILED"
        : observed.phase === "DESTROYING"
          ? "DESTROYING"
          : "PROVISIONING";
  const {
    error: _previousError,
    httpEndpoint: _previousHttpEndpoint,
    ...current
  } = agent;
  return {
    ...current,
    status,
    runtimePhase: observed.phase,
    ...(observed.provisioningStage
      ? { provisioningStage: observed.provisioningStage }
      : {}),
    logs: observed.logs.length > 0 ? observed.logs : agent.logs,
    ...(observed.httpEndpoint ? { httpEndpoint: observed.httpEndpoint } : {}),
    updatedAt: new Date().toISOString(),
    ...(observed.operationId ? { operationId: observed.operationId } : {}),
    ...(observed.error
      ? { error: observed.error }
      : observed.phase === "NOT_FOUND"
        ? {
            error:
              "The OpenShell Sandbox was not found while reconciling the Instance lifecycle.",
          }
        : {}),
  };
}

export class AgentService {
  private readonly destroyTasks = new Map<string, Promise<void>>();
  private readonly destroyRetryAttempts = new Map<string, number>();

  constructor(
    readonly store = new ProjectStore(),
    readonly runner: RunnerClient = new NemoClawRunnerClient(),
    readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
    readonly policies = new PolicyService(store),
    readonly catalog = new ResourceCatalogService(store),
    readonly modelRoutings = new ModelRoutingService(store, litellm),
    readonly quotas = new ProjectQuotaService(store, litellm),
    readonly accessPolicies = new AccessPolicyService(
      new AccessPolicyStore(store.projectId, store.database()),
      store,
      litellm,
    ),
  ) {}

  async list(): Promise<Agent[]> {
    return Promise.all(
      (await this.store.list()).map((agent) => this.refresh(agent)),
    );
  }

  async get(id: string): Promise<Agent | undefined> {
    const agent = await this.store.get(id);
    return agent ? this.refresh(agent) : undefined;
  }

  async getAudit(id: string): Promise<SandboxAuditEvent[] | undefined> {
    const agent = await this.store.get(id);
    return agent ? this.runner.getSandboxAudit(agent.sandboxName) : undefined;
  }

  async create(input: CreateAgentInput): Promise<Agent> {
    await this.quotas.assertCanCreate("instances");
    const catalog = await this.catalog.catalog();
    if (
      input.specializationId &&
      !catalog.specializations.some(
        (item) => item.id === input.specializationId,
      )
    )
      throw new Error(
        "Select an available Agent Role before creating an Instance.",
      );
    const references: Array<
      [string, readonly string[] | undefined, Set<string>]
    > = [
      ["Skill", input.skillIds, new Set(catalog.skills.map((item) => item.id))],
      [
        "MCP server",
        input.mcpServerIds,
        new Set(catalog.mcpServers.map((item) => item.id)),
      ],
      [
        "Knowledge source",
        input.knowledgeSourceIds,
        new Set(catalog.knowledgeSources.map((item) => item.id)),
      ],
    ];
    for (const [label, ids, available] of references) {
      const missing = (ids ?? []).filter((id) => !available.has(id));
      if (missing.length)
        throw new Error(
          `${label} configuration is unavailable: ${missing.join(", ")}.`,
        );
    }
    const policy = await this.policies.resolve(input.policyId);
    const id = randomUUID();
    const now = new Date().toISOString();
    const sandboxName = agentSandboxName(input.name, id);
    await this.accessPolicies.assertActivePolicyIds(input.accessPolicyIds);
    const routing = await this.modelRoutings.resolver.resolve(input.modelRoutingId);
    const gateway = await this.store.getInferenceGateway(routing.gatewayId);
    if (!gateway)
      throw new Error(
        "The selected Routing LiteLLM Gateway is unavailable.",
      );
    const memoryConfiguration =
      input.agentPlatform === "openclaw"
        ? (input.memory ?? defaultNativeAgentMemoryConfiguration)
        : input.memory;
    const memory = await this.resolveMemory(
      input.agentPlatform,
      memoryConfiguration,
      routing,
    );
    const costKeyAlias = `tali-instance-${id}`;
    const serviceAccountId = `tali-instance-${id}`;
    const objectPermissions = await this.accessPolicies.permissionsForAgent({
      accessPolicyIds: input.accessPolicyIds,
      mcpServerIds: input.mcpServerIds,
      knowledgeSourceIds: input.knowledgeSourceIds,
    });
    const modelKeyRouting = await this.modelKeyRouting(routing);
    const { teamId, key: instanceKey } = await this.quotas.createInstanceKey({
      alias: costKeyAlias,
      models: memory.keyModel
        ? [...new Set([...modelKeyRouting.models, memory.keyModel])]
        : modelKeyRouting.models,
      ...modelKeyRouting.keyConfiguration,
      metadata: {
        managed_by: "tali",
        tali_project_id: this.store.projectId,
        tali_instance_id: id,
        service_account_id: serviceAccountId,
      },
      objectPermissions,
    });
    let agent: Agent = {
      schemaVersion: 2,
      id,
      ...input,
      ...(memoryConfiguration ? { memory: memoryConfiguration } : {}),
      policyId: policy.id,
      modelDeploymentId: `model-routing:${routing.id}`,
      providerAccountId: gateway.id,
      providerName: "LiteLLM managed",
      model: routing.publicModelAlias,
      modelType: "llm",
      inferenceMode: "PLATFORM_MANAGED",
      modelRoutingId: routing.id,
      modelRoutingBindingId: `instance-selected:${routing.id}`,
      modelRoutingStatus: routing.status,
      modelRoutingComplianceDomain: routing.complianceDomain,
      modelRoutingCapabilities: routing.capabilities,
      modelRoutingKeyFingerprint: `token:${instanceKey.tokenId.slice(-12)}`,
      costKeyAlias,
      liteLLMTokenId: instanceKey.tokenId,
      liteLLMTeamId: teamId,
      serviceAccountId,
      sandboxName,
      status: "PROVISIONING",
      provisioningStage: "QUEUED",
      createdAt: now,
      updatedAt: now,
      logs: ["Agent request accepted. Waiting for the NemoClaw Runtime Host."],
    };
    try {
      await this.store.save(agent);
      await this.store.replaceAgentAccessPolicies(id, input.accessPolicyIds);
      await this.store.costAnalytics().saveAttribution({
        id: `instance-key:${id}:${instanceKey.tokenId.slice(-12)}`,
        projectId: this.store.projectId,
        environmentId: "project-default",
        instanceId: id,
        instanceName: input.name,
        liteLLMVirtualKeyId: instanceKey.tokenId,
        hashedToken: instanceKey.tokenId,
        virtualKeyAlias: costKeyAlias,
        liteLLMTeamId: teamId,
        providerAccountId: gateway.id,
        validFrom: now,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      await this.litellm.revokeKey(instanceKey.tokenId).catch(() => undefined);
      await this.closeInstanceAttributions(id).catch(() => undefined);
      await this.store.delete(id).catch(() => undefined);
      throw error;
    }
    try {
      agent = await this.store.save(
        applyObservedState(
          agent,
          await this.runner.createSandbox({
            name: agent.sandboxName,
            agentPlatform: agent.agentPlatform,
            providerName: "LiteLLM",
            model: routing.publicModelAlias,
            inferenceEndpoint: `${this.litellm.baseUrl}/v1`,
            policyYaml: policy.policyYaml,
            systemPrompt: input.systemPrompt,
            apiKey: instanceKey.secret,
            instanceId: id,
            ...(memory.runtime ? { memory: memory.runtime } : {}),
          }),
        ),
      );
    } catch (error) {
      await this.litellm.revokeKey(instanceKey.tokenId).catch(() => undefined);
      await this.closeInstanceAttributions(id);
      agent = await this.store.save({
        ...agent,
        status: "FAILED",
        updatedAt: new Date().toISOString(),
        error:
          error instanceof Error
            ? error.message
            : "Runtime runner rejected the request.",
      });
    }
    return agent;
  }

  async destroy(id: string): Promise<boolean> {
    const agent = await this.store.get(id);
    if (!agent) return false;
    if (agent.status !== "DESTROYING") {
      const { error: _previousError, ...current } = agent;
      await this.store.save({
        ...current,
        status: "DESTROYING",
        logs: [
          ...current.logs,
          "Instance deletion accepted. Runtime cleanup is continuing in the background.",
        ],
        updatedAt: new Date().toISOString(),
      });
    }
    this.queueDestroy(id);
    return true;
  }

  private queueDestroy(id: string): void {
    if (this.destroyTasks.has(id)) return;
    const task = this.completeDestroy(id)
      .then(() => {
        this.destroyRetryAttempts.delete(id);
      })
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : "unknown error";
        const attempt = (this.destroyRetryAttempts.get(id) ?? 0) + 1;
        this.destroyRetryAttempts.set(id, attempt);
        const current = await this.store.get(id).catch(() => undefined);
        if (current) {
          const logs = current.logs.filter(
            (line) => !line.startsWith("Deletion retry pending:"),
          );
          await this.store.save({
            ...current,
            status: "DESTROYING",
            error: `Runtime cleanup is retrying: ${message}`,
            logs: [
              ...logs,
              `Deletion retry pending: ${message}`,
            ].slice(-100),
            updatedAt: new Date().toISOString(),
          }).catch(() => undefined);
        }
        const delayMs = Math.min(1_000 * 2 ** Math.min(attempt - 1, 5), 30_000);
        const retry = setTimeout(() => this.queueDestroy(id), delayMs);
        retry.unref();
      })
      .finally(() => {
        this.destroyTasks.delete(id);
      });
    this.destroyTasks.set(id, task);
  }

  private async completeDestroy(id: string): Promise<void> {
    const agent = await this.store.get(id);
    if (!agent) return;
    await this.runner.destroySandbox(agent.sandboxName, agent.agentPlatform);
    if (agent.liteLLMTokenId)
      await this.litellm.revokeKey(agent.liteLLMTokenId);
    await this.closeInstanceAttributions(id);
    await this.store.delete(id);
  }

  async updateAccessPolicies(
    id: string,
    accessPolicyIds: string[],
    actor: string,
  ): Promise<Agent> {
    const current = await this.store.get(id);
    if (!current) throw new Error("Agent Instance not found.");
    await this.accessPolicies.assertActivePolicyIds(accessPolicyIds);
    const next = {
      ...current,
      accessPolicyIds,
      updatedAt: new Date().toISOString(),
      logs: [...current.logs, `Access Policies updated by ${actor}.`],
    };
    const [permissions, previousPermissions] = await Promise.all([
      this.accessPolicies.permissionsForAgent(next),
      this.accessPolicies.permissionsForAgent(current),
    ]);
    if (current.liteLLMTokenId) {
      if (!this.litellm.updateInstanceObjectPermissions) {
        throw new Error("LiteLLM key permission updates are unavailable.");
      }
      await this.litellm.updateInstanceObjectPermissions(
        current.liteLLMTokenId,
        permissions,
      );
    }
    try {
      await this.store.replaceAgentAccessPolicies(id, accessPolicyIds, actor);
      return await this.store.save(next);
    } catch (error) {
      const rollbackFailures: string[] = [];
      try {
        await this.store.replaceAgentAccessPolicies(
          id,
          current.accessPolicyIds,
          `${actor} (rollback)`,
        );
      } catch (rollbackError) {
        rollbackFailures.push(
          `database: ${rollbackError instanceof Error ? rollbackError.message : "unknown error"}`,
        );
      }
      if (current.liteLLMTokenId) {
        try {
          await this.litellm.updateInstanceObjectPermissions!(
            current.liteLLMTokenId,
            previousPermissions,
          );
        } catch (rollbackError) {
          rollbackFailures.push(
            `LiteLLM: ${rollbackError instanceof Error ? rollbackError.message : "unknown error"}`,
          );
        }
      }
      if (rollbackFailures.length) {
        throw new Error(
          `Access Policy assignment failed and rollback was incomplete (${rollbackFailures.join("; ")}).`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  private async modelKeyRouting(routing: ModelRouting): Promise<{
    models: string[];
    keyConfiguration: Pick<
      LiteLLMInstanceServiceAccountInput,
      "aliases" | "routerSettings"
    >;
  }> {
    if (routing.routingPolicy.mode !== "SINGLE") {
      return { models: [routing.publicModelAlias], keyConfiguration: {} };
    }
    const deployments = await Promise.all([
      this.store.getModelDeployment(routing.routingPolicy.modelDeploymentId),
      ...routing.routingPolicy.fallbackModelDeploymentIds.map((id) =>
        this.store.getModelDeployment(id),
      ),
    ]);
    const missingIndex = deployments.findIndex((deployment) => !deployment);
    if (missingIndex >= 0) {
      const role = missingIndex === 0 ? "primary" : `fallback ${missingIndex}`;
      throw new Error(`The ${role} Routing deployment is unavailable.`);
    }
    const primary = deployments[0]!;
    const fallbacks = deployments.slice(1).map((deployment) => deployment!);
    const fallbackModels = fallbacks.map(
      (deployment) => deployment.litellmModelName,
    );
    return {
      models: [
        routing.publicModelAlias,
        primary.litellmModelName,
        ...fallbackModels,
      ],
      keyConfiguration: {
        aliases: {
          [routing.publicModelAlias]: primary.litellmModelName,
        },
        routerSettings: {
          num_retries: routing.routingPolicy.retries,
          ...(fallbackModels.length
            ? { fallbacks: [{ [primary.litellmModelName]: fallbackModels }] }
            : {}),
        },
      },
    };
  }

  private async resolveMemory(
    agentPlatform: CreateAgentInput["agentPlatform"],
    memory: AgentMemoryConfiguration | undefined,
    routing: ModelRouting,
  ): Promise<{
    keyModel?: string;
    runtime?: NonNullable<CreateSandboxInput["memory"]>;
  }> {
    if (!memory) return {};
    if (agentPlatform !== "openclaw") {
      throw new Error("Memory is currently available only for OpenClaw Instances.");
    }
    if (memory.mode === "native") {
      return {
        runtime: {
          mode: "native",
          citations: memory.citations,
        },
      };
    }
    const embedding = await this.store.getModelDeployment(
      memory.embeddingModelDeploymentId,
    );
    if (
      !embedding ||
      embedding.status !== "VALIDATED" ||
      embedding.modelType !== "text-embedding"
    ) {
      throw new Error(
        "Select a validated text embedding model for hybrid Memory.",
      );
    }
    if (embedding.complianceDomain !== routing.complianceDomain) {
      throw new Error(
        "Memory embedding and model Routing must use the same compliance boundary.",
      );
    }
    return {
      keyModel: embedding.litellmModelName,
      runtime: {
        mode: "hybrid",
        embeddingModel: embedding.litellmModelName,
        includeSessionTranscripts: memory.includeSessionTranscripts,
        citations: memory.citations,
        maxResults: memory.maxResults,
        minScore: memory.minScore,
      },
    };
  }

  private async refresh(agent: Agent): Promise<Agent> {
    if (agent.status === "DESTROYING") {
      this.queueDestroy(agent.id);
      return agent;
    }
    if (agent.status === "FAILED") return agent;
    try {
      return await this.store.save(
        applyObservedState(
          agent,
          await this.runner.getSandbox(agent.sandboxName, agent.agentPlatform),
        ),
      );
    } catch (error) {
      return {
        ...agent,
        logs: [
          ...agent.logs,
          `Runtime observation unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
        ],
      };
    }
  }

  private async closeInstanceAttributions(instanceId: string): Promise<void> {
    const now = new Date();
    await this.store.database().costAttributionMappingRecord.updateMany({
      where: {
        projectId: this.store.projectId,
        instanceId,
        validTo: null,
      },
      data: { validTo: now, updatedAt: now },
    });
  }
}
