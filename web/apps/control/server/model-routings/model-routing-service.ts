import { createHash, randomUUID } from "node:crypto";
import type {
  ComplianceDomain,
  CreateModelRoutingInput,
  InferenceGateway,
  ModelDeployment,
  ModelRouting,
  ModelRoutingAuditEvent,
  ModelRoutingBinding,
  ModelRoutingPolicy,
  UpdateModelRoutingInput,
} from "@tasklattice/contracts";
import { ProjectStore } from "../projects/project-store";
import {
  LiteLLMClient,
  type LiteLLMAdminClient,
  type LiteLLMModelRoutingRouteInput,
} from "../providers/litellm-client";

const defaultCapabilities = {
  automaticRouting: "UNKNOWN",
  routerType: "UNKNOWN",
  sessionAffinity: "UNKNOWN",
  adaptiveRouting: "UNKNOWN",
  failover: "UNKNOWN",
  generalFallback: "UNKNOWN",
  contextWindowFallback: "UNKNOWN",
  contentPolicyFallback: "UNKNOWN",
  retries: "UNKNOWN",
  requestAudit: "UNKNOWN",
} as const;

export class ModelRoutingResolver {
  constructor(private readonly store: ProjectStore) {}

  async resolve(id: string): Promise<ModelRouting> {
    const routing = await this.store.getModelRouting(id);
    if (!routing) throw new Error("The selected Routing is unavailable.");
    if (routing.status !== "READY")
      throw new Error(`The selected Routing is ${routing.status.toLowerCase().replaceAll("_", " ")}.`);
    return routing;
  }

  async resolveDefault(): Promise<ModelRouting> {
    const defaults = (await this.store.listModelRoutings()).filter(
      (candidate) => candidate.isDefault,
    );
    if (defaults.length !== 1) {
      throw new Error(
        defaults.length
          ? "Multiple default routing configurations are configured."
          : "No default Routing is configured.",
      );
    }
    const routing = defaults[0]!;
    if (routing.status !== "READY")
      throw new Error(`The default Routing is ${routing.status.toLowerCase().replaceAll("_", " ")}.`);
    return routing;
  }
}

export class ModelRoutingService {
  readonly resolver: ModelRoutingResolver;

  constructor(
    readonly store = new ProjectStore(),
    readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
  ) {
    this.resolver = new ModelRoutingResolver(store);
  }

  async listGateways(): Promise<InferenceGateway[]> {
    await this.ensureDefaultGateway();
    return this.store.listInferenceGateways();
  }

  async list(): Promise<ModelRouting[]> {
    await this.ensureDefaultGateway();
    return Promise.all((await this.store.listModelRoutings()).map((routing) => this.withConsumerCount(routing)));
  }

  async get(id: string): Promise<ModelRouting | undefined> {
    const routing = await this.store.getModelRouting(id);
    return routing ? await this.withConsumerCount(routing) : undefined;
  }

  async create(input: CreateModelRoutingInput, actor = "control-api"): Promise<ModelRouting> {
    await this.ensureDefaultGateway();
    if (!await this.store.getInferenceGateway(input.gatewayId)) throw new Error("Select an available LiteLLM Gateway.");
    const now = new Date().toISOString();
    const id = randomUUID();
    const resolvedRouting = await this.resolveRoutingPolicy(
      id,
      input.routingPolicy,
      input.complianceDomain,
      input.auditPolicy.requestLogs,
    );
    const routing: ModelRouting = {
      id,
      name: input.name,
      description: input.description,
      gatewayId: input.gatewayId,
      managementMode: "LITELLM_MANAGED",
      publicModelAlias: resolvedRouting.alias,
      routingPolicy: input.routingPolicy,
      complianceDomain: input.complianceDomain,
      status: "DRAFT",
      isDefault: false,
      keyPolicy: input.keyPolicy,
      auditPolicy: input.auditPolicy,
      capabilities: defaultCapabilities,
      conditions: [],
      configurationHash: configurationHash(input),
      observedGeneration: 1,
      validationMessage: "Waiting for LiteLLM validation.",
      consumers: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.saveModelRouting(routing);
    await this.audit(routing, "model_routing.created", actor, "SUCCESS", "Routing definition stored.");
    const refreshed = await this.refresh(id, actor);
    const hasDefault = (await this.store.listModelRoutings()).some(
      (candidate) => candidate.isDefault,
    );
    if (refreshed.status === "READY" && (input.isDefault || !hasDefault))
      return this.update(id, { isDefault: true }, actor);
    return refreshed;
  }

  async update(id: string, input: UpdateModelRoutingInput, actor = "control-api"): Promise<ModelRouting> {
    const current = await this.require(id);
    if (input.routingPolicy && input.suspended !== undefined)
      throw new Error("Update routing and lifecycle state in separate operations.");
    if (input.isDefault === false && current.isDefault)
      throw new Error("Choose another default Routing before changing this one.");
    if (input.suspended === true && current.isDefault)
      throw new Error("Choose another default Routing before suspending this one.");
    if (input.isDefault && current.status !== "READY") throw new Error("Only a READY Routing can be the default.");
    const values = withoutUndefined(input);
    const nextRoutingPolicy = values.routingPolicy ?? current.routingPolicy;
    const resolvedRouting = input.routingPolicy
      ? await this.resolveRoutingPolicy(
          current.id,
          input.routingPolicy,
          current.complianceDomain,
          (values.auditPolicy ?? current.auditPolicy).requestLogs,
        )
      : undefined;
    if (
      resolvedRouting
      && resolvedRouting.alias !== current.publicModelAlias
      && (await this.consumers(id)).length
    ) {
      throw new Error("Remove all Consumers before changing the public model alias.");
    }
    const next: ModelRouting = {
      ...current,
      name: values.name ?? current.name,
      description: values.description ?? current.description,
      publicModelAlias: resolvedRouting?.alias ?? current.publicModelAlias,
      routingPolicy: nextRoutingPolicy,
      isDefault: values.isDefault ?? current.isDefault,
      keyPolicy: values.keyPolicy ?? current.keyPolicy,
      auditPolicy: values.auditPolicy ?? current.auditPolicy,
      status: input.routingPolicy
        ? "DRAFT"
        : input.suspended === true
        ? "SUSPENDED"
        : input.suspended === false && current.status === "SUSPENDED"
          ? "DRAFT"
          : current.status,
      updatedAt: new Date().toISOString(),
      configurationHash: configurationHash({ ...current, ...values }),
      observedGeneration: current.observedGeneration + 1,
      validationMessage: current.validationMessage,
    };
    if (input.isDefault) await this.store.saveDefaultModelRouting(next);
    else await this.store.saveModelRouting(next);
    await this.audit(next, input.suspended === true ? "model_routing.suspended" : "model_routing.updated", actor, "SUCCESS", "Routing policy updated.");
    if (input.routingPolicy) {
      return this.refresh(id, actor);
    }
    return this.withConsumerCount(next);
  }

  async refresh(id: string, actor = "control-api"): Promise<ModelRouting> {
    const current = await this.require(id);
    const gateway = await this.store.getInferenceGateway(current.gatewayId);
    if (!gateway) throw new Error("The Routing gateway is unavailable.");
    if (current.status === "SUSPENDED") throw new Error("Resume the Routing before validating it.");
    await this.store.saveModelRouting({ ...current, status: "VALIDATING", updatedAt: new Date().toISOString() });
    try {
      const resolvedRouting = await this.resolveRoutingPolicy(
        current.id,
        current.routingPolicy,
        current.complianceDomain,
        current.auditPolicy.requestLogs,
      );
      if (resolvedRouting.managedRoute) {
        if (!this.litellm.reconcileModelRoutingRoute)
          throw new Error("The configured LiteLLM adapter does not support managed Router reconciliation.");
        await this.litellm.reconcileModelRoutingRoute(resolvedRouting.managedRoute);
      }
      if (!this.litellm.inspectModelRouting) throw new Error("The configured LiteLLM adapter does not support Router inspection.");
      const inspection = await this.litellm.inspectModelRouting(
        resolvedRouting.managedRoute?.strategy === "SINGLE"
          ? resolvedRouting.managedRoute.defaultModel
          : current.publicModelAlias,
      );
      const conditions: ModelRouting["conditions"] = [];
      conditions.push({ type: "GATEWAY", status: "PASS", reason: `LiteLLM Gateway ${gateway.name} is reachable.` });
      conditions.push({
        type: "BINDING",
        status: inspection.exists ? "PASS" : "FAIL",
        reason: inspection.exists ? `${inspection.modelCount} LiteLLM deployment(s) expose this alias.` : "The public model alias was not found in LiteLLM.",
      });
      const configuredDomains = new Set(inspection.complianceDomains);
      const compliancePass = !inspection.complianceUnknown && configuredDomains.size === 1 && configuredDomains.has(current.complianceDomain);
      conditions.push({
        type: "COMPLIANCE",
        status: inspection.complianceUnknown ? "UNKNOWN" : compliancePass ? "PASS" : "FAIL",
        reason: inspection.complianceUnknown
          ? "One or more LiteLLM deployments do not declare model_info.compliance_domain."
          : compliancePass
            ? `All backing deployments are declared ${current.complianceDomain}.`
            : `Backing deployments do not exclusively match ${current.complianceDomain}.`,
      });
      const routingContractPass = current.routingPolicy.mode !== "COMPLEXITY"
        ? current.routingPolicy.mode !== "SEMANTIC"
          || (
            inspection.capabilities.automaticRouting === "ENABLED"
            && inspection.capabilities.routerType === "SEMANTIC_ROUTER"
            && inspection.capabilities.semanticRouteCount
              === current.routingPolicy.routes.length
          )
        : (
            inspection.capabilities.automaticRouting === "ENABLED"
            && inspection.capabilities.routerType === "COMPLEXITY_ROUTER"
            && inspection.capabilities.complexityTierCount === 4
          );
      conditions.push({
        type: "CAPABILITY",
        status: inspection.unsupportedReason || !routingContractPass ? "FAIL" : "PASS",
        reason: inspection.unsupportedReason
          ?? (routingContractPass
            ? "Routing capabilities match the stored Routing policy."
            : "The effective LiteLLM Router does not match the stored complexity policy."),
      });
      const status: ModelRouting["status"] = inspection.unsupportedReason
        ? "UNSUPPORTED"
        : !inspection.exists
          ? "DEGRADED"
          : !compliancePass
            ? "NON_COMPLIANT"
            : !routingContractPass
              ? "DEGRADED"
            : "READY";
      const nextConfigurationHash = configurationHash({
        gatewayId: current.gatewayId,
        publicModelAlias: current.publicModelAlias,
        routingPolicy: current.routingPolicy,
        complianceDomain: current.complianceDomain,
        keyPolicy: current.keyPolicy,
        auditPolicy: current.auditPolicy,
        liteLLM: inspection.configurationHash,
      });
      const next = await this.store.saveModelRouting({
        ...current,
        status,
        isDefault: current.isDefault,
        capabilities: inspection.capabilities,
        conditions,
        configurationHash: nextConfigurationHash,
        observedGeneration: current.configurationHash === nextConfigurationHash
          ? current.observedGeneration
          : current.observedGeneration + 1,
        validationMessage: conditions.find((condition) => condition.status !== "PASS")?.reason ?? "LiteLLM binding is ready.",
        ...(inspection.version ? { liteLLMVersion: inspection.version } : {}),
        lastSynchronizedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await this.store.saveInferenceGateway({
        ...gateway,
        status: "READY",
        validationMessage: "LiteLLM management API is reachable.",
        validatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const changed = current.status !== next.status || JSON.stringify(current.capabilities) !== JSON.stringify(next.capabilities) || JSON.stringify(current.conditions) !== JSON.stringify(next.conditions);
      if (changed) await this.audit(next, "model_routing.sync_changed", actor, "SUCCESS", "Effective LiteLLM status or capabilities changed.");
      await this.audit(next, status === "NON_COMPLIANT" ? "model_routing.compliance_failed" : "model_routing.validated", actor, status === "READY" ? "SUCCESS" : "FAILED", conditions.find((condition) => condition.status !== "PASS")?.reason ?? "Binding is ready.");
      return this.withConsumerCount(next);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "LiteLLM validation failed.";
      const next = await this.store.saveModelRouting({
        ...current,
        status: "DEGRADED",
        isDefault: current.isDefault,
        capabilities: defaultCapabilities,
        conditions: [{ type: "GATEWAY", status: "FAIL", reason }],
        validationMessage: reason,
        lastSynchronizedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await this.store.saveInferenceGateway({
        ...gateway,
        status: "DEGRADED",
        validationMessage: reason,
        validatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await this.audit(next, "model_routing.validated", actor, "FAILED", reason);
      return this.withConsumerCount(next);
    }
  }

  async bindAgent(agentId: string, modelRoutingId: string): Promise<{ binding: ModelRoutingBinding; routing: ModelRouting; gateway: InferenceGateway; secret: string }> {
    await this.ensureDefaultGateway();
    let routing = await this.resolver.resolve(modelRoutingId);
    const gateway = await this.store.getInferenceGateway(routing.gatewayId);
    if (!gateway) throw new Error("The Routing gateway is unavailable.");
    if (!routing.conditions.some((condition) => condition.type === "COMPLIANCE" && condition.status === "PASS"))
      throw new Error("The Routing compliance validation is not current.");
    if (!this.litellm.createModelRoutingKey || !this.litellm.createModelRoutingTeam)
      throw new Error("The LiteLLM adapter does not support Team-scoped Virtual Keys.");
    let teamId = routing.liteLLMTeamId;
    if (!teamId) {
      teamId = await this.litellm.createModelRoutingTeam({
        alias: `tasklattice-${routing.id}`,
        modelAlias: routing.publicModelAlias,
        modelRoutingId: routing.id,
        complianceDomain: routing.complianceDomain,
      });
      routing = await this.store.saveModelRouting({ ...routing, liteLLMTeamId: teamId, updatedAt: new Date().toISOString() });
    }
    const keyAlias = `tasklattice/${routing.id.slice(0, 8)}/${agentId.slice(0, 8)}`;
    const key = await this.litellm.createModelRoutingKey({
      agentId,
      alias: keyAlias,
      modelAlias: routing.publicModelAlias,
      teamId,
      modelRoutingId: routing.id,
      complianceDomain: routing.complianceDomain,
    });
    const now = new Date().toISOString();
    const binding: ModelRoutingBinding = {
      id: randomUUID(),
      modelRoutingId: routing.id,
      agentId,
      liteLLMTeamId: teamId,
      liteLLMTokenId: key.tokenId,
      keyAlias,
      keyFingerprint: fingerprint(key.secret),
      status: "ACTIVE",
      createdAt: now,
    };
    await this.store.saveModelRoutingBinding(binding);
    await this.audit(routing, "model_routing_binding.created", "agent-service", "SUCCESS", "Per-Instance Team-scoped Virtual Key created.", agentId);
    await this.audit(routing, "virtual_key.created", "agent-service", "SUCCESS", `Virtual Key fingerprint ${binding.keyFingerprint}.`, agentId);
    return { binding, routing: await this.withConsumerCount(routing), gateway, secret: key.secret };
  }

  async unbindAgent(agentId: string): Promise<void> {
    const binding = await this.store.getModelRoutingBindingForAgent(agentId);
    if (!binding || binding.status === "REVOKED") return;
    const routing = await this.require(binding.modelRoutingId);
    await this.litellm.revokeKey(binding.liteLLMTokenId);
    await this.store.saveModelRoutingBinding({ ...binding, status: "REVOKED", revokedAt: new Date().toISOString() });
    await this.audit(routing, "model_routing_binding.revoked", "agent-service", "SUCCESS", "Instance binding revoked.", agentId);
    await this.audit(routing, "virtual_key.revoked", "agent-service", "SUCCESS", `Virtual Key fingerprint ${binding.keyFingerprint}.`, agentId);
  }

  async consumers(id: string): Promise<ModelRoutingBinding[]> {
    await this.require(id);
    return (await this.store.listModelRoutingBindings(id)).filter((binding) => binding.status === "ACTIVE");
  }

  async auditEvents(id: string): Promise<ModelRoutingAuditEvent[]> {
    await this.require(id);
    return this.store.listModelRoutingAudit(id);
  }

  async delete(id: string, actor = "control-api"): Promise<void> {
    const routing = await this.require(id);
    if (routing.isDefault)
      throw new Error("Choose another default Routing before deleting this one.");
    if ((await this.consumers(id)).length) throw new Error("Remove all Consumers before deleting this Routing.");
    if (!this.litellm.deleteModelRoutingRoute)
      throw new Error("The configured LiteLLM adapter does not support managed Router deletion.");
    await this.litellm.deleteModelRoutingRoute(routing.publicModelAlias, routing.id);
    if (routing.liteLLMTeamId && this.litellm.deleteModelRoutingTeam)
      await this.litellm.deleteModelRoutingTeam(routing.liteLLMTeamId);
    await this.audit(routing, "model_routing.deleted", actor, "SUCCESS", "Routing deleted.");
    await this.store.deleteModelRouting(id);
  }

  private async ensureDefaultGateway(): Promise<void> {
    if ((await this.store.listInferenceGateways()).length) return;
    const now = new Date().toISOString();
    await this.store.saveInferenceGateway({
      id: "litellm-default",
      name: "Primary LiteLLM Gateway",
      baseUrl: this.litellm.baseUrl,
      adminUiUrl: trustedAdminUiUrl(undefined, this.litellm.baseUrl),
      credentialSource: "ENVIRONMENT",
      status: "UNKNOWN",
      validationMessage: "The gateway has not been validated yet.",
      createdAt: now,
      updatedAt: now,
    });
  }

  private async require(id: string): Promise<ModelRouting> {
    const routing = await this.store.getModelRouting(id);
    if (!routing) throw new Error("Routing not found.");
    return routing;
  }

  private async resolveRoutingPolicy(
    routingId: string,
    policy: ModelRoutingPolicy,
    complianceDomain: ComplianceDomain,
    requestAudit: boolean,
  ): Promise<{ alias: string; managedRoute?: LiteLLMModelRoutingRouteInput }> {
    if (policy.mode === "SINGLE") {
      const deployment = await this.requireRoutingDeployment(
        policy.modelDeploymentId,
        complianceDomain,
        "selected model",
      );
      const fallbacks = await Promise.all(
        policy.fallbackModelDeploymentIds.map((id, index) =>
          this.requireRoutingDeployment(
            id,
            complianceDomain,
            `fallback ${index + 1}`,
          ),
        ),
      );
      const alias = `tali-routing-${routingId}`;
      return {
        alias,
        managedRoute: {
          strategy: "SINGLE",
          alias,
          modelRoutingId: routingId,
          complianceDomain,
          defaultModel: deployment.litellmModelName,
          fallbackModels: fallbacks.map((model) => model.litellmModelName),
          retries: policy.retries,
          requestAudit,
        },
      };
    }
    const alias = `tali-routing-${routingId}`;
    if (policy.mode === "COMPLEXITY") {
      const simple = await this.requireRoutingDeployment(
        policy.simpleModelDeploymentId,
        complianceDomain,
        "simple tier",
      );
      const complex = await this.requireRoutingDeployment(
        policy.complexModelDeploymentId,
        complianceDomain,
        "complex tier",
      );
      const fallbacks = await Promise.all(
        policy.fallbackModelDeploymentIds.map((id, index) =>
          this.requireRoutingDeployment(
            id,
            complianceDomain,
            `fallback ${index + 1}`,
          ),
        ),
      );
      return {
        alias,
        managedRoute: {
          strategy: "COMPLEXITY",
          alias,
          modelRoutingId: routingId,
          complianceDomain,
          tiers: {
            SIMPLE: simple.litellmModelName,
            MEDIUM: simple.litellmModelName,
            COMPLEX: complex.litellmModelName,
            REASONING: complex.litellmModelName,
          },
          defaultModel: simple.litellmModelName,
          fallbackModels: fallbacks.map((model) => model.litellmModelName),
          retries: policy.retries,
          requestAudit,
        },
      };
    }
    const defaultModel = await this.requireRoutingDeployment(
      policy.defaultModelDeploymentId,
      complianceDomain,
      "semantic default",
    );
    const embeddingModel = await this.requireDeployment(
      policy.embeddingModelDeploymentId,
      complianceDomain,
      "semantic embedding model",
      "text-embedding",
    );
    const routes = await Promise.all(
      policy.routes.map(async (route) => {
        const model = await this.requireRoutingDeployment(
          route.modelDeploymentId,
          complianceDomain,
          `${route.intent} intent`,
        );
        return {
          intent: route.intent,
          description: route.description,
          model: model.litellmModelName,
          utterances: route.utterances,
          scoreThreshold: route.scoreThreshold,
        };
      }),
    );
    const fallbacks = await Promise.all(
      policy.fallbackModelDeploymentIds.map((id, index) =>
        this.requireRoutingDeployment(
          id,
          complianceDomain,
          `fallback ${index + 1}`,
        ),
      ),
    );
    return {
      alias,
      managedRoute: {
        strategy: "SEMANTIC",
        alias,
        modelRoutingId: routingId,
        complianceDomain,
        routes,
        defaultModel: defaultModel.litellmModelName,
        embeddingModel: embeddingModel.litellmModelName,
        fallbackModels: fallbacks.map((model) => model.litellmModelName),
        retries: policy.retries,
        requestAudit,
      },
    };
  }

  private async requireRoutingDeployment(
    id: string,
    complianceDomain: ComplianceDomain,
    role: string,
  ): Promise<ModelDeployment> {
    return this.requireDeployment(id, complianceDomain, role, "llm");
  }

  private async requireDeployment(
    id: string,
    complianceDomain: ComplianceDomain,
    role: string,
    modelType: ModelDeployment["modelType"],
  ): Promise<ModelDeployment> {
    const deployment = await this.store.getModelDeployment(id);
    if (!deployment)
      throw new Error(`The ${role} deployment is not available in this Project.`);
    if (deployment.modelType !== modelType)
      throw new Error(`The ${role} must be a ${modelType} deployment.`);
    if (deployment.status !== "VALIDATED")
      throw new Error(`The ${role} must be validated before it can be routed.`);
    if (deployment.complianceDomain !== complianceDomain)
      throw new Error(`The ${role} does not match the ${complianceDomain} compliance boundary.`);
    return deployment;
  }

  private async withConsumerCount(routing: ModelRouting): Promise<ModelRouting> {
    return { ...routing, consumers: (await this.store.listModelRoutingBindings(routing.id)).filter((binding) => binding.status === "ACTIVE").length };
  }

  private async audit(routing: ModelRouting, type: string, actor: string, result: ModelRoutingAuditEvent["result"], reason: string, agentId?: string): Promise<void> {
    await this.store.appendModelRoutingAudit({
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      actor,
      type,
      modelRoutingId: routing.id,
      ...(agentId ? { agentId } : {}),
      configurationHash: routing.configurationHash,
      complianceDomain: routing.complianceDomain,
      result,
      reason,
    });
  }
}

function configurationHash(input: object): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(sortForHash(input))).digest("hex")}`;
}

function sortForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForHash);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, sortForHash(nested)]));
  return value;
}

function fingerprint(secret: string): string {
  return `sha256:${createHash("sha256").update(secret).digest("hex").slice(0, 12)}`;
}

function withoutUndefined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function trustedAdminUiUrl(configured: string | undefined, baseUrl: string): string {
  const url = configured
    ? new URL(configured)
    : new URL(`${baseUrl.replace(/\/$/, "")}/ui`);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("LITELLM_ADMIN_UI_URL must use HTTP or HTTPS.");
  return url.toString().replace(/\/$/, "");
}

export function complianceDomainsMatch(expected: ComplianceDomain, actual: readonly ComplianceDomain[], hasUnknown: boolean): boolean {
  return !hasUnknown && new Set(actual).size === 1 && actual[0] === expected;
}
