import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
} from "@tanstack/react-router";
import { z } from "zod";
import type {
  AgentGardenEntry,
  AgentPlatformId,
} from "@tasklattice/contracts";
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { AgentDetailSheet } from "@/components/agent-garden/agent-detail-sheet";
import { AgentApprovalQueue } from "@/components/agent-garden/agent-approval-queue";
import { AgentGardenCard } from "@/components/agent-garden/agent-garden-card";
import { agentGardenFacetGroups } from "@/components/agent-garden/agent-garden-facets";
import { ConnectAgentSheet } from "@/components/agent-garden/connect-agent-sheet";
import { RegisterAgentSheet } from "@/components/agent-garden/register-agent-sheet";
import { TryDemoAgentSheet } from "@/components/agent-garden/try-demo-agent-sheet";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { useCurrentProjectId } from "@/hooks/use-project";
import { useProjectPermissions } from "@/hooks/use-project-permissions";

export const Route = createFileRoute("/$projectId/agent-garden/")({
  validateSearch: z.object({ coordinator: z.string().optional() }),
  component: AgentGarden,
});

type SortMode = "recommended" | "name" | "recent";

function toggleCapability(
  capabilities: string[],
  capability: string,
): string[] {
  return capabilities.includes(capability)
    ? capabilities.filter((candidate) => candidate !== capability)
    : [...capabilities, capability];
}

function AgentGarden() {
  const routeSearch = Route.useSearch();
  const projectId = useCurrentProjectId();
  const permissions = useProjectPermissions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scope = useProjectQueryScope();
  const garden = useQuery({
    queryKey: scope.key("agent-garden"),
    queryFn: api.getAgentGarden,
  });
  const instances = useQuery({
    queryKey: scope.key("agents"),
    queryFn: api.listAgents,
  });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("recommended");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [mobileCapabilitiesOpen, setMobileCapabilitiesOpen] =
    useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [detailId, setDetailId] = useState("");
  const [connectId, setConnectId] = useState("");
  const [tryId, setTryId] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [notice, setNotice] = useState("");
  const allAgents = garden.data?.agents ?? [];
  const connections = garden.data?.connections ?? [];
  const selectedAgent = allAgents.find(
    (agent) => agent.id === detailId,
  );
  const connectAgent = allAgents.find(
    (agent) => agent.id === connectId,
  );
  const tryAgent = allAgents.find((agent) => agent.id === tryId);
  const removingAgent = allAgents.find(
    (agent) => agent.id === removingId,
  );

  const availableFacetGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const agent of allAgents) {
      for (const tag of agent.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return agentGardenFacetGroups
      .map((group) => ({
        ...group,
        options: group.tags
          .map((tag) => ({ tag, count: counts.get(tag) ?? 0 }))
          .filter((option) => option.count > 0),
      }))
      .filter((group) => group.options.length);
  }, [allAgents]);

  const visibleAgents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = allAgents.filter((agent) => {
      const searchable = [
        agent.name,
        agent.description,
        agent.platformLabel,
        agent.category,
        agent.owner,
        ...agent.tags,
        ...agent.skills.flatMap((skill) => [
          skill.name,
          skill.description,
          ...skill.tags,
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!query || searchable.includes(query)) &&
        (!capabilities.length ||
          capabilities.some((tag) => agent.tags.includes(tag)))
      );
    });
    if (sort === "name") {
      return [...filtered].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
    }
    if (sort === "recent") {
      return [...filtered].sort((left, right) =>
        (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
      );
    }
    return filtered;
  }, [allAgents, capabilities, search, sort]);

  const refresh = useMutation({
    mutationFn: api.discoverGardenAgent,
    onSuccess: async (agent) => {
      setNotice(
        agent.status === "READY"
          ? `${agent.name} discovery completed.`
          : `${agent.name} still needs attention: ${
              agent.lastDiscoveryError ?? agent.status
            }`,
      );
      await queryClient.invalidateQueries({
        queryKey: scope.key("agent-garden"),
      });
    },
  });
  const remove = useMutation({
    mutationFn: api.removeGardenAgent,
    onSuccess: async () => {
      setDetailId("");
      setRemovingId("");
      setNotice("The Project-registered Agent was removed.");
      await queryClient.invalidateQueries({
        queryKey: scope.key("agent-garden"),
      });
    },
  });

  const refreshGarden = async (message: string) => {
    setNotice(message);
    await queryClient.invalidateQueries({
      queryKey: scope.key("agent-garden"),
    });
  };

  const createInstance = (agent: AgentGardenEntry) => {
    if (
      agent.integrationType !== "openclaw" &&
      agent.integrationType !== "hermes"
    ) return;
    void navigate({
      to: "/$projectId/instances",
      params: { projectId },
      search: {
        create: "instance",
        platform: agent.integrationType as AgentPlatformId,
        specialization: agent.specializationId ?? undefined,
      },
    });
  };

  const openDetails = (agent: AgentGardenEntry) => {
    if (agent.source === "PROJECT_REGISTERED") {
      setDetailId(agent.id);
      return;
    }
    void navigate({
      to: "/$projectId/agent-garden/$agentId",
      params: { projectId, agentId: agent.id },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Garden"
        description="Discover ready-to-use Agents for this Project, or register a remote Agent built with another platform."
        actions={(
          <Button
            className="h-11"
            disabled={!permissions.canManageResources}
            onClick={() => setRegistrationOpen(true)}
          >
            <Plus /> Register Agent
          </Button>
        )}
      />

      {garden.error || instances.error ? (
        <p
          role="alert"
          className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {(garden.error ?? instances.error)?.message}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm"
        >
          {notice}
        </p>
      ) : null}
      {refresh.error || remove.error ? (
        <p
          role="alert"
          className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {(refresh.error ?? remove.error)?.message}
        </p>
      ) : null}

      <AgentApprovalQueue onNotice={setNotice} />

      <div className="flex flex-col gap-3 border-b py-4 sm:flex-row sm:items-end">
        <label className="relative min-w-0 flex-1 sm:max-w-xl">
          <span className="sr-only">
            Search Agents, capabilities, or platforms
          </span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Agents, capabilities, or platforms…"
          />
        </label>
        <span className="ml-auto hidden pb-3 text-xs tabular-nums text-muted-foreground md:block">
          Showing {visibleAgents.length} of {allAgents.length} Agents
        </span>
        <Select
          value={sort}
          onValueChange={(value) => setSort(value as SortMode)}
        >
          <SelectTrigger className="h-11 w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recommended">Recommended</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="recent">Recently updated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-5 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="self-start border-b pb-5 lg:sticky lg:top-24 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-0 text-sm font-semibold lg:pointer-events-none"
              aria-expanded={mobileCapabilitiesOpen}
              aria-controls="agent-capabilities"
              onClick={() =>
                setMobileCapabilitiesOpen((current) => !current)
              }
            >
              Capabilities
              {capabilities.length ? (
                <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {capabilities.length}
                </span>
              ) : null}
              <ChevronDown
                className={`ml-1 size-3.5 transition-transform lg:hidden ${
                  mobileCapabilitiesOpen ? "rotate-180" : ""
                }`}
              />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-2"
              disabled={!capabilities.length}
              onClick={() => setCapabilities([])}
            >
              Clear
            </Button>
          </div>
          <div
            id="agent-capabilities"
            className={`gap-x-5 sm:grid-cols-2 lg:grid lg:grid-cols-1 ${
              mobileCapabilitiesOpen ? "grid" : "hidden"
            }`}
          >
            {availableFacetGroups.map((group) => (
              <CapabilityGroup key={group.title} title={group.title}>
                <div className="flex flex-wrap gap-2 pt-1">
                  {group.options.map((option) => (
                    <CapabilityOption
                      key={option.tag}
                      active={capabilities.includes(option.tag)}
                      count={option.count}
                      label={option.tag}
                      onClick={() =>
                        setCapabilities(
                          toggleCapability(
                            capabilities,
                            option.tag,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
              </CapabilityGroup>
            ))}
          </div>
        </aside>

        <main>
          {garden.isPending ? (
            <div
              className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
              aria-label="Loading Agent Garden"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-64 rounded-lg" />
              ))}
            </div>
          ) : visibleAgents.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleAgents.map((agent) => (
                <AgentGardenCard
                  key={agent.id}
                  agent={agent}
                  canManage={permissions.canManageResources}
                  connectionCount={
                    connections.filter(
                      (connection) =>
                        connection.connectedAgentId === agent.id,
                    ).length
                  }
                  onDetails={() => openDetails(agent)}
                  onConnect={() => setConnectId(agent.id)}
                  onCreateInstance={() => createInstance(agent)}
                  onTry={() => setTryId(agent.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Bot}
              title="No Agents match"
              description="Choose another capability, clear the selection, or try a different search."
            />
          )}
        </main>
      </div>

      <RegisterAgentSheet
        open={registrationOpen}
        onOpenChange={setRegistrationOpen}
        onRegistered={(agent) => {
          setDetailId(agent.id);
          void refreshGarden(
            agent.status === "READY"
              ? `${agent.name} was registered and is ready.`
              : `${agent.name} was saved, but discovery needs attention.`,
          );
        }}
      />

      <AgentDetailSheet
        open={Boolean(detailId)}
        onOpenChange={(open) => {
          if (!open) setDetailId("");
        }}
        agent={selectedAgent}
        canManage={permissions.canManageResources}
        connections={connections}
        instances={instances.data ?? []}
        refreshing={refresh.isPending}
        onRefresh={() =>
          selectedAgent && refresh.mutate(selectedAgent.id)
        }
        onRemove={() =>
          selectedAgent && setRemovingId(selectedAgent.id)
        }
        onConnect={() => {
          if (!selectedAgent) return;
          setDetailId("");
          setConnectId(selectedAgent.id);
        }}
        onCreateInstance={() =>
          selectedAgent && createInstance(selectedAgent)
        }
        onTry={() => {
          if (!selectedAgent) return;
          setDetailId("");
          setTryId(selectedAgent.id);
        }}
      />

      <ConnectAgentSheet
        open={Boolean(connectId)}
        onOpenChange={(open) => {
          if (!open) setConnectId("");
        }}
        agent={connectAgent}
        connections={connections}
        {...(routeSearch.coordinator
          ? { initialCoordinatorId: routeSearch.coordinator }
          : {})}
        instances={instances.data ?? []}
        onChanged={(message) => {
          void refreshGarden(message);
        }}
      />

      <TryDemoAgentSheet
        open={Boolean(tryId)}
        onOpenChange={(open) => {
          if (!open) setTryId("");
        }}
        agent={tryAgent}
      />

      <Dialog
        open={Boolean(removingAgent)}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setRemovingId("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              Remove registered Agent?
            </DialogTitle>
            <DialogDescription>
              This removes the Project registration and discovery snapshot.
              Existing connections must be disconnected first.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-5 text-sm">
            <strong>{removingAgent?.name}</strong>
            <p className="mt-1 text-muted-foreground">
              The remote Agent itself will not be deleted.
            </p>
            {remove.error ? (
              <p
                role="alert"
                className="mt-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-destructive"
              >
                {remove.error.message}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={remove.isPending}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                removingAgent && remove.mutate(removingAgent.id)
              }
            >
              {remove.isPending ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" />
              ) : (
                <Trash2 />
              )}
              {remove.isPending ? "Removing…" : "Remove registration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CapabilityGroup({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <details open className="group border-t py-4 first:border-t-0">
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between py-1 text-xs font-semibold focus-visible:outline-2">
        {title}
        <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function CapabilityOption({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={
        active
          ? "flex min-h-11 items-center gap-2 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-left text-xs font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          : "flex min-h-11 items-center gap-2 rounded-md border border-transparent bg-muted/70 px-3 py-2 text-left text-xs text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30"
      }
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="ml-auto tabular-nums text-muted-foreground">
        {count}
      </span>
    </button>
  );
}
