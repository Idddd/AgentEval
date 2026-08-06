import { randomUUID } from "node:crypto";
import type {
  AccessPolicy,
  AccessPolicyDecision,
  AccessPolicyServerRule,
  AccessPolicyVersion,
  Agent,
  CreateAccessPolicyInput,
  KnowledgeSourceDefinition,
  McpServerDefinition,
  UpdateAccessPolicyInput,
} from "@tasklattice/contracts";
import type {
  LiteLLMAdminClient,
  LiteLLMObjectPermissions,
} from "../providers/litellm-client";
import { ProjectStore } from "../projects/project-store";
import { AccessPolicyStore } from "./access-policy-store";

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function resolvedDecision(
  rule: AccessPolicyServerRule,
  toolName: string,
): Exclude<AccessPolicyDecision, "INHERIT"> {
  const decision = rule.tools.find(
    (tool) => tool.toolName === toolName,
  )?.decision;
  return !decision || decision === "INHERIT" ? rule.defaultDecision : decision;
}

export function effectiveInstanceObjectPermissions(
  accessPolicyIds: readonly string[],
  selectedServers: McpServerDefinition[],
  knowledgeSources: KnowledgeSourceDefinition[],
  policies: AccessPolicy[],
): LiteLLMObjectPermissions {
  const active = policies.filter(
    (policy) =>
      policy.status === "ACTIVE" && accessPolicyIds.includes(policy.id),
  );
  const allowedServers: McpServerDefinition[] = [];
  const toolPermissions: Record<string, string[]> = {};

  for (const server of selectedServers) {
    const rules = active.flatMap((policy) =>
      policy.serverRules.filter((rule) => rule.mcpServerId === server.id),
    );
    if (!rules.length) continue;
    const serverCeiling = server.allowedTools.length
      ? new Set(server.allowedTools)
      : undefined;
    const allowedTools = server.tools
      .map((tool) => tool.name)
      .filter((toolName) => !serverCeiling || serverCeiling.has(toolName))
      .filter((toolName) => {
        const decisions = rules.map((rule) => resolvedDecision(rule, toolName));
        return !decisions.includes("DENY") && decisions.includes("ALLOW");
      });
    if (!allowedTools.length) continue;
    allowedServers.push(server);
    toolPermissions[server.litellmServerId] = unique(allowedTools);
  }

  return {
    mcpServers: allowedServers.map((server) => server.litellmServerId),
    mcpAccessGroups: unique(
      allowedServers.flatMap((server) => server.accessGroups),
    ),
    mcpToolPermissions: toolPermissions,
    vectorStores: knowledgeSources.map((source) => source.vectorStoreId),
  };
}

export class AccessPolicyService {
  constructor(
    private readonly store: AccessPolicyStore,
    private readonly projects: ProjectStore,
    private readonly litellm: LiteLLMAdminClient,
  ) {}

  list(): Promise<AccessPolicy[]> {
    return this.store.list();
  }

  async get(id: string): Promise<AccessPolicy> {
    const policy = await this.store.get(id);
    if (!policy) throw new Error("Access Policy not found.");
    return policy;
  }

  async create(
    input: CreateAccessPolicyInput,
    actor: string,
  ): Promise<AccessPolicy> {
    await this.validate(input);
    const policies = await this.store.list();
    if (
      policies.some(
        (policy) => policy.name.toLowerCase() === input.name.toLowerCase(),
      )
    )
      throw new Error("An Access Policy with this name already exists.");
    const now = new Date().toISOString();
    const policy: AccessPolicy = {
      ...input,
      id: randomUUID(),
      revision: 1,
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(
      policy,
      this.version(policy, actor, "Policy created."),
    );
    return policy;
  }

  async update(
    id: string,
    input: UpdateAccessPolicyInput,
    actor: string,
  ): Promise<AccessPolicy> {
    const current = await this.get(id);
    const nextInput: CreateAccessPolicyInput = {
      name: input.name ?? current.name,
      status: input.status ?? current.status,
      serverRules: input.serverRules ?? current.serverRules,
    };
    await this.validate(nextInput);
    const policies = await this.store.list();
    if (
      policies.some(
        (policy) =>
          policy.id !== id &&
          policy.name.toLowerCase() === nextInput.name.toLowerCase(),
      )
    )
      throw new Error("An Access Policy with this name already exists.");
    const {
      lastReconciliationError: _lastReconciliationError,
      ...currentWithoutError
    } = current;
    const policy: AccessPolicy = {
      ...currentWithoutError,
      ...nextInput,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.store.save(
      policy,
      this.version(policy, actor, this.changeSummary(current, policy)),
    );
    return current.status === "ACTIVE" || policy.status === "ACTIVE"
      ? this.reconcile(policy)
      : policy;
  }

  versions(id: string): Promise<AccessPolicyVersion[]> {
    return this.store.versions(id);
  }

  async delete(id: string): Promise<boolean> {
    const current = await this.get(id);
    if (current.status === "ACTIVE")
      throw new Error("Deactivate the Access Policy before deleting it.");
    if (
      (await this.projects.list()).some((agent) =>
        agent.accessPolicyIds.includes(id),
      )
    ) {
      throw new Error("Access Policy is in use by an Agent Instance.");
    }
    return this.store.delete(id);
  }

  async assertActivePolicyIds(ids: readonly string[]): Promise<AccessPolicy[]> {
    if (!ids.length) {
      throw new Error("Select at least one Access Policy.");
    }
    if (new Set(ids).size !== ids.length) {
      throw new Error("Access Policy bindings must be unique.");
    }
    const policies = await this.store.list();
    const selected = ids.map((id) =>
      policies.find((policy) => policy.id === id),
    );
    const missing = ids.filter((_id, index) => !selected[index]);
    if (missing.length) {
      throw new Error(`Access Policy not found: ${missing.join(", ")}.`);
    }
    const inactive = selected.filter((policy): policy is AccessPolicy =>
      Boolean(policy && policy.status !== "ACTIVE"),
    );
    if (inactive.length) {
      throw new Error(
        `Access Policy must be Active: ${inactive.map((policy) => policy.name).join(", ")}.`,
      );
    }
    return selected as AccessPolicy[];
  }

  async permissionsForAgent(
    agent: Pick<
      Agent,
      "accessPolicyIds" | "mcpServerIds" | "knowledgeSourceIds"
    >,
  ): Promise<LiteLLMObjectPermissions> {
    const [servers, sources, policies] = await Promise.all([
      this.projects.listMcpServerDefinitions(),
      this.projects.listKnowledgeSourceDefinitions(),
      this.store.list(),
    ]);
    return effectiveInstanceObjectPermissions(
      agent.accessPolicyIds,
      servers.filter((server) =>
        (agent.mcpServerIds ?? []).includes(server.id),
      ),
      sources.filter((source) =>
        (agent.knowledgeSourceIds ?? []).includes(source.id),
      ),
      policies,
    );
  }

  private async validate(input: CreateAccessPolicyInput): Promise<void> {
    const servers = await this.projects.listMcpServerDefinitions();
    const knownServers = new Map(servers.map((server) => [server.id, server]));
    if (
      new Set(input.serverRules.map((rule) => rule.mcpServerId)).size !==
      input.serverRules.length
    )
      throw new Error(
        "Each MCP server may appear only once in an Access Policy.",
      );
    for (const rule of input.serverRules) {
      const server = knownServers.get(rule.mcpServerId);
      if (!server)
        throw new Error(`MCP server not found: ${rule.mcpServerId}.`);
      if (
        new Set(rule.tools.map((tool) => tool.toolName)).size !==
        rule.tools.length
      )
        throw new Error(`Tool rules for ${server.name} must be unique.`);
      const discovered = new Set(server.tools.map((tool) => tool.name));
      const missingTools = rule.tools
        .map((tool) => tool.toolName)
        .filter((name) => !discovered.has(name));
      if (missingTools.length)
        throw new Error(
          `Discovered MCP tools not found on ${server.name}: ${missingTools.join(", ")}.`,
        );
    }
  }

  private async reconcile(policy: AccessPolicy): Promise<AccessPolicy> {
    try {
      if (!this.litellm.updateInstanceObjectPermissions)
        throw new Error("LiteLLM key permission updates are unavailable.");
      const agents = (await this.projects.list()).filter(
        (agent) =>
          agent.accessPolicyIds.includes(policy.id) && agent.liteLLMTokenId,
      );
      for (const agent of agents) {
        await this.litellm.updateInstanceObjectPermissions(
          agent.liteLLMTokenId!,
          await this.permissionsForAgent(agent),
        );
      }
      const {
        lastReconciliationError: _lastReconciliationError,
        ...policyWithoutError
      } = policy;
      return this.store.updateReconciliation({
        ...policyWithoutError,
        lastReconciledAt: new Date().toISOString(),
      });
    } catch (error) {
      return this.store.updateReconciliation({
        ...policy,
        lastReconciliationError:
          error instanceof Error
            ? error.message
            : "LiteLLM reconciliation failed.",
      });
    }
  }

  private version(
    policy: AccessPolicy,
    actor: string,
    summary: string,
  ): AccessPolicyVersion {
    return {
      policyId: policy.id,
      revision: policy.revision,
      actor,
      summary,
      snapshot: policy,
      createdAt: policy.updatedAt,
    };
  }

  private changeSummary(current: AccessPolicy, next: AccessPolicy): string {
    const changes = [
      current.status !== next.status ? `Status changed to ${next.status}.` : "",
      JSON.stringify(current.serverRules) !== JSON.stringify(next.serverRules)
        ? "MCP tool rules updated."
        : "",
      current.name !== next.name ? "Policy name updated." : "",
    ].filter(Boolean);
    return changes.join(" ") || "Policy saved.";
  }
}
