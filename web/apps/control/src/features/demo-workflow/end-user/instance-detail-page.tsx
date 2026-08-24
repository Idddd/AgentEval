import { useState } from "react";
import type { Agent, SandboxAuditEvent, TerminalTarget } from "@tasklattice/contracts";
import { Boxes, CheckCircle2, Copy, SquareTerminal } from "lucide-react";
import { DeleteInstanceDialog } from "@/components/instances/delete-instance-dialog";
import { InstanceHeader } from "@/components/instances/instance-detail-header";
import {
  getInstanceAccessState,
  resolveAvailableInstanceDetailTab,
  type InstanceDetailTab,
} from "@/components/instances/instance-detail-model";
import { DefinitionList, DetailCardHeader, RelativeTime } from "@/components/instances/instance-detail-shared";
import { InstanceTabs } from "@/components/instances/instance-detail-tabs";
import { InstanceOverviewTab } from "@/components/instances/instance-overview-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";
import type { DemoWorkflowState } from "../model";
import { useDemoWorkflowActions, useDemoWorkflowState } from "../provider";

const sessionAccessPolicyId = "11111111-1111-4111-8111-111111111111";

export function toSessionAgent(state: DemoWorkflowState, instanceId: string): Agent | undefined {
  const instance = state.instances.find((item) => item.id === instanceId);
  const agent = instance ? state.agents.find((item) => item.id === instance.agentId) : undefined;
  const revision = instance ? state.agentRevisions.find((item) => item.id === instance.revisionId) : undefined;
  if (!instance || !agent || !revision) return undefined;

  const status: Agent["status"] = instance.status === "READY"
    ? "READY"
    : instance.status === "PROVISIONING"
      ? "PROVISIONING"
      : "DESTROYING";
  const endpoint = revision.endpoint.trim();
  return {
    schemaVersion: 2,
    id: instance.id,
    name: instance.name,
    description: agent.description,
    runtime: "openshell",
    agentPlatform: "openclaw",
    modelDeploymentId: `session-model-${revision.id}`,
    systemPrompt: `Support ${instance.intendedUse} for ${instance.team} within the approved Agent boundaries.`,
    policyId: "default",
    providerAccountId: "session-openai",
    providerName: "OpenAI",
    model: revision.model,
    modelType: "llm",
    inferenceMode: "PLATFORM_MANAGED",
    accessPolicyIds: [sessionAccessPolicyId],
    modelRoutingId: "session-managed-routing",
    modelRoutingBindingId: `session-binding-${instance.id}`,
    modelRoutingStatus: status === "READY" ? "READY" : "VALIDATING",
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
    modelRoutingKeyFingerprint: "session-managed",
    costKeyAlias: "session-demo",
    sandboxName: `openclaw-${instance.id.slice(0, 8)}`,
    status,
    ...(status === "PROVISIONING" ? { provisioningStage: "ENDPOINT" as const } : {}),
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
    logs: ["Instance request accepted.", ...(status === "READY" ? ["OpenShell runtime ready.", "OpenClaw Web UI endpoint published."] : [])],
    skillIds: revision.skillIds,
    mcpServerIds: revision.mcpIds,
    knowledgeSourceIds: revision.knowledgeBaseIds,
    specializationId: "general-purpose",
    memory: { mode: "native", citations: "auto" },
    httpEndpoint: status === "READY" && endpoint
      ? { kind: "openclaw-webui", status: "READY", url: endpoint }
      : { kind: "openclaw-webui", status: "UNAVAILABLE", reason: "The endpoint becomes available after the Instance is ready." },
  };
}

export function EndUserInstanceDetailPage({
  activeTab,
  instanceId,
  onBack,
}: {
  activeTab: InstanceDetailTab;
  instanceId: string;
  onBack: () => void;
}) {
  const state = useDemoWorkflowState();
  const actions = useDemoWorkflowActions();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const instance = state.instances.find((item) => item.id === instanceId);
  const sourceAgent = instance ? state.agents.find((item) => item.id === instance.agentId) : undefined;
  const revision = instance ? state.agentRevisions.find((item) => item.id === instance.revisionId) : undefined;
  const agent = toSessionAgent(state, instanceId);

  if (!agent || !instance || !sourceAgent || !revision) {
    return <Card className="border-dashed"><CardContent className="grid min-h-72 place-items-center p-8 text-center"><div><Boxes className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-3 text-lg font-semibold">Instance not found</h1><p className="mt-1 text-sm text-muted-foreground">This session Instance may have expired after a refresh.</p><Button className="mt-5" variant="outline" onClick={onBack}>Back to My Instances</Button></div></CardContent></Card>;
  }

  const terminalTargets: TerminalTarget[] = agent.status === "READY" ? [{ id: "session-openclaw", containerName: "openclaw", displayName: "OpenClaw Agent", primary: true, available: true, shells: ["bash"] }] : [];
  const access = getInstanceAccessState(agent, terminalTargets);
  const renderedTab = resolveAvailableInstanceDetailTab(activeTab, access.terminal);
  const platform = getAgentPlatformPresentation(agent.agentPlatform);
  const auditEvents = sessionAuditEvents(state, instanceId);

  return (
    <div>
      <InstanceHeader access={access} agent={agent} platform={platform} onDelete={() => setDeleteOpen(true)} />
      <InstanceTabs active={renderedTab} agentId={agent.id} terminal={access.terminal} />
      {renderedTab === "overview" ? <InstanceOverviewTab access={access} agent={agent} platform={platform} auditEvents={auditEvents} auditLoading={false} modelRoutingName="Managed GPT routing" /> : null}
      {renderedTab === "configuration" ? <SessionConfigurationTab agent={agent} sourceAgent={sourceAgent} revision={revision} intendedUse={instance.intendedUse} team={instance.team} /> : null}
      {renderedTab === "capabilities" ? <SessionAccessTab agent={agent} state={state} /> : null}
      {renderedTab === "terminal" ? <SessionTerminalTab agent={agent} /> : null}
      {renderedTab === "auditor-log" ? <SessionAuditorLogTab agent={agent} events={auditEvents} /> : null}
      <DeleteInstanceDialog open={deleteOpen} onOpenChange={setDeleteOpen} instanceName={agent.name} deleting={false} onConfirm={() => { actions.deleteInstance(instance.id); setDeleteOpen(false); onBack(); }} />
    </div>
  );
}

function SessionConfigurationTab({ agent, sourceAgent, revision, intendedUse, team }: { agent: Agent; sourceAgent: DemoWorkflowState["agents"][number]; revision: DemoWorkflowState["agentRevisions"][number]; intendedUse: string; team: string }) {
  return <div role="tabpanel" aria-label="Configuration" className="grid gap-4 pt-5 lg:grid-cols-2">
    <Card><DetailCardHeader title="Identity" description="Identity captured when this Instance was created." /><CardContent><DefinitionList items={[{ label: "Instance name", value: agent.name }, { label: "Approved Agent", value: `${sourceAgent.name} · R${revision.revision}` }, { label: "Team", value: team }, { label: "Intended use", value: intendedUse }]} /></CardContent></Card>
    <Card><DetailCardHeader title="Managed inference" description="Approved runtime and model configuration." /><CardContent><DefinitionList items={[{ label: "Agent framework", value: "OpenClaw" }, { label: "Runtime", value: "OpenShell" }, { label: "Model", value: revision.model }, { label: "Provider", value: agent.providerName }, { label: "Endpoint", value: revision.endpoint }]} /></CardContent></Card>
  </div>;
}

function SessionAccessTab({ agent, state }: { agent: Agent; state: DemoWorkflowState }) {
  const skills = state.skills.filter((item) => agent.skillIds?.includes(item.id));
  const servers = state.mcpServers.filter((item) => agent.mcpServerIds?.includes(item.id));
  const sources = state.knowledgeBases.filter((item) => agent.knowledgeSourceIds?.includes(item.id));
  const groups = [{ title: "Skills", items: skills.map((item) => item.name) }, { title: "MCP Servers", items: servers.map((item) => item.name) }, { title: "Knowledge Bases", items: sources.map((item) => item.name) }];
  return <div role="tabpanel" aria-label="Access" className="space-y-4 pt-5">
    <Card><DetailCardHeader title="Access policy" description="The published Agent permissions inherited by this Instance." /><CardContent><DefinitionList columns={2} items={[{ label: "Policy", value: "Default business access" }, { label: "Status", value: <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Active</Badge> }, { label: "Memory", value: "Native Instance memory" }, { label: "Scope", value: "This Instance only" }]} /></CardContent></Card>
    <div className="grid gap-4 md:grid-cols-3">{groups.map((group) => <Card key={group.title}><DetailCardHeader title={group.title} description="Approved resources attached to this Instance." /><CardContent>{group.items.length ? <div className="flex flex-wrap gap-2">{group.items.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}</div> : <p className="py-6 text-center text-sm text-muted-foreground">None configured</p>}</CardContent></Card>)}</div>
  </div>;
}

function SessionTerminalTab({ agent }: { agent: Agent }) {
  return <div role="tabpanel" aria-label="Terminal" className="pt-5"><Card><DetailCardHeader title="OpenClaw terminal" description="Interactive access to the managed OpenShell runtime." /><CardContent><div className="overflow-hidden rounded-lg bg-zinc-950 text-zinc-100"><div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-xs text-zinc-400"><SquareTerminal className="size-4" />openclaw · bash</div><pre className="min-h-72 overflow-auto p-5 font-mono text-xs leading-6">{`OpenClaw Instance Console\nInstance: ${agent.name}\nRuntime: OpenShell\nModel: ${agent.model}\nStatus: ready\n\n$ openclaw status\n✓ Agent runtime healthy\n✓ Web UI endpoint available\n✓ Approved policy attached\n\n$ `}</pre></div></CardContent></Card></div>;
}

function SessionAuditorLogTab({ agent, events }: { agent: Agent; events: SandboxAuditEvent[] }) {
  const entries = [{ id: "created", label: "Instance creation requested", time: agent.createdAt }, ...events.map((event) => ({ id: event.id, label: event.summary, time: event.timestamp }))];
  return <div role="tabpanel" aria-label="Auditor Log" className="pt-5"><Card><DetailCardHeader title="Auditor Log" description="Lifecycle and policy events recorded for this Instance." action={<Button variant="outline" size="sm" onClick={() => void navigator.clipboard?.writeText(entries.map((item) => `${item.time} ${item.label}`).join("\n"))}><Copy />Copy log</Button>} /><CardContent><ol className="divide-y">{entries.map((entry) => <li key={entry.id} className="flex items-start gap-3 py-4"><span className="mt-0.5 grid size-7 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="size-4" /></span><div><strong className="text-sm">{entry.label}</strong><p className="mt-1 text-xs text-muted-foreground"><RelativeTime value={entry.time} /></p></div></li>)}</ol></CardContent></Card></div>;
}

function sessionAuditEvents(state: DemoWorkflowState, instanceId: string): SandboxAuditEvent[] {
  return state.events.filter((event) => event.entityType === "instance" && event.entityId === instanceId).map((event) => ({ id: event.id, timestamp: event.createdAt, source: "sandbox", category: "lifecycle", severity: "INFO", decision: "OBSERVED", summary: event.label, raw: JSON.stringify(event.metadata) }));
}
