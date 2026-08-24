import type {
  Agent,
  RuntimeStatus,
  TerminalTarget,
} from "@tasklattice/contracts";
import { agentPlatforms } from "@tasklattice/contracts";

export const primaryTerminalTargetId = "agent";

export function terminalTargetsForAgent(
  agent: Agent,
  capability: RuntimeStatus["terminal"],
): TerminalTarget[] {
  const platform = agentPlatforms.find((item) => item.id === agent.agentPlatform);
  const available = agent.status === "READY" && capability.available;
  return [
    {
      id: primaryTerminalTargetId,
      containerName: "agent",
      displayName: platform ? `${platform.name} Agent` : "Agent",
      primary: true,
      available,
      shells: [],
      ...(!available
        ? {
            reason:
              agent.status !== "READY"
                ? "Terminal is available only when the agent is healthy and running."
                : capability.reason ?? "This Agent does not expose a terminal target.",
          }
        : {}),
    },
  ];
}
