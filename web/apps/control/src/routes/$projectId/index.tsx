import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Plus, ServerCog, ShieldEllipsis } from "lucide-react";
import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { useCurrentProjectId } from "@/hooks/use-project";

export const Route = createFileRoute("/$projectId/")({ component: Overview });

function Overview() {
  const projectId = useCurrentProjectId();
  const scope = useProjectQueryScope();
  const agents = useQuery({ queryKey: scope.key("agents"), queryFn: api.listAgents });
  const ready = agents.data?.filter((agent) => agent.status === "READY").length ?? 0;
  const primaryAgent = agents.data?.[0];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Project operations"
        description="Manage Provider connections, runtime Instances, Sandboxes, Skills, approvals, and monitoring from one control path."
        actions={
          <Button asChild size="lg">
            <Link to="/$projectId/instances" params={{ projectId }} search={{ create: "instance" }}><Plus />Create Instance</Link>
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Instances" value={agents.data?.length ?? 0} />
        <MetricCard label="Ready sandboxes" value={ready} />
        <MetricCard disabled label="Loaded Skills · Later" value="—" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ServerCog className="size-5" />Live operating path</CardTitle>
          <CardDescription>Instance and Sandbox remain the implemented runtime slice; broader control surfaces are marked as previews.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          {[["Runtime", "OpenShell"], ["Agent configuration", "NemoClaw"], ["Evidence", "Sandbox activity + terminal"]].map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-muted/35 p-4">
              <span className="text-muted-foreground">{label}</span>
              <strong className="mt-2 block">{value}</strong>
            </div>
          ))}
        </CardContent>
      </Card>
      {primaryAgent ? (
        <Card className="border-primary/20 bg-primary/[0.025]">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardDescription className="flex items-center gap-2"><Bot className="size-4" />Selected Instance</CardDescription>
              <CardTitle className="mt-2">{primaryAgent.name}</CardTitle>
            </div>
            <AgentStatusBadge status={primaryAgent.status} />
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div><div className="text-xs text-muted-foreground">Desired Agent</div><div className="mt-1 font-medium">NemoClaw · {primaryAgent.model}</div></div>
            <div><div className="text-xs text-muted-foreground">Runtime Sandbox</div><div className="mt-1 font-mono text-sm">{primaryAgent.sandboxName}</div></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/$projectId/instances/$instanceId" params={{ projectId, instanceId: primaryAgent.id }}>Open Instance</Link></Button><Button variant="ghost" asChild><Link to="/$projectId/runtime" params={{ projectId }}><ShieldEllipsis />Audit Sandbox</Link></Button></div>
          </CardContent>
        </Card>
      ) : null}
      {agents.data?.length === 0 ? <EmptyState icon={Bot} title="No Instances yet" description="Create the first Agent Instance to provision its Sandbox." /> : null}
    </div>
  );
}
