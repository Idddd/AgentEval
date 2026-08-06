import type {
  ProjectQuota,
  UpdateProjectQuotaInput,
} from "@tasklattice/contracts";
import type { PrismaClient } from "../generated/prisma/client";
import {
  LiteLLMClient,
  type LiteLLMAdminClient,
  type LiteLLMInstanceServiceAccountInput,
} from "../providers/litellm-client";
import { ProjectStore } from "../projects/project-store";

type LimitedResource = "instances" | "mcp" | "knowledge-base";

export class ProjectQuotaService {
  private readonly db: PrismaClient;

  constructor(
    readonly store = new ProjectStore(),
    readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
  ) {
    this.db = store.database();
  }

  async get(): Promise<ProjectQuota> {
    const quota = await this.ensureRecord();
    const [usage, instances, mcpIntegrations, knowledgeBaseIntegrations] = await Promise.all([
      this.db.modelUsageFactRecord.aggregate({
        where: { projectId: this.store.projectId },
        _sum: { totalCostUsd: true, totalTokens: true },
      }),
      this.db.agentRecord.count({ where: { projectId: this.store.projectId } }),
      this.db.mcpServerRecord.count({ where: { projectId: this.store.projectId } }),
      this.db.knowledgeSourceRecord.count({ where: { projectId: this.store.projectId } }),
    ]);
    return {
      projectId: quota.projectId,
      hardBudgetUsd: quota.hardBudgetUsd === null ? null : Number(quota.hardBudgetUsd),
      budgetDuration: quota.budgetDuration as ProjectQuota["budgetDuration"],
      tpmLimit: quota.tpmLimit === null ? null : Number(quota.tpmLimit),
      maxInstances: quota.maxInstances,
      maxMcpIntegrations: quota.maxMcpIntegrations,
      maxKnowledgeBaseIntegrations: quota.maxKnowledgeBaseIntegrations,
      litellmTeamId: quota.litellmTeamId,
      syncStatus: quota.syncStatus as ProjectQuota["syncStatus"],
      lastSyncedAt: quota.lastSyncedAt?.toISOString() ?? null,
      lastSyncError: quota.lastSyncError,
      revision: quota.revision,
      usage: {
        spendUsd: Number(usage._sum.totalCostUsd ?? 0),
        totalTokens: Number(usage._sum.totalTokens ?? 0),
        instances,
        mcpIntegrations,
        knowledgeBaseIntegrations,
      },
    };
  }

  async update(input: UpdateProjectQuotaInput, actor: string): Promise<ProjectQuota> {
    await this.db.projectQuotaRecord.upsert({
      where: { projectId: this.store.projectId },
      create: {
        projectId: this.store.projectId,
        ...this.databaseInput(input),
        updatedBy: actor,
        syncStatus: "pending",
      },
      update: {
        ...this.databaseInput(input),
        updatedBy: actor,
        syncStatus: "pending",
        lastSyncError: null,
        revision: { increment: 1 },
      },
    });
    await this.sync().catch(() => undefined);
    return this.get();
  }

  async ensureProjectTeam(): Promise<string> {
    const project = await this.db.project.findUniqueOrThrow({
      where: { id: this.store.projectId },
      include: { humanMembers: { include: { user: true } } },
    });
    const quota = await this.ensureRecord();
    let teamId = quota.litellmTeamId;
    try {
      if (!teamId) {
        const ensure = this.requireAdapter("ensureProjectTeam");
        teamId = await ensure(`tali-project-${slug(project.id)}`, {
          managed_by: "tali",
          tali_project_id: project.id,
          tali_project_name: project.name,
        });
        await this.db.projectQuotaRecord.update({
          where: { projectId: project.id },
          data: { litellmTeamId: teamId },
        });
      }
      const addMember = this.litellm.addProjectTeamMember?.bind(this.litellm);
      if (addMember) {
        for (const membership of project.humanMembers) {
          try {
            await addMember(teamId, {
              userId: membership.userId,
              email: membership.user.email,
              // TALI remains the authorization source for Project roles. A
              // LiteLLM Team admin is an Enterprise feature, so all human
              // identities are quota-bearing Team users in the core edition.
              role: "user",
            });
          } catch (error) {
            if (!/already in team|team_member_already_in_team/i.test(safeError(error))) throw error;
          }
        }
      }
      return teamId;
    } catch (error) {
      await this.markSyncFailure(error);
      throw error;
    }
  }

  async sync(): Promise<void> {
    try {
      const quota = await this.ensureRecord();
      const teamId = await this.ensureProjectTeam();
      await this.requireAdapter("updateProjectTeam")(teamId, {
        ...(quota.hardBudgetUsd !== null ? { maxBudget: Number(quota.hardBudgetUsd) } : {}),
        ...(quota.budgetDuration ? { budgetDuration: quota.budgetDuration } : {}),
        ...(quota.tpmLimit !== null ? { tpmLimit: Number(quota.tpmLimit) } : {}),
      });
      await this.db.projectQuotaRecord.update({
        where: { projectId: this.store.projectId },
        data: {
          syncStatus: "synced",
          lastSyncedAt: new Date(),
          lastSyncError: null,
        },
      });
    } catch (error) {
      await this.markSyncFailure(error);
      throw error;
    }
  }

  async createInstanceKey(input: Omit<LiteLLMInstanceServiceAccountInput, "teamId">) {
    const teamId = await this.ensureProjectTeam();
    const createKey = this.requireAdapter("createInstanceServiceAccountKey");
    return {
      teamId,
      key: await createKey({ ...input, teamId }),
    };
  }

  async assertCanCreate(resource: LimitedResource): Promise<void> {
    const quota = await this.ensureRecord();
    const [limit, count, label] = resource === "instances"
      ? [quota.maxInstances, await this.db.agentRecord.count({ where: { projectId: this.store.projectId } }), "Instance"]
      : resource === "mcp"
        ? [quota.maxMcpIntegrations, await this.db.mcpServerRecord.count({ where: { projectId: this.store.projectId } }), "MCP integration"]
        : [quota.maxKnowledgeBaseIntegrations, await this.db.knowledgeSourceRecord.count({ where: { projectId: this.store.projectId } }), "Knowledge Base integration"];
    if (limit !== null && count >= limit) {
      throw new Error(`${label} quota exceeded (${count}/${limit}). Increase the Project quota before adding another.`);
    }
  }

  private ensureRecord() {
    return this.db.projectQuotaRecord.upsert({
      where: { projectId: this.store.projectId },
      create: { projectId: this.store.projectId },
      update: {},
    });
  }

  private databaseInput(input: UpdateProjectQuotaInput) {
    return {
      hardBudgetUsd: input.hardBudgetUsd,
      budgetDuration: input.budgetDuration,
      tpmLimit: input.tpmLimit === null ? null : BigInt(input.tpmLimit),
      maxInstances: input.maxInstances,
      maxMcpIntegrations: input.maxMcpIntegrations,
      maxKnowledgeBaseIntegrations: input.maxKnowledgeBaseIntegrations,
    };
  }

  private async markSyncFailure(error: unknown): Promise<void> {
    await this.db.projectQuotaRecord.update({
      where: { projectId: this.store.projectId },
      data: {
        syncStatus: "failed",
        lastSyncError: safeError(error),
      },
    }).catch(() => undefined);
  }

  private requireAdapter<K extends keyof LiteLLMAdminClient>(name: K): NonNullable<LiteLLMAdminClient[K]> {
    const method = this.litellm[name];
    if (typeof method !== "function") throw new Error(`LiteLLM adapter does not support ${String(name)}.`);
    return method.bind(this.litellm) as NonNullable<LiteLLMAdminClient[K]>;
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "project";
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "LiteLLM synchronization failed.")
    .replace(/\bsk-[A-Za-z0-9._-]{8,}\b/g, "[REDACTED]")
    .slice(0, 1_000);
}
