import type { Agent, TerminalTarget } from "@tasklattice/contracts";
import { AgentTerminalPanel } from "@/components/agents/agent-terminal-panel";

export function InstanceTerminalTab({
  agent,
  targets,
}: {
  agent: Agent;
  targets: TerminalTarget[];
}) {
  return (
    <div role="tabpanel" aria-label="Terminal" className="pt-5">
      <AgentTerminalPanel
        agentId={agent.id}
        agentPlatform={agent.agentPlatform}
        targets={targets}
      />
    </div>
  );
}
