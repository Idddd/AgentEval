import { describe, expect, it, vi } from "vitest";
import type { LiteLLMAdminClient } from "../providers/litellm-client";
import { createTestStore } from "../test/store";
import { ProjectQuotaService } from "./project-quota-service";

function adapter(): LiteLLMAdminClient {
  return {
    baseUrl: "http://litellm:4000",
    registerModel: vi.fn(),
    deleteModel: vi.fn(),
    probeModel: vi.fn(),
    createInstanceKey: vi.fn(),
    revokeKey: vi.fn(),
    listSpendLogs: vi.fn(),
    ensureProjectTeam: vi.fn(async () => "team-project"),
    updateProjectTeam: vi.fn(async () => undefined),
    addProjectTeamMember: vi.fn(async () => undefined),
    createInstanceServiceAccountKey: vi.fn(async () => ({
      secret: "sk-instance",
      tokenId: "hashed-instance",
    })),
  };
}

describe("ProjectQuotaService", () => {
  it("persists Project limits and synchronizes spend plus TPM to the LiteLLM Team", async () => {
    const litellm = adapter();
    const service = new ProjectQuotaService(createTestStore(), litellm);

    const quota = await service.update(
      {
        hardBudgetUsd: 250,
        budgetDuration: "30d",
        tpmLimit: 500_000,
        maxInstances: 3,
        maxMcpIntegrations: 4,
        maxKnowledgeBaseIntegrations: 2,
      },
      "admin",
    );

    expect(quota).toMatchObject({
      hardBudgetUsd: 250,
      budgetDuration: "30d",
      tpmLimit: 500_000,
      maxInstances: 3,
      syncStatus: "synced",
      litellmTeamId: "team-project",
    });
    expect(litellm.updateProjectTeam).toHaveBeenCalledWith("team-project", {
      maxBudget: 250,
      budgetDuration: "30d",
      tpmLimit: 500_000,
    });
    expect(litellm.addProjectTeamMember).toHaveBeenCalledWith(
      "team-project",
      expect.objectContaining({ role: "user" }),
    );
  });

  it("treats null as unlimited and zero as blocking new resources", async () => {
    const service = new ProjectQuotaService(createTestStore(), adapter());
    await service.update(
      {
        hardBudgetUsd: null,
        budgetDuration: null,
        tpmLimit: null,
        maxInstances: 0,
        maxMcpIntegrations: null,
        maxKnowledgeBaseIntegrations: 0,
      },
      "admin",
    );

    await expect(service.assertCanCreate("instances")).rejects.toThrow(
      "Instance quota exceeded",
    );
    await expect(service.assertCanCreate("mcp")).resolves.toBeUndefined();
    await expect(service.assertCanCreate("knowledge-base")).rejects.toThrow(
      "Knowledge Base integration quota exceeded",
    );
  });

  it("creates an Instance Service Account with Project and Instance metadata", async () => {
    const litellm = adapter();
    const service = new ProjectQuotaService(createTestStore(), litellm);

    const result = await service.createInstanceKey({
      alias: "tali-instance-1",
      models: ["production-chat"],
      metadata: {
        tali_project_id: "individual",
        tali_instance_id: "instance-1",
        service_account_id: "tali-instance-instance-1",
      },
      objectPermissions: {
        mcpServers: [],
      },
    });

    expect(result.teamId).toBe("team-project");
    expect(litellm.createInstanceServiceAccountKey).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team-project",
        metadata: expect.objectContaining({
          tali_project_id: "individual",
          tali_instance_id: "instance-1",
        }),
      }),
    );
  });
});
