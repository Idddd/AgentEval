import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AgentCreationExperience } from "@/components/agents/agent-creation-experience";
import { DeleteInstanceDialog } from "@/components/instances/delete-instance-dialog";
import { InstanceAuditorLogTab } from "@/components/instances/instance-auditor-log-tab";
import { InstanceCapabilitiesTab } from "@/components/instances/instance-capabilities-tab";
import { InstanceConfigurationTab } from "@/components/instances/instance-configuration-tab";
import { InstanceHeader } from "@/components/instances/instance-detail-header";
import { instanceDetailTabSearchValues, getInstanceAccessState, normalizeInstanceDetailTab, resolveAvailableInstanceDetailTab } from "@/components/instances/instance-detail-model";
import { InstanceDetailErrorState, InstanceDetailSkeleton, InstanceNotFoundState } from "@/components/instances/instance-detail-states";
import { InstanceTabs } from "@/components/instances/instance-detail-tabs";
import { InstanceOverviewTab } from "@/components/instances/instance-overview-tab";
import { InstanceTerminalTab } from "@/components/instances/instance-terminal-tab";
import { ApiError, api } from "@/lib/api";
import { getAgentPlatformPresentation } from "@/lib/agent-platforms";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { useEffect, useRef, useState } from "react";

const tabSearch = z.preprocess(
  (value) => typeof value === "string" && instanceDetailTabSearchValues.includes(value as (typeof instanceDetailTabSearchValues)[number]) ? value : undefined,
  z.enum(instanceDetailTabSearchValues).optional(),
);

export const Route = createFileRoute("/$projectId/instances/$instanceId")({
  validateSearch: z.object({ creating: z.boolean().optional(), tab: tabSearch }),
  component: AgentDetail,
});

function AgentDetail() {
  const { instanceId: agentId, projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scope = useProjectQueryScope();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const activeTab = normalizeInstanceDetailTab(search.tab);

  const agent = useQuery({
    queryKey: scope.key("agent", agentId),
    queryFn: () => api.getAgent(agentId),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 2,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (activeTab === "terminal") return 5_000;
      if (status !== "PROVISIONING" && status !== "DESTROYING") return false;
      return typeof document !== "undefined" && document.visibilityState === "hidden" ? 15_000 : 5_000;
    },
  });
  const modelRouting = useQuery({
    queryKey: scope.key("model-routing", agent.data?.modelRoutingId),
    queryFn: () => api.getModelRouting(agent.data!.modelRoutingId),
    enabled: Boolean(agent.data?.modelRoutingId),
    retry: 1,
    staleTime: 30_000,
  });
  const terminalTargets = useQuery({
    queryKey: scope.key("agent-terminal-targets", agentId),
    queryFn: () => api.getTerminalTargets(agentId),
    enabled: agent.data?.status === "READY" && !search.creating,
    retry: 1,
    staleTime: 5_000,
    refetchInterval: activeTab === "terminal" ? 5_000 : false,
  });
  const audit = useQuery({
    queryKey: scope.key("agent-audit", agentId),
    queryFn: () => api.getAgentAudit(agentId),
    enabled: Boolean(agent.data) && !search.creating,
    retry: 1,
    staleTime: 10_000,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteAgent(agentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scope.key("agents") });
      await navigate({ to: "/$projectId/instances", params: { projectId }, replace: true });
    },
  });
  const terminalWasOpen = useRef(false);
  const [terminalNotice, setTerminalNotice] = useState("");
  const access = agent.data
    ? getInstanceAccessState(agent.data, terminalTargets.data, {
        checking:
          agent.data.status === "READY" && terminalTargets.isPending,
        ...(terminalTargets.error
          ? {
              unavailableReason:
                "Terminal availability could not be verified.",
            }
          : {}),
      })
    : undefined;

  useEffect(() => {
    if (!agent.data || !access || activeTab !== "terminal") return;
    if (access.terminal.enabled) {
      terminalWasOpen.current = true;
      return;
    }
    if (agent.data.status === "READY" && terminalTargets.isPending) return;
    if (terminalWasOpen.current)
      setTerminalNotice(
        "Terminal disconnected because the agent is no longer healthy.",
      );
    terminalWasOpen.current = false;
    void navigate({
      to: "/$projectId/instances/$instanceId",
      params: { projectId, instanceId: agentId },
      search: { tab: "overview" },
      replace: true,
    });
  }, [access, activeTab, agent.data, agentId, navigate, terminalTargets.isPending]);

  if (agent.isPending) return <InstanceDetailSkeleton />;
  if (agent.error instanceof ApiError && agent.error.status === 404) return <InstanceNotFoundState />;
  if (agent.isError || !agent.data) return <InstanceDetailErrorState onRetry={() => void agent.refetch()} />;
  if (search.creating) return <AgentCreationExperience agent={agent.data} />;

  const platform = getAgentPlatformPresentation(agent.data.agentPlatform);
  if (!access) return <InstanceDetailErrorState onRetry={() => void agent.refetch()} />;
  const renderedTab = resolveAvailableInstanceDetailTab(
    activeTab,
    access.terminal,
  );

  return (
    <div>
      <InstanceHeader access={access} agent={agent.data} platform={platform} onDelete={() => setDeleteOpen(true)} />
      <InstanceTabs active={renderedTab} agentId={agentId} terminal={access.terminal} />
      {terminalNotice ? <p role="status" className="mt-4 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-sm">{terminalNotice}</p> : null}
      {renderedTab === "overview" ? <InstanceOverviewTab access={access} agent={agent.data} platform={platform} auditLoading={audit.isLoading} {...(audit.data ? { auditEvents: audit.data } : {})} {...(modelRouting.data?.name ? { modelRoutingName: modelRouting.data.name } : {})} /> : null}
      {renderedTab === "configuration" ? <InstanceConfigurationTab agent={agent.data} platform={platform} /> : null}
      {renderedTab === "capabilities" ? <InstanceCapabilitiesTab agent={agent.data} /> : null}
      {renderedTab === "terminal" ? <InstanceTerminalTab agent={agent.data} targets={(terminalTargets.data ?? []).filter((target) => target.available)} /> : null}
      {renderedTab === "auditor-log" ? <InstanceAuditorLogTab agent={agent.data} /> : null}
      <DeleteInstanceDialog open={deleteOpen} onOpenChange={setDeleteOpen} instanceName={agent.data.name} deleting={remove.isPending} onConfirm={() => remove.mutate()} {...(remove.error instanceof Error ? { error: remove.error.message } : {})} />
    </div>
  );
}
