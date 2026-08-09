import { complianceDomainCatalog, type Agent, type SandboxAuditEvent } from "@tasklattice/contracts";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, BookOpen, BrainCircuit, CheckCircle2, ChevronRight, ExternalLink, Globe2, Network, Sparkles, SquareTerminal } from "lucide-react";
import { resolveProvisioningState } from "@/components/agents/provisioning-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AgentPlatformPresentation } from "@/lib/agent-platforms";
import { cn } from "@/lib/utils";
import { useCurrentProjectId } from "@/hooks/use-project";
import { endpointStatus, formatUptime, getCapabilityCounts, type InstanceAccessState } from "./instance-detail-model";
import { CopyableValue, DefinitionList, DetailCardHeader, InstanceStatusBadge, RelativeTime } from "./instance-detail-shared";
import { InstanceConnectedAgentsCard } from "./instance-connected-agents-card";

function AccessCard({ description, enabled, href, icon: Icon, label, reason, external = false }: {
  description: string;
  enabled: boolean;
  href?: string | undefined;
  icon: typeof Globe2;
  label: string;
  reason?: string | undefined;
  external?: boolean;
}) {
  return (
    <div className="flex min-h-32 flex-col border bg-muted/15 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center bg-primary/8 text-primary"><Icon className="size-5" /></span>
        <div><h3 className="font-medium">{label}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{enabled ? description : reason}</p></div>
      </div>
      <div className="mt-auto pt-3">
        {enabled && href ? external ? (
          <Button asChild variant="link" className="min-h-11 px-0"><a href={href} target="_blank" rel="noopener noreferrer">Open Web UI <ExternalLink /></a></Button>
        ) : (
          <Button asChild variant="link" className="min-h-11 px-0"><Link to={href}>Open Console <ExternalLink /></Link></Button>
        ) : <span className="text-xs font-medium text-muted-foreground">Unavailable</span>}
      </div>
    </div>
  );
}

function EndpointBadge({ agent }: { agent: Agent }) {
  const status = endpointStatus(agent);
  return <Badge variant="outline" className={cn(
    "border-transparent capitalize",
    status === "available" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    status === "pending" && "bg-primary/10 text-primary",
    status === "failed" && "bg-destructive/10 text-destructive",
    status === "unavailable" && "bg-muted text-muted-foreground",
  )}>{status}</Badge>;
}

function ProvisioningSummary({ agent }: { agent: Agent }) {
  const projectId = useCurrentProjectId();
  const state = resolveProvisioningState({ status: agent.status, ...(agent.provisioningStage ? { stage: agent.provisioningStage } : {}) });
  if (agent.status === "FAILED") {
    return (
      <Card className="border-destructive/25 bg-destructive/[0.025] lg:col-span-2">
        <DetailCardHeader title="Instance creation failed" description="Provisioning stopped before the runtime became available." />
        <CardContent className="space-y-4">
          <p role="alert" className="flex gap-2 border-l-2 border-destructive bg-destructive/5 px-3 py-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{agent.error ?? "The runtime did not return a failure summary."}</p>
          <Button asChild variant="outline"><Link to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: agent.id }} search={{ tab: "auditor-log" }} hash="provisioning-logs">View error details</Link></Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-primary/20 bg-primary/[0.025] lg:col-span-2">
      <DetailCardHeader title="Creating Instance" description={`${state.activeIndex} of 6 stages complete · ${state.definition.description}`} />
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-xs"><span>{state.statusLabel}</span><span className="tabular-nums text-muted-foreground">{state.progress}%</span></div>
        <Progress value={state.progress} aria-label="Instance creation progress" aria-valuetext={`${state.progress}% complete`} />
        <Button asChild variant="link" className="h-auto min-h-0 p-0"><Link to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: agent.id }} search={{ tab: "auditor-log" }}>View auditor log</Link></Button>
      </CardContent>
    </Card>
  );
}

export function InstanceOverviewTab({ access, agent, auditEvents, auditLoading, modelRoutingName, platform }: {
  access: InstanceAccessState;
  agent: Agent;
  auditEvents?: SandboxAuditEvent[];
  auditLoading: boolean;
  modelRoutingName?: string;
  platform: AgentPlatformPresentation;
}) {
  const projectId = useCurrentProjectId();
  const counts = getCapabilityCounts(agent);
  const activity = [
    ...(agent.status === "READY" ? [{ id: "ready", title: "Instance is ready", occurredAt: agent.updatedAt, status: "success" as const }] : []),
    ...(agent.status === "FAILED" ? [{ id: "failed", title: "Instance creation failed", occurredAt: agent.updatedAt, status: "error" as const }] : []),
    ...(auditEvents ?? []).map((event) => ({ id: event.id, title: event.summary, occurredAt: event.timestamp, status: event.decision === "DENIED" || event.decision === "BLOCKED" || event.decision === "REJECTED" ? "error" as const : "info" as const })),
    { id: "created", title: "Instance created", occurredAt: agent.createdAt, status: "success" as const },
  ].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)).slice(0, 4);

  return (
    <div role="tabpanel" aria-label="Overview" className="space-y-4 pt-5">
      {agent.status !== "READY" && agent.status !== "DESTROYING" ? <div className="grid lg:grid-cols-2"><ProvisioningSummary agent={agent} /></div> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
        <Card>
          <DetailCardHeader title="Overview" description="High-level summary of this Agent Instance." />
          <CardContent className="space-y-4">
            <DefinitionList columns={2} items={[
              { label: "Status", value: <InstanceStatusBadge status={agent.status} /> },
              { label: "Inference", value: modelRoutingName ?? "Platform managed" },
              { label: "Runtime", value: platform.runtimeName },
              { label: "Created", value: <RelativeTime value={agent.createdAt} /> },
              { label: "Agent framework", value: platform.name },
              { label: "Last updated", value: <RelativeTime value={agent.updatedAt} /> },
              { label: "Routing", value: agent.modelRoutingCapabilities?.automaticRouting === "ENABLED" ? "Automatic" : "Managed" },
              { label: "Uptime", value: formatUptime(agent) },
            ]} />
            <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
              <AccessCard icon={Globe2} label="Agent Web UI" description="Interact with the running Agent." enabled={access.webUI.enabled} href={access.webUI.url} reason={access.webUI.disabledReason} external />
              <AccessCard icon={SquareTerminal} label="Terminal" description="Open an interactive terminal for the running Agent." enabled={access.terminal.enabled} href={`/${encodeURIComponent(projectId)}/instances/${agent.id}?tab=terminal`} reason={access.terminal.disabledReason} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <DetailCardHeader title="Instance information" description="Identifiers and resolved runtime bindings." />
          <CardContent>
            <DefinitionList items={[
              { label: "Instance ID", value: <CopyableValue value={agent.id} /> },
              { label: "Sandbox ID", value: <CopyableValue value={agent.sandboxName} /> },
              { label: "Agent configuration", value: platform.configurationName },
              { label: "Agent runtime", value: platform.name },
              { label: "Inference mode", value: "Platform managed" },
              { label: "Inference status", value: agent.modelRoutingStatus?.replaceAll("_", " ") ?? "Unavailable" },
              { label: "Data boundary", value: complianceDomainCatalog.find((domain) => domain.id === agent.modelRoutingComplianceDomain)?.label ?? agent.modelRoutingComplianceDomain },
              { label: "Routing", value: <Link to="/$projectId/setting/model-routings/$routingId" params={{ projectId, routingId: agent.modelRoutingId }} className="font-medium text-primary underline underline-offset-4">{modelRoutingName ?? "Managed routing"}</Link> },
              { label: "Endpoint status", value: <EndpointBadge agent={agent} /> },
              { label: "Endpoint URL", value: <CopyableValue value={agent.httpEndpoint?.url} externalUrl={agent.httpEndpoint?.url} /> },
            ]} />
          </CardContent>
        </Card>
      </div>

      <InstanceConnectedAgentsCard agent={agent} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <DetailCardHeader title="Capabilities summary" description="Configured capabilities for this Agent." />
          <CardContent className="divide-y">
            {[
              { icon: Sparkles, label: "Skills", count: counts.skills, hash: "skills" },
              { icon: Network, label: "MCP Servers", count: counts.mcpServers, hash: "mcp-servers" },
              { icon: BookOpen, label: "Knowledge Bases", count: counts.knowledgeBases, hash: "knowledge-bases" },
              { icon: BrainCircuit, label: "Memory", count: agent.memory ? 1 : 0, hash: "memory" },
            ].map(({ icon: Icon, label, count, hash }) => (
              <Link key={label} to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: agent.id }} search={{ tab: "capabilities" }} hash={hash} className="flex min-h-12 items-center gap-3 py-2 text-sm hover:text-primary focus-visible:outline-2">
                <Icon className="size-4 text-primary" /><span>{label}</span><span className="ml-auto text-xs text-muted-foreground">{count} selected</span><ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <DetailCardHeader title="Runtime summary" description="Runtime environment and resources." />
          <CardContent><DefinitionList items={[
            { label: "Runtime", value: platform.runtimeName },
            { label: "Sandbox", value: agent.sandboxName },
            { label: "Resources", value: "—" },
            { label: "Region", value: "—" },
          ]} /></CardContent>
        </Card>

        <Card>
          <DetailCardHeader title="Health" description="Current health and performance." />
          <CardContent>
            <div className="flex min-h-44 flex-col items-center justify-center text-center">
              {access.terminal.enabled ? <CheckCircle2 className="size-6 text-emerald-600" /> : <AlertTriangle className="size-6 text-muted-foreground" />}
              <p className="mt-3 text-sm font-medium">Health metrics unavailable</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">The current control API does not expose response time, error rate, or request metrics.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <DetailCardHeader title="Recent activity" description="Observed events and status changes." action={<Button asChild variant="outline" size="sm"><Link to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: agent.id }} search={{ tab: "auditor-log" }}>View auditor log <ExternalLink /></Link></Button>} />
        <CardContent>
          {auditLoading && activity.length <= 1 ? <p className="py-5 text-sm text-muted-foreground">Loading observed activity…</p> : (
            <ol className="grid gap-4 py-2 sm:grid-cols-2 xl:grid-cols-4">
              {activity.map((event) => <li key={event.id} className="flex gap-2 text-xs"><span className={cn("mt-1 size-2 shrink-0 rounded-full", event.status === "error" ? "bg-destructive" : event.status === "success" ? "bg-emerald-500" : "bg-primary")} /><span><strong className="block font-medium">{event.title}</strong><span className="mt-1 block text-muted-foreground"><RelativeTime value={event.occurredAt} /></span></span></li>)}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
