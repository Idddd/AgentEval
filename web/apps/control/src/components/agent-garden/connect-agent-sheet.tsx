import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
  Agent,
  AgentConnection,
  AgentConnectionApprovalMode,
  AgentGardenEntry,
} from "@tasklattice/contracts";
import {
  Link2,
  ShieldCheck,
  Trash2,
  Waypoints,
} from "lucide-react";
import { EntitySheet } from "@/components/shared/entity-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";
import { useCurrentProjectId } from "@/hooks/use-project";
import { AgentGardenIcon } from "./agent-garden-icon";

export function ConnectAgentSheet({
  agent,
  connections,
  initialCoordinatorId,
  instances,
  onChanged,
  onOpenChange,
  open,
}: {
  agent: AgentGardenEntry | undefined;
  connections: AgentConnection[];
  initialCoordinatorId?: string;
  instances: Agent[];
  onChanged: (message: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const projectId = useCurrentProjectId();
  const coordinators = useMemo(
    () =>
      instances.filter(
        (instance) =>
          instance.status === "READY" &&
          ["openclaw", "hermes"].includes(instance.agentPlatform),
      ),
    [instances],
  );
  const [coordinatorId, setCoordinatorId] = useState("");
  const [restrictSkills, setRestrictSkills] = useState(false);
  const [allowedSkillIds, setAllowedSkillIds] = useState<string[]>([]);
  const [approvalMode, setApprovalMode] =
    useState<AgentConnectionApprovalMode>("AUTO_READ_ONLY");
  const agentConnections = connections.filter(
    (connection) => connection.connectedAgentId === agent?.id,
  );
  const alreadyConnected = agentConnections.some(
    (connection) =>
      connection.coordinatorInstanceId === coordinatorId,
  );

  const connect = useMutation({
    mutationFn: api.connectGardenAgent,
    onSuccess: () => {
      onChanged(
        `${agent?.name ?? "Agent"} is now available to the selected Coordinator.`,
      );
      onOpenChange(false);
    },
  });
  const disconnect = useMutation({
    mutationFn: api.disconnectGardenAgent,
    onSuccess: () => {
      onChanged("The Agent connection was removed.");
    },
  });

  useEffect(() => {
    if (!open) return;
    setCoordinatorId(
      coordinators.some((coordinator) => coordinator.id === initialCoordinatorId)
        ? (initialCoordinatorId ?? "")
        : (coordinators[0]?.id ?? ""),
    );
    setRestrictSkills(false);
    setAllowedSkillIds([]);
    setApprovalMode("AUTO_READ_ONLY");
    connect.reset();
    disconnect.reset();
  }, [agent?.id, initialCoordinatorId, open]);

  const submit = () => {
    if (!agent || !coordinatorId) return;
    connect.mutate({
      coordinatorInstanceId: coordinatorId,
      connectedAgentId: agent.id,
      allowedSkillIds: restrictSkills ? allowedSkillIds : [],
      approvalMode,
    });
  };

  return (
    <EntitySheet
      open={open && Boolean(agent)}
      onOpenChange={(next) => {
        if (!connect.isPending && !disconnect.isPending) {
          onOpenChange(next);
        }
      }}
      eyebrow="Agent connection"
      title={`Connect ${agent?.name ?? "Agent"}`}
      description="Authorize a Coordinator Instance to delegate matching tasks. Connecting does not run the Agent immediately."
      width="lg"
      footer={(
        <>
          <Button
            variant="outline"
            disabled={connect.isPending || disconnect.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={
              !agent ||
              !coordinatorId ||
              alreadyConnected ||
              connect.isPending ||
              agent.status !== "READY" ||
              !agent.usageCapabilities.acceptsDelegation
            }
            onClick={submit}
          >
            <Link2 />
            {connect.isPending
              ? "Connecting…"
              : alreadyConnected
                ? "Already connected"
                : "Connect Agent"}
          </Button>
        </>
      )}
    >
      {agent ? (
        <div className="space-y-7">
          <div className="flex items-start gap-4 border bg-muted/20 p-4">
            <AgentGardenIcon
              type={agent.integrationType}
              className="size-12"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{agent.name}</strong>
                <Badge variant="secondary">{agent.platformLabel}</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {agent.description}
              </p>
            </div>
          </div>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Coordinator Instance</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Only READY OpenClaw and Hermes Instances can create outbound
                Agent delegations.
              </p>
            </div>
            {coordinators.length ? (
              <Select
                value={coordinatorId}
                onValueChange={setCoordinatorId}
              >
                <SelectTrigger className="h-auto min-h-14 w-full">
                  <SelectValue placeholder="Select a Coordinator" />
                </SelectTrigger>
                <SelectContent>
                  {coordinators.map((coordinator) => {
                    const platform = getAgentPlatformPresentation(
                      coordinator.agentPlatform,
                    );
                    return (
                      <SelectItem
                        key={coordinator.id}
                        value={coordinator.id}
                        className="py-3"
                      >
                        <span className="flex items-center gap-2">
                          <strong>{coordinator.name}</strong>
                          <span className="text-xs text-muted-foreground">
                            {platform.name}
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : (
              <div className="border border-dashed p-5 text-sm">
                <strong className="block">
                  No READY Coordinator Instances
                </strong>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Create an OpenClaw or Hermes Instance before connecting a
                  callable Agent.
                </p>
                <Button asChild variant="outline" className="mt-4">
                  <Link
                    to="/$projectId/instances"
                    params={{ projectId }}
                    search={{ create: "instance" }}
                  >
                    Create Instance
                  </Link>
                </Button>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Allowed capabilities</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Leave unrestricted to follow the latest discovered Agent Card,
                or pin a smaller set of skills.
              </p>
            </div>
            {agent.skills.length ? (
              <>
                <label className="flex min-h-12 items-start gap-3 border p-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-primary"
                    checked={restrictSkills}
                    onChange={(event) => {
                      setRestrictSkills(event.target.checked);
                      setAllowedSkillIds(
                        event.target.checked
                          ? agent.skills.map((skill) => skill.id)
                          : [],
                      );
                    }}
                  />
                  <span>
                    <strong className="block text-sm">
                      Restrict discovered skills
                    </strong>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      All discovered and future skills are allowed when this is
                      off.
                    </span>
                  </span>
                </label>
                {restrictSkills ? (
                  <div className="divide-y border">
                    {agent.skills.map((skill) => (
                      <label
                        key={skill.id}
                        className="flex min-h-14 items-start gap-3 px-3 py-3"
                      >
                        <input
                          type="checkbox"
                          className="mt-1 size-4 accent-primary"
                          checked={allowedSkillIds.includes(skill.id)}
                          onChange={(event) =>
                            setAllowedSkillIds((current) =>
                              event.target.checked
                                ? [...current, skill.id]
                                : current.filter((id) => id !== skill.id),
                            )
                          }
                        />
                        <span>
                          <strong className="block text-sm">
                            {skill.name}
                          </strong>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {skill.description || skill.id}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex items-start gap-3 border bg-muted/20 p-4 text-sm">
                <Waypoints className="mt-0.5 size-4 text-primary" />
                <p className="text-xs leading-5 text-muted-foreground">
                  This adapter did not publish individual skills. The
                  connection grants access to its registered task endpoint.
                </p>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Approval behavior</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Defines the default Coordinator behavior. Destructive actions
                still require their governing Access Policy.
              </p>
            </div>
            <Select
              value={approvalMode}
              onValueChange={(value) =>
                setApprovalMode(value as AgentConnectionApprovalMode)
              }
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AUTO_READ_ONLY">
                  Allow read-only delegation automatically
                </SelectItem>
                <SelectItem value="ALWAYS_ASK">
                  Ask before every delegated task
                </SelectItem>
              </SelectContent>
            </Select>
          </section>

          {agentConnections.length ? (
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">
                  Existing connections
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Disconnecting revokes future delegation from that
                  Coordinator.
                </p>
              </div>
              <div className="divide-y border">
                {agentConnections.map((connection) => {
                  const coordinator = instances.find(
                    (instance) =>
                      instance.id === connection.coordinatorInstanceId,
                  );
                  return (
                    <div
                      key={connection.id}
                      className="flex min-h-16 items-center gap-3 px-3 py-2"
                    >
                      <ShieldCheck className="size-4 text-primary" />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">
                          {coordinator?.name ??
                            connection.coordinatorInstanceId}
                        </strong>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {connection.approvalMode === "AUTO_READ_ONLY"
                            ? "Read-only automatic"
                            : "Always ask"}
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Disconnect ${agent.name} from ${
                          coordinator?.name ?? "Coordinator"
                        }`}
                        disabled={disconnect.isPending}
                        onClick={() =>
                          disconnect.mutate(connection.id)
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {connect.error || disconnect.error ? (
            <p
              role="alert"
              className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {(connect.error ?? disconnect.error)?.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </EntitySheet>
  );
}
