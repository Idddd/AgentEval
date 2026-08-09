import {
  createAgentSchema,
  type Agent,
  type CreateAgentInput,
  type RunnerSandbox,
} from "@tasklattice/contracts";
import { describe, expect, it, vi } from "vitest";

import type { LiteLLMAdminClient } from "../providers/litellm-client";
import type { RunnerClient } from "../runtime/nemoclaw-runner-client";
import { PolicyService } from "../policies/policy-service";
import { createTestStore } from "../test/store";
import {
  AgentService,
  agentSandboxName,
  applyObservedState,
} from "./agent-service";

const accessPolicyId = "11111111-1111-4111-8111-111111111111";

describe("Agent sandbox naming", () => {
  it("stays within the OpenShell service-routing limit", () => {
    const name = agentSandboxName(
      "A Very Long Research Assistant Name",
      "12345678-1234-4000-8000-123456789abc",
    );

    expect(name).toBe("tali-a-very-long-re-12345678");
    expect(name.length).toBeLessThanOrEqual(28);
    expect(name).toMatch(/^[a-z][a-z0-9-]+[a-z0-9]$/);
  });

  it("keeps the id suffix when the display name has no slug characters", () => {
    expect(
      agentSandboxName("研究助手", "abcdef01-1234-4000-8000-123456789abc"),
    ).toBe("tali-agent-abcdef01");
  });
});

describe("Instance lifecycle reconciliation", () => {
  const now = new Date().toISOString();
  const agent: Agent = {
    schemaVersion: 2,
    id: "agent-a",
    name: "Research Assistant",
    description: "",
    runtime: "openshell",
    agentPlatform: "openclaw",
    accessPolicyIds: [accessPolicyId],
    modelDeploymentId: "model-a",
    providerAccountId: "provider-a",
    providerName: "DeepSeek",
    model: "deepseek-chat",
    modelType: "llm",
    inferenceMode: "PLATFORM_MANAGED",
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
    costKeyAlias: "tali-research:deepseek-chat",
    sandboxName: "tali-research",
    status: "PROVISIONING",
    provisioningStage: "QUEUED",
    policyId: "restricted",
    systemPrompt: "Research the request and report the resulting evidence.",
    createdAt: now,
    updatedAt: now,
    logs: ["Instance creation accepted."],
  };

  it("preserves initialization logs when a recovered Runner has none", () => {
    expect(
      applyObservedState(agent, {
        name: agent.sandboxName,
        agentPlatform: "openclaw",
        phase: "PROVISIONING",
        provisioningStage: "POD",
        logs: [],
      }),
    ).toMatchObject({
      status: "PROVISIONING",
      provisioningStage: "POD",
      logs: ["Instance creation accepted."],
    });
  });

  it("records a useful failure when the Sandbox disappears", () => {
    expect(
      applyObservedState(agent, {
        name: agent.sandboxName,
        agentPlatform: "openclaw",
        phase: "NOT_FOUND",
        logs: [],
      }),
    ).toMatchObject({
      status: "FAILED",
      runtimePhase: "NOT_FOUND",
      error: expect.stringContaining("OpenShell Sandbox was not found"),
    });
  });
});

describe("OpenShell policy assignment", () => {
  it("loads the full-access GitHub example from the deployment catalog", async () => {
    const policy = await new PolicyService(createTestStore()).resolve(
      "github-full-access",
    );

    expect(policy?.policyYaml).toContain("host: api.github.com");
    expect(policy?.policyYaml).toContain("access: full");
    expect(
      createAgentSchema.parse({
        name: "GitHub Operator",
        description: "",
        runtime: "openshell",
        accessPolicyIds: [accessPolicyId],
        modelRoutingId: "routing-a",
        policyId: "github-full-access",
        systemPrompt: "Operate on GitHub and report the resulting evidence.",
      }).policyId,
    ).toBe("github-full-access");
  });
});

describe("Agent selection", () => {
  const input = {
    name: "Research Assistant",
    description: "",
    runtime: "openshell" as const,
    accessPolicyIds: [accessPolicyId],
    modelRoutingId: "routing-a",
    policyId: "restricted" as const,
    systemPrompt: "Research the request and report the resulting evidence.",
  };

  it("uses OpenClaw as the default Agent implementation", () => {
    expect(createAgentSchema.parse(input).agentPlatform).toBe("openclaw");
  });

  it("accepts Hermes as an Agent configured by NemoClaw", () => {
    expect(
      createAgentSchema.parse({ ...input, agentPlatform: "hermes" })
        .agentPlatform,
    ).toBe("hermes");
  });

  it("keeps specialization and capability references in the create contract", () => {
    expect(
      createAgentSchema.parse({
        ...input,
        specializationId: "hr",
        skillIds: ["employee-policy-search"],
        mcpServerIds: ["workday"],
        knowledgeSourceIds: ["company-hr-handbook"],
      }),
    ).toMatchObject({
      specializationId: "hr",
      skillIds: ["employee-policy-search"],
      mcpServerIds: ["workday"],
      knowledgeSourceIds: ["company-hr-handbook"],
    });
  });

  it("accepts an Instance-specific Model Routing selection", () => {
    expect(
      createAgentSchema.parse({
        ...input,
        modelRoutingId: "routing-selected",
      }).modelRoutingId,
    ).toBe("routing-selected");
  });

  it("accepts Memory only for OpenClaw Instances", () => {
    expect(
      createAgentSchema.parse({
        ...input,
        memory: { mode: "native" },
      }).memory,
    ).toEqual({ mode: "native", citations: "auto" });
    expect(() =>
      createAgentSchema.parse({
        ...input,
        agentPlatform: "hermes",
        memory: { mode: "native" },
      }),
    ).toThrow("Memory is currently available only for OpenClaw Instances");
  });

  it("resolves Role and capability references from the PostgreSQL catalog", async () => {
    const service = new AgentService(createTestStore());
    await expect(
      service.create({
        ...input,
        agentPlatform: "openclaw",
        specializationId: "missing-role",
      }),
    ).rejects.toThrow("available Agent Role");
    await expect(
      service.create({
        ...input,
        agentPlatform: "openclaw",
        specializationId: "general-purpose",
        skillIds: ["missing-skill"],
      }),
    ).rejects.toThrow("Skill configuration is unavailable");
  });
});

function runnerAdapter(): RunnerClient {
  return {
    createSandbox: vi.fn(async (input) => ({
      name: input.name,
      agentPlatform: input.agentPlatform,
      phase: "READY" as const,
      logs: [],
    })),
    getSandbox: vi.fn(),
    getSandboxAudit: vi.fn(),
    destroySandbox: vi.fn(async (name, agentPlatform) => ({
      name,
      agentPlatform,
      phase: "NOT_FOUND" as const,
      logs: [],
    })),
    getHealth: vi.fn(async () => ({ ok: true, mode: "fixture" })),
    terminalWebSocketUrl: vi.fn(() => "ws://runner/terminal"),
    authorizationHeaders: vi.fn(() => ({ authorization: "Bearer token" })),
  };
}

function liteLLMAdapter(): LiteLLMAdminClient {
  return {
    baseUrl: "http://litellm:4000",
    registerModel: vi.fn(),
    deleteModel: vi.fn(),
    probeModel: vi.fn(),
    createInstanceKey: vi.fn(async () => ({
      secret: "sk-instance",
      tokenId: "hashed-token",
    })),
    ensureProjectTeam: vi.fn(async () => "team-a"),
    addProjectTeamMember: vi.fn(async () => undefined),
    createInstanceServiceAccountKey: vi.fn(async () => ({
      secret: "sk-instance-service-account",
      tokenId: "instance-hashed-token",
    })),
    updateInstanceObjectPermissions: vi.fn(async () => undefined),
    revokeKey: vi.fn(async () => undefined),
    listSpendLogs: vi.fn(async () => []),
  };
}

async function configuredService() {
  const store = createTestStore();
  const now = new Date().toISOString();
  await store.saveInferenceGateway({
    id: "litellm-default",
    name: "LiteLLM",
    baseUrl: "http://litellm:4000",
    adminUiUrl: "http://litellm:4000",
    credentialSource: "ENVIRONMENT",
    status: "READY",
    validationMessage: "Ready",
    validatedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await store.saveProviderAccount(
    {
      id: "provider-a",
      name: "DeepSeek",
      providerKind: "deepseek",
      presetId: "deepseek",
      endpoint: "https://api.deepseek.com/v1",
      config: {},
      complianceDomain: "GLOBAL",
      endpointRegion: "global",
      crossBorderTransfer: false,
      discoveredModels: [],
      status: "VALIDATED",
      checks: [],
      credentialState: "STORED",
      validationMessage: "Ready",
      validatedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    "test-credential",
  );
  await store.saveModelDeployment({
    id: "model-a",
    providerAccountId: "provider-a",
    modelId: "deepseek-chat",
    displayName: "DeepSeek Chat",
    modelType: "llm",
    capabilities: ["tool-calling"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    providerPresetId: "deepseek",
    providerName: "DeepSeek",
    endpoint: "https://api.deepseek.com/v1",
    complianceDomain: "GLOBAL",
    endpointRegion: "global",
    crossBorderTransfer: false,
    litellmModelName: "tali/provider-a/deepseek-chat",
    status: "VALIDATED",
    checks: [],
    validationMessage: "Ready",
    validatedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await store.saveModelRouting({
    id: "routing-a",
    name: "Production inference",
    description: "Managed inference for production Instances.",
    gatewayId: "litellm-default",
    managementMode: "LITELLM_MANAGED",
    publicModelAlias: "tali-routing-routing-a",
    routingPolicy: {
      version: 1,
      mode: "SINGLE",
      modelDeploymentId: "model-a",
      fallbackModelDeploymentIds: [],
      retries: 2,
    },
    complianceDomain: "GLOBAL",
    status: "READY",
    isDefault: true,
    keyPolicy: { perInstance: true, rotationDays: 90 },
    auditPolicy: {
      controlPlane: true,
      requestLogs: true,
      capturePrompts: false,
    },
    capabilities: {
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
    conditions: [
      {
        type: "COMPLIANCE",
        status: "PASS",
        reason: "All backing deployments are GLOBAL.",
      },
    ],
    configurationHash: "sha256:test",
    observedGeneration: 1,
    validationMessage: "LiteLLM binding is ready.",
    consumers: 0,
    createdAt: now,
    updatedAt: now,
  });
  await store.saveKnowledgeSourceDefinition({
    id: "engineering-handbook",
    name: "Engineering Handbook",
    description: "Approved engineering standards and operational runbooks.",
    vectorStoreId: "vs_engineering_handbook",
    provider: "openai",
    credentialReference: "",
    status: "REGISTERED",
    lastReconciliationError: null,
    topK: 8,
  });
  const runner = runnerAdapter();
  const litellm = liteLLMAdapter();
  const service = new AgentService(store, runner, litellm);
  const policy = await service.accessPolicies.create(
    { name: "Default Instance access", status: "ACTIVE", serverRules: [] },
    "test",
  );
  return { store, runner, litellm, service, policy };
}

async function createConfiguredInstance(
  setup: Awaited<ReturnType<typeof configuredService>>,
  overrides: Partial<CreateAgentInput> = {},
) {
  return setup.service.create({
    name: "Research Assistant",
    description: "",
    runtime: "openshell",
    accessPolicyIds: [setup.policy.id],
    modelRoutingId: "routing-a",
    agentPlatform: "openclaw",
    policyId: "restricted",
    systemPrompt: "Research the request and report the resulting evidence.",
    knowledgeSourceIds: ["engineering-handbook"],
    ...overrides,
  });
}

describe("Instance Access Policy lifecycle", () => {
  it("provisions native Memory without adding an embedding model to the Instance key", async () => {
    const setup = await configuredService();
    const agent = await createConfiguredInstance(setup, {
      memory: { mode: "native", citations: "auto" },
    });

    expect(agent.memory).toEqual({ mode: "native", citations: "auto" });
    expect(setup.runner.createSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        memory: { mode: "native", citations: "auto" },
      }),
    );
    expect(
      vi.mocked(setup.litellm.createInstanceServiceAccountKey!).mock.calls[0]![0]
        .models,
    ).not.toContain("tali/provider-a/text-embedding-3-small");
  });

  it("binds a validated same-boundary embedding model for hybrid Memory", async () => {
    const setup = await configuredService();
    const now = new Date().toISOString();
    const embeddingModelDeploymentId = "22222222-2222-4222-8222-222222222222";
    await setup.store.saveModelDeployment({
      id: embeddingModelDeploymentId,
      providerAccountId: "provider-a",
      modelId: "text-embedding-3-small",
      displayName: "Text Embedding 3 Small",
      modelType: "text-embedding",
      capabilities: [],
      inputModalities: ["text"],
      outputModalities: ["embedding"],
      providerPresetId: "deepseek",
      providerName: "DeepSeek",
      endpoint: "https://api.deepseek.com/v1",
      complianceDomain: "GLOBAL",
      endpointRegion: "global",
      crossBorderTransfer: false,
      litellmModelName: "tali/provider-a/text-embedding-3-small",
      status: "VALIDATED",
      checks: [],
      validationMessage: "Ready",
      validatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await createConfiguredInstance(setup, {
      memory: {
        mode: "hybrid",
        embeddingModelDeploymentId,
        includeSessionTranscripts: true,
        citations: "auto",
        maxResults: 6,
        minScore: 0.35,
      },
    });

    expect(
      vi.mocked(setup.litellm.createInstanceServiceAccountKey!).mock.calls[0]![0]
        .models,
    ).toContain("tali/provider-a/text-embedding-3-small");
    expect(setup.runner.createSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        memory: {
          mode: "hybrid",
          embeddingModel: "tali/provider-a/text-embedding-3-small",
          includeSessionTranscripts: true,
          citations: "auto",
          maxResults: 6,
          minScore: 0.35,
        },
      }),
    );
  });

  it("creates and revokes an Instance Service Account Key under the Project Team", async () => {
    const setup = await configuredService();
    const agent = await createConfiguredInstance(setup);

    expect(setup.litellm.createInstanceServiceAccountKey).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team-a",
        models: ["tali-routing-routing-a", "tali/provider-a/deepseek-chat"],
        aliases: {
          "tali-routing-routing-a": "tali/provider-a/deepseek-chat",
        },
        routerSettings: {
          num_retries: 2,
        },
        metadata: expect.objectContaining({
          tali_project_id: "individual",
          tali_instance_id: agent.id,
        }),
        objectPermissions: expect.objectContaining({
          vectorStores: ["vs_engineering_handbook"],
        }),
      }),
    );
    const keyInput = vi.mocked(setup.litellm.createInstanceServiceAccountKey!)
      .mock.calls[0]![0];
    expect(keyInput.metadata).toEqual({
      managed_by: "tali",
      tali_project_id: "individual",
      tali_instance_id: agent.id,
      service_account_id: `tali-instance-${agent.id}`,
    });
    expect(setup.runner.createSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-instance-service-account",
        inferenceEndpoint: "http://litellm:4000/v1",
      }),
    );
    expect(setup.runner.createSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        policyYaml: expect.stringContaining("/dev/null"),
      }),
    );
    expect((await setup.store.get(agent.id))?.accessPolicyIds).toEqual([
      setup.policy.id,
    ]);
    const attribution = await setup.store
      .database()
      .costAttributionMappingRecord.findFirst({
        where: { projectId: setup.store.projectId, instanceId: agent.id },
      });
    expect(attribution?.environmentId).toBe("project-default");

    await setup.service.destroy(agent.id);
    await vi.waitFor(() =>
      expect(setup.litellm.revokeKey).toHaveBeenCalledWith(
        "instance-hashed-token",
      ),
    );
  });

  it("accepts deletion before background runtime cleanup completes", async () => {
    const setup = await configuredService();
    const agent = await createConfiguredInstance(setup);
    let finishRuntimeCleanup!: (sandbox: RunnerSandbox) => void;
    vi.mocked(setup.runner.destroySandbox).mockReturnValueOnce(
      new Promise((resolve) => {
        finishRuntimeCleanup = resolve;
      }),
    );

    await expect(setup.service.destroy(agent.id)).resolves.toBe(true);
    expect((await setup.store.get(agent.id))?.status).toBe("DESTROYING");
    expect(setup.litellm.revokeKey).not.toHaveBeenCalled();

    finishRuntimeCleanup({
      name: agent.sandboxName,
      agentPlatform: agent.agentPlatform,
      phase: "NOT_FOUND",
      logs: [],
    });
    await vi.waitFor(async () => {
      expect(await setup.store.get(agent.id)).toBeUndefined();
    });
  });

  it("updates permissions without recreating the Sandbox", async () => {
    const setup = await configuredService();
    const agent = await createConfiguredInstance(setup);
    const replacement = await setup.service.accessPolicies.create(
      { name: "Restricted replacement", status: "ACTIVE", serverRules: [] },
      "test",
    );

    const updated = await setup.service.updateAccessPolicies(
      agent.id,
      [replacement.id],
      "Security Admin",
    );

    expect(updated.accessPolicyIds).toEqual([replacement.id]);
    expect((await setup.store.get(agent.id))?.accessPolicyIds).toEqual([
      replacement.id,
    ]);
    const binding =
      await setup.store.database().agentInstanceAccessPolicyBindingRecord.findFirst({
        where: { projectId: setup.store.projectId, instanceId: agent.id },
      });
    expect(binding?.boundBy).toBe("Security Admin");
    expect(setup.litellm.updateInstanceObjectPermissions).toHaveBeenCalledWith(
      "instance-hashed-token",
      expect.objectContaining({
        mcpServers: [],
        vectorStores: ["vs_engineering_handbook"],
      }),
    );
    expect(setup.runner.createSandbox).toHaveBeenCalledTimes(1);
    expect(setup.runner.destroySandbox).not.toHaveBeenCalled();
  });

  it("revokes the LiteLLM key and removes the partial Instance when binding persistence fails", async () => {
    const setup = await configuredService();
    vi.spyOn(setup.store, "replaceAgentAccessPolicies").mockRejectedValueOnce(
      new Error("binding write failed"),
    );

    await expect(createConfiguredInstance(setup)).rejects.toThrow(
      "binding write failed",
    );
    expect(setup.litellm.revokeKey).toHaveBeenCalledWith(
      "instance-hashed-token",
    );
    expect(await setup.store.list()).toEqual([]);
    expect(setup.runner.createSandbox).not.toHaveBeenCalled();
  });

  it("binds the Model Routing selected for the Instance", async () => {
    const setup = await configuredService();
    const projectDefault = await setup.store.getModelRouting("routing-a");
    expect(projectDefault).toBeDefined();
    await setup.store.saveModelRouting({
      ...projectDefault!,
      id: "routing-selected",
      name: "Selected inference",
      publicModelAlias: "tali-routing-routing-selected",
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const agent = await createConfiguredInstance(setup, {
      modelRoutingId: "routing-selected",
    });

    expect(agent.modelRoutingId).toBe("routing-selected");
    expect(agent.model).toBe("tali-routing-routing-selected");
    expect(agent.modelRoutingBindingId).toBe(
      "instance-selected:routing-selected",
    );
    expect(
      vi.mocked(setup.litellm.createInstanceServiceAccountKey!).mock.calls[0]![0]
        .models,
    ).toContain("tali-routing-routing-selected");
  });

  it("uses the Routing referenced by the Instance even if Project defaults conflict", async () => {
    const setup = await configuredService();
    const ready = await setup.store.getModelRouting("routing-a");
    expect(ready).toBeDefined();
    await setup.store.saveModelRouting({
      ...ready!,
      id: "routing-b",
      name: "Degraded duplicate default",
      status: "DEGRADED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const agent = await createConfiguredInstance(setup);

    expect(agent.modelRoutingId).toBe("routing-a");
    expect(setup.litellm.createInstanceServiceAccountKey).toHaveBeenCalledOnce();
    expect(setup.runner.createSandbox).toHaveBeenCalledOnce();
  });
});
