import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { LiteLLMAdminClient } from "../providers/litellm-client";
import { ProjectQuotaService } from "../quotas/project-quota-service";
import { createTestStore } from "../test/store";
import type { SecretStore } from "../secrets/secret-store";
import { ResourceCatalogService } from "./resource-catalog-service";

function adapter(
  overrides: Partial<LiteLLMAdminClient> = {},
): LiteLLMAdminClient {
  return {
    baseUrl: "http://litellm.test",
    registerModel: vi.fn(),
    deleteModel: vi.fn(),
    probeModel: vi.fn(),
    createInstanceKey: vi.fn(),
    revokeKey: vi.fn(),
    listSpendLogs: vi.fn(async () => []),
    ensureProjectTeam: vi.fn(async () => "team-project"),
    updateProjectObjectPermissions: vi.fn(async () => undefined),
    registerMcpServer: vi.fn(async () => undefined),
    updateMcpServer: vi.fn(async () => undefined),
    deleteMcpServer: vi.fn(async () => undefined),
    discoverMcpTools: vi.fn(async () => [
      {
        name: "search_documents",
        description: "Search approved documents.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
        },
        annotations: { readOnlyHint: true },
        discoveredAt: "2026-07-25T00:00:00.000Z",
      },
    ]),
    registerVectorStore: vi.fn(async () => undefined),
    updateVectorStore: vi.fn(async () => undefined),
    deleteVectorStore: vi.fn(async () => undefined),
    ...overrides,
  };
}

function serviceWithAdapter(overrides: Partial<LiteLLMAdminClient> = {}) {
  const store = createTestStore();
  const litellm = adapter(overrides);
  return {
    store,
    litellm,
    service: new ResourceCatalogService(
      store,
      new ProjectQuotaService(store, litellm),
      litellm,
    ),
  };
}

const connection = {
  name: "Document Search MCP",
  alias: "document_search",
  description: "Search the Project's approved document collection.",
  category: "Knowledge",
  endpoint: "https://mcp.example.test/mcp",
  transport: "http" as const,
  authType: "none" as const,
  authReference: "",
  args: [],
  environment: [],
  accessGroups: ["knowledge-read"],
  allowedTools: [],
  extraHeaders: [],
  staticHeaders: [],
  internalNetworkOnly: true,
};

describe("ResourceCatalogService", () => {
  it("loads PostgreSQL catalog defaults and curated MCP templates", async () => {
    const service = new ResourceCatalogService(createTestStore());
    const catalog = await service.catalog();

    expect(catalog.skills).toHaveLength(15);
    expect(catalog.skills[0]).not.toHaveProperty("bindings");
    expect(
      catalog.skills.filter((skill) =>
        skill.compatibleAgents.includes("openai"),
      ).length,
    ).toBeGreaterThan(0);
    expect(catalog.skills.map((skill) => skill.name)).toEqual(
      expect.arrayContaining([
        "Helm Chart Developer",
        "Kubernetes Expert",
        "OCP Expert",
      ]),
    );
    expect(catalog.mcpServers).toEqual([]);
    expect(catalog.knowledgeSources).toEqual([]);
    expect(
      catalog.specializations.find((item) => item.id === "hr"),
    ).toMatchObject({
      defaultSkillIds: [
        "employee-policy-search",
        "document-summarization",
        "onboarding-guidance",
      ],
      defaultMcpServerIds: [],
      defaultKnowledgeSourceIds: [],
    });
    const availableSkillIds = new Set(catalog.skills.map((item) => item.id));
    const availableMcpServerIds = new Set(
      catalog.mcpServers.map((item) => item.id),
    );
    const availableKnowledgeSourceIds = new Set(
      catalog.knowledgeSources.map((item) => item.id),
    );
    for (const role of catalog.specializations) {
      expect(role.defaultSkillIds.every((id) => availableSkillIds.has(id))).toBe(true);
      expect(
        role.defaultMcpServerIds.every((id) => availableMcpServerIds.has(id)),
      ).toBe(true);
      expect(
        role.defaultKnowledgeSourceIds.every((id) =>
          availableKnowledgeSourceIds.has(id),
        ),
      ).toBe(true);
    }
    expect(catalog.mcpServerTemplates.map((template) => template.name)).toEqual(
      expect.arrayContaining([
        "Cloudflare Documentation",
        "Context7 Documentation",
        "DeepWiki Public Repositories",
        "GitHub",
        "Atlassian (Jira & Confluence)",
        "PostgreSQL",
        "MySQL",
        "Redis",
      ]),
    );
    expect(
      catalog.mcpServerTemplates.filter(
        (template) => template.category === "Example",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "cloudflare-docs",
          endpointPlaceholder: "https://docs.mcp.cloudflare.com/mcp",
          defaultAuthType: "none",
        }),
        expect.objectContaining({
          id: "context7-docs",
          endpointPlaceholder: "https://mcp.context7.com/mcp",
          defaultAuthType: "none",
        }),
        expect.objectContaining({
          id: "deepwiki",
          endpointPlaceholder: "https://mcp.deepwiki.com/mcp",
          defaultAuthType: "none",
        }),
      ]),
    );
    expect(
      Object.fromEntries(
        catalog.mcpServerTemplates.map((template) => [
          template.id,
          template.logo,
        ]),
      ),
    ).toMatchObject({
      postgresql: "postgresql",
      mysql: "mysql",
      redis: "redis",
      slack: "slack",
    });
  });

  it("verifies and returns an immutable PostgreSQL Skill archive", async () => {
    const store = createTestStore();
    const service = new ResourceCatalogService(store);
    const skill = (await service.catalog()).skills.find(
      (candidate) => candidate.id === "document-summarization",
    )!;
    const archive = Buffer.from("test-vendor-skill-archive");
    const digest = `sha256:${createHash("sha256").update(archive).digest("hex")}`;
    vi.spyOn(store, "getSkillArtifact").mockResolvedValue({
      id: `${skill.id}@${skill.version}`,
      skillId: skill.id,
      version: skill.version,
      digest,
      archiveFormat: "tar+gzip",
      contentType: "application/gzip",
      archive: new Uint8Array(archive),
      compressedSizeBytes: archive.length,
      unpackedSizeBytes: archive.length,
      fileCount: 1,
      manifest: {},
      sourcePath: "skills/vendor/dist/test.tar.gz",
      createdAt: new Date(),
    });
    await service.updateSkill(skill.id, {
      ...skill,
      digest,
      endpoint: `tali+postgresql://skill-artifacts/${skill.id}/${skill.version}`,
    });

    await expect(service.verifySkillArtifact(skill.id)).resolves.toMatchObject({
      id: skill.id,
      digest,
    });
    await expect(service.skillArtifact(skill.id)).resolves.toMatchObject({
      contentType: "application/gzip",
      digest,
      fileName: `${skill.id}-${skill.version}.tar.gz`,
    });
  });

  it("persists project changes without overwriting them when defaults are seeded again", async () => {
    const store = createTestStore();
    const service = new ResourceCatalogService(store);
    const current = (await service.catalog()).skills.find(
      (skill) => skill.id === "helm-chart-developer",
    )!;

    await service.updateSkill(current.id, {
      ...current,
      name: "Helm Platform Developer",
    });
    const restarted = new ResourceCatalogService(store);

    expect(
      (await restarted.catalog()).skills.find(
        (skill) => skill.id === current.id,
      )?.name,
    ).toBe("Helm Platform Developer");
  });

  it("creates and removes project resources while protecting Role references", async () => {
    const service = new ResourceCatalogService(createTestStore());
    const created = await service.createSkill({
      name: "Release Notes Writer",
      description:
        "Draft structured release notes from approved change records.",
      problemStatement:
        "Release information is scattered across change records and is difficult to summarize consistently.",
      useCases: [
        "Prepare release notes for a deployment",
        "Summarize approved product changes",
      ],
      usageGuide:
        "Attach the Skill to a coding Agent and provide the approved change records as input.",
      author: "Developer Experience",
      category: "Developer Tools",
      trustLevel: "UNSAFE",
      compatibleAgents: ["openclaw", "claude-code"],
      version: "1.0.0",
      endpoint: "https://skills.internal.example/release-notes.tar.zst",
      digest: "Pending source check",
      owner: "Current project",
      permissions: 0,
      status: "DRAFT",
    });

    expect(created).toMatchObject({
      trustLevel: "UNSAFE",
      compatibleAgents: ["openclaw", "claude-code"],
      author: "Developer Experience",
    });
    expect(created.updatedAt).toEqual(expect.any(String));
    expect(await service.delete("skills", created.id)).toBe(true);
    await expect(service.delete("skills", "kubernetes-expert")).rejects.toThrow(
      "assigned to a Role or Instance",
    );
  });

  it("registers with LiteLLM, snapshots tools, and binds the Project Team", async () => {
    const { service, store, litellm } = serviceWithAdapter();
    const created = await service.createMcpServer(connection);

    expect(created.status).toBe("HEALTHY");
    expect(created.tools.map((tool) => tool.name)).toEqual([
      "search_documents",
    ]);
    expect(created.litellmServerId).toMatch(/^tali_[a-f0-9]{10}_/);
    expect(litellm.registerMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        serverId: created.litellmServerId,
        alias: "document_search",
        availableOnPublicInternet: false,
      }),
    );
    expect(litellm.updateProjectObjectPermissions).toHaveBeenCalledWith(
      "team-project",
      { mcpServers: [created.litellmServerId], vectorStores: [] },
    );
    expect(
      await store.database().mcpToolRecord.count({
        where: { projectId: store.projectId, mcpServerId: created.id },
      }),
    ).toBe(1);
  });

  it("keeps the last successful tool snapshot when LiteLLM refresh fails", async () => {
    let attempt = 0;
    const { service } = serviceWithAdapter({
      discoverMcpTools: vi.fn(async () => {
        attempt += 1;
        if (attempt > 1) throw new Error("LiteLLM MCP endpoint unavailable");
        return [
          {
            name: "read_document",
            inputSchema: { type: "object", properties: {} },
            discoveredAt: "2026-07-25T00:00:00.000Z",
          },
        ];
      }),
    });
    const created = await service.createMcpServer(connection);
    const refreshed = await service.discoverMcpServer(created.id);

    expect(refreshed.status).toBe("UNAVAILABLE");
    expect(refreshed.lastDiscoveryError).toContain(
      "LiteLLM MCP endpoint unavailable",
    );
    expect(refreshed.tools.map((tool) => tool.name)).toEqual(["read_document"]);
    expect(refreshed.lastDiscoveredAt).toBe(created.lastDiscoveredAt);
  });

  it("rejects arbitrary stdio commands before they reach the LiteLLM host", async () => {
    const { service, litellm } = serviceWithAdapter();

    await expect(
      service.createMcpServer({
        ...connection,
        name: "Unreviewed local process",
        alias: "unreviewed_process",
        transport: "stdio",
        endpoint: undefined,
        command: "node",
        args: ["malicious.js"],
      }),
    ).rejects.toThrow("reviewed built-in MCP Server template");
    expect(litellm.registerMcpServer).not.toHaveBeenCalled();
  });

  it("registers a Knowledge Base as a LiteLLM Vector Store and adds it to the Project Team", async () => {
    const { service, litellm } = serviceWithAdapter();
    const created = await service.createKnowledgeSource({
      name: "Engineering Handbook",
      description: "Approved engineering standards and operational runbooks.",
      vectorStoreId: "vs_engineering_handbook",
      provider: "openai",
      topK: 8,
      credentialReference: "",
    });

    expect(created.status).toBe("REGISTERED");
    expect(litellm.registerVectorStore).toHaveBeenCalledWith(
      expect.objectContaining({
        vectorStoreId: "vs_engineering_handbook",
        provider: "openai",
        metadata: expect.objectContaining({
          tali_project_id: "individual",
          top_k: 8,
        }),
      }),
    );
    expect(litellm.updateProjectObjectPermissions).toHaveBeenLastCalledWith(
      "team-project",
      { mcpServers: [], vectorStores: ["vs_engineering_handbook"] },
    );
  });

  it("registers the native LiteLLM PGVector connector", async () => {
    const store = createTestStore();
    const litellm = adapter();
    const secrets: SecretStore = {
      put: vi.fn(),
      get: vi.fn(async () => "pgvector-secret"),
      delete: vi.fn(),
    };
    const service = new ResourceCatalogService(
      store,
      new ProjectQuotaService(store, litellm),
      litellm,
      secrets,
    );

    const created = await service.createKnowledgeSource({
      name: "Product documentation",
      description: "Product documentation indexed in PostgreSQL with pgvector.",
      vectorStoreId: "vs_product_docs",
      provider: "pg_vector",
      apiBase: "https://pgvector.example.test",
      topK: 6,
      credentialReference: "k8s://tasklattice/pgvector#API_KEY",
    });

    expect(created.status).toBe("REGISTERED");
    expect(litellm.registerVectorStore).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "pg_vector",
        litellmParams: {
          api_base: "https://pgvector.example.test",
          api_key: "pgvector-secret",
        },
      }),
    );
  });

  it("registers Elasticsearch through the authenticated TaskLattice bridge", async () => {
    const store = createTestStore();
    const litellm = adapter();
    const secrets: SecretStore = {
      put: vi.fn(),
      get: vi.fn(async () => "elastic-api-key"),
      delete: vi.fn(),
    };
    const service = new ResourceCatalogService(
      store,
      new ProjectQuotaService(store, litellm),
      litellm,
      secrets,
    );

    const created = await service.createKnowledgeSource({
      name: "Search knowledge",
      description:
        "Operational knowledge indexed for Elasticsearch semantic search.",
      vectorStoreId: "knowledge-chunks",
      provider: "elasticsearch",
      apiBase: "https://elastic.example.test",
      semanticField: "content_semantic",
      contentField: "content",
      topK: 10,
      credentialReference: "k8s://tasklattice/elasticsearch#API_KEY",
    });

    expect(created.status).toBe("REGISTERED");
    expect(litellm.registerVectorStore).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "pg_vector",
        metadata: expect.objectContaining({
          tasklattice_provider: "elasticsearch",
        }),
        litellmParams: expect.objectContaining({
          api_base:
            "http://127.0.0.1:8080/api/internal/vector-stores/individual",
          api_key: expect.any(String),
        }),
      }),
    );
    expect(secrets.get).not.toHaveBeenCalled();
  });
});
