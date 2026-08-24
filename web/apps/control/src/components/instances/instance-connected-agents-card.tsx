import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Agent } from "@tasklattice/contracts";
import { ArrowRight, Link2, ShieldCheck, Waypoints } from "lucide-react";
import { AgentGardenIcon } from "@/components/agent-garden/agent-garden-icon";
import { DetailCardHeader } from "@/components/instances/instance-detail-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentProjectId } from "@/hooks/use-project";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { api } from "@/lib/api";

export function InstanceConnectedAgentsCard({ agent }: { agent: Agent }) {
  const projectId = useCurrentProjectId();
  const scope = useProjectQueryScope();
  const canCoordinate = ["openclaw", "hermes"].includes(agent.agentPlatform);
  const garden = useQuery({
    queryKey: scope.key("agent-garden"),
    queryFn: api.getAgentGarden,
    enabled: canCoordinate,
    staleTime: 15_000,
  });

  if (!canCoordinate) return null;

  const connections = (garden.data?.connections ?? []).filter(
    (connection) => connection.coordinatorInstanceId === agent.id,
  );
  const connectedAgents = connections
    .map((connection) => ({
      connection,
      agent: garden.data?.agents.find(
        (candidate) => candidate.id === connection.connectedAgentId,
      ),
    }))
    .filter((item) => item.agent);

  return (
    <Card>
      <DetailCardHeader
        title="Connected Agents"
        description="Remote Agents this Coordinator is authorized to call for matching tasks."
        action={(
          <Button asChild variant="outline" size="sm">
            <Link
              to="/$projectId/agent-garden"
              params={{ projectId }}
              search={{ coordinator: agent.id }}
            >
              Add from Garden <ArrowRight />
            </Link>
          </Button>
        )}
      />
      <CardContent>
        <div className="mb-4 flex items-start gap-3 border-l-2 border-primary bg-primary/[0.035] px-4 py-3">
          <Waypoints className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-xs leading-5 text-muted-foreground">
            <strong className="text-foreground">{agent.name}</strong> remains
            the Coordinator. A connection only grants delegation access; it
            does not make the connected Agent part of this runtime or invoke it
            immediately.
          </p>
        </div>

        {garden.isPending ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : garden.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Connected Agents could not be loaded.
          </p>
        ) : connectedAgents.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {connectedAgents.map(({ agent: connected, connection }) =>
              connected ? (
                <div
                  key={connection.id}
                  className="flex min-h-20 items-start gap-3 border bg-muted/15 p-3"
                >
                  <AgentGardenIcon
                    type={connected.integrationType}
                    className="size-9"
                  />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">
                      {connected.name}
                    </strong>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">
                        <Link2 className="size-3" /> Connected
                      </Badge>
                      <Badge variant="outline">
                        {connection.approvalMode === "AUTO_READ_ONLY"
                          ? "Auto read-only"
                          : "Always ask"}
                      </Badge>
                    </span>
                  </span>
                </div>
              ) : null,
            )}
          </div>
        ) : (
          <div className="flex min-h-28 flex-col items-center justify-center border border-dashed px-5 py-6 text-center">
            <ShieldCheck className="size-5 text-muted-foreground" />
            <strong className="mt-3 text-sm">No Connected Agents</strong>
            <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
              This Coordinator cannot delegate to a remote Agent until you
              explicitly connect one from the Garden.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
