import { AgentService } from "./agents/agent-service";
import { AgentGardenService } from "./agent-garden/agent-garden-service";
import { AgentGardenStore } from "./agent-garden/agent-garden-store";
import { AccessPolicyService } from "./access-policies/access-policy-service";
import { AccessPolicyStore } from "./access-policies/access-policy-store";
import { ResourceCatalogService } from "./catalog/resource-catalog-service";
import { ModelRoutingService } from "./model-routings/model-routing-service";
import { PolicyService } from "./policies/policy-service";
import { ProjectStore } from "./projects/project-store";
import { CostService } from "./providers/cost-service";
import { LiteLLMClient } from "./providers/litellm-client";
import { ProviderService } from "./providers/provider-service";
import { ProjectService, type ProjectRole } from "./projects/project-service";
import { ProjectQuotaService } from "./quotas/project-quota-service";
import { AuditLogService } from "./audit-logs/audit-log-service";

interface ProjectServices {
  agent: AgentService;
  agentGarden: AgentGardenService;
  accessPolicies: AccessPolicyService;
  cost: CostService;
  catalog: ResourceCatalogService;
  modelRoutings: ModelRoutingService;
  policies: PolicyService;
  provider: ProviderService;
  quotas: ProjectQuotaService;
  auditLogs: AuditLogService;
}

const litellm = new LiteLLMClient();
const projectService = new ProjectService();
const services = new Map<string, ProjectServices>();

function createServices(projectId: string): ProjectServices {
  const store = new ProjectStore(projectId);
  const policies = new PolicyService(store);
  const modelRoutings = new ModelRoutingService(store, litellm);
  const quotas = new ProjectQuotaService(store, litellm);
  const catalog = new ResourceCatalogService(store, quotas, litellm);
  const accessPolicies = new AccessPolicyService(
    new AccessPolicyStore(projectId, store.database()),
    store,
    litellm,
  );
  return {
    auditLogs: new AuditLogService(projectId, store.database()),
    agent: new AgentService(store, undefined, litellm, policies, catalog, modelRoutings, quotas, accessPolicies),
    agentGarden: new AgentGardenService(
      new AgentGardenStore(projectId, store.database()),
      store,
    ),
    accessPolicies,
    provider: new ProviderService(store, litellm),
    cost: new CostService(store, litellm),
    policies,
    catalog,
    modelRoutings,
    quotas,
  };
}

async function forRequest(request?: Request): Promise<ProjectServices> {
  const projectId = request
    ? (await projectService.resolve(request)).projectId
    : "individual";
  return forProject(projectId);
}

function forProject(projectId: string): ProjectServices {
  let scoped = services.get(projectId);
  if (!scoped) {
    scoped = createServices(projectId);
    services.set(projectId, scoped);
  }
  return scoped;
}

export async function requireProjectRole(
  request: Request,
  roles: ProjectRole[],
): Promise<void> {
  const context = await projectService.resolve(request);
  if (!roles.includes(context.role)) {
    throw new Error("You do not have permission to perform this project action.");
  }
}

export async function getAgentService(request?: Request): Promise<AgentService> {
  return (await forRequest(request)).agent;
}

export function getAgentServiceForProject(projectId: string): AgentService {
  return forProject(projectId).agent;
}

export async function getAgentGardenService(
  request?: Request,
): Promise<AgentGardenService> {
  return (await forRequest(request)).agentGarden;
}

export async function getProviderService(request?: Request): Promise<ProviderService> {
  return (await forRequest(request)).provider;
}

export async function getCostService(request?: Request): Promise<CostService> {
  return (await forRequest(request)).cost;
}

export async function getPolicyService(request?: Request): Promise<PolicyService> {
  return (await forRequest(request)).policies;
}

export async function getResourceCatalogService(request?: Request): Promise<ResourceCatalogService> {
  return (await forRequest(request)).catalog;
}

export async function getModelRoutingService(request?: Request): Promise<ModelRoutingService> {
  return (await forRequest(request)).modelRoutings;
}

export async function getProjectQuotaService(request?: Request): Promise<ProjectQuotaService> {
  return (await forRequest(request)).quotas;
}

export async function getAccessPolicyService(request?: Request): Promise<AccessPolicyService> {
  return (await forRequest(request)).accessPolicies;
}

export async function getAuditLogService(request?: Request): Promise<AuditLogService> {
  return (await forRequest(request)).auditLogs;
}
