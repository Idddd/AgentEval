import { Link } from "@tanstack/react-router";
import type { InstanceAccessState, InstanceDetailTab } from "./instance-detail-model";
import { instanceDetailTabs } from "./instance-detail-model";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCurrentProjectId } from "@/hooks/use-project";

const labels: Record<InstanceDetailTab, string> = {
  overview: "Overview",
  configuration: "Configuration",
  capabilities: "Access",
  terminal: "Terminal",
  "auditor-log": "Auditor Log",
};

export function InstanceTabs({ active, agentId, terminal }: { active: InstanceDetailTab; agentId: string; terminal: InstanceAccessState["terminal"] }) {
  const projectId = useCurrentProjectId();
  return (
    <Tabs value={active} activationMode="manual">
      <nav aria-label="Instance detail sections" className="-mx-1 overflow-x-auto">
        <TabsList variant="line" className="min-w-max px-1">
          {instanceDetailTabs.map((tab) => {
            const disabled = tab === "terminal" && !terminal.enabled;
            if (disabled)
              return (
                <Tooltip key={tab}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <TabsTrigger
                        value={tab}
                        disabled
                        aria-label={`Terminal unavailable. ${terminal.disabledReason ?? "Terminal access is unavailable."}`}
                        className="pointer-events-none"
                      >
                        {labels[tab]}
                      </TabsTrigger>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{terminal.disabledReason}</TooltipContent>
                </Tooltip>
              );
            return (
              <TabsTrigger key={tab} value={tab} asChild>
                <Link
                  to="/$projectId/instances/$instanceId"
                  params={{ projectId, instanceId: agentId }}
                  search={{ tab }}
                >
                  {labels[tab]}
                </Link>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </nav>
    </Tabs>
  );
}
