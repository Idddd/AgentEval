import type { Agent, AgentStatus, TerminalTarget } from "@tasklattice/contracts";
import { formatPlatformDateTime } from "@/lib/platform-preferences";

export const instanceDetailTabs = ["overview", "configuration", "capabilities", "terminal", "auditor-log"] as const;
export type InstanceDetailTab = (typeof instanceDetailTabs)[number];
export const instanceDetailTabSearchValues = [...instanceDetailTabs, "activity"] as const;

export function normalizeInstanceDetailTab(value: unknown): InstanceDetailTab {
  if (value === "activity") return "auditor-log";
  return typeof value === "string" && instanceDetailTabs.includes(value as InstanceDetailTab)
    ? (value as InstanceDetailTab)
    : "overview";
}

export function resolveAvailableInstanceDetailTab(
  tab: InstanceDetailTab,
  terminal: InstanceAccessState["terminal"],
): InstanceDetailTab {
  return tab === "terminal" && !terminal.enabled ? "overview" : tab;
}

export type InstanceDisplayStatus = "creating" | "ready" | "failed" | "deleting";

export function getInstanceDisplayStatus(status: AgentStatus): InstanceDisplayStatus {
  if (status === "READY") return "ready";
  if (status === "FAILED") return "failed";
  if (status === "DESTROYING") return "deleting";
  return "creating";
}

export const instanceStatusConfig = {
  creating: { label: "Creating", tone: "info" },
  ready: { label: "Ready", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  deleting: { label: "Deleting", tone: "warning" },
} as const;

export type InstanceAccessState = {
  webUI: { enabled: boolean; url?: string; disabledReason?: string };
  terminal: { enabled: boolean; disabledReason?: string };
};

export function getTerminalAccessState(
  agent: Agent,
  targets?: TerminalTarget[],
  options: {
    canExecAgent?: boolean;
    checking?: boolean;
    unavailableReason?: string;
  } = {},
): InstanceAccessState["terminal"] {
  if (options.canExecAgent === false)
    return {
      enabled: false,
      disabledReason: "You do not have permission to open this terminal.",
    };
  if (agent.status === "PROVISIONING")
    return {
      enabled: false,
      disabledReason: "Terminal is unavailable while the agent is starting.",
    };
  if (agent.status === "DESTROYING")
    return {
      enabled: false,
      disabledReason: "Terminal is unavailable while the agent is stopping.",
    };
  if (agent.status !== "READY")
    return {
      enabled: false,
      disabledReason:
        "Terminal is unavailable because the agent is unhealthy.",
    };
  if (options.checking)
    return {
      enabled: false,
      disabledReason: "Checking terminal availability…",
    };
  if (options.unavailableReason)
    return {
      enabled: false,
      disabledReason: options.unavailableReason,
    };
  if (targets?.some((target) => target.available)) return { enabled: true };
  return {
    enabled: false,
    disabledReason:
      targets?.find((target) => target.reason)?.reason ??
      "Terminal availability could not be verified.",
  };
}

export function getInstanceAccessState(
  agent: Agent,
  targets?: TerminalTarget[],
  terminalOptions: Parameters<typeof getTerminalAccessState>[2] = {},
): InstanceAccessState {
  const ready = agent.status === "READY";
  const webUrl = agent.httpEndpoint?.status === "READY" ? agent.httpEndpoint.url : undefined;
  const webUI = ready && webUrl
    ? { enabled: true, url: webUrl }
    : {
        enabled: false,
        disabledReason: !ready
          ? "Web UI becomes available after the Instance is ready."
          : agent.httpEndpoint?.reason ?? "This Agent has not published a Web UI endpoint.",
      };
  return {
    webUI,
    terminal: getTerminalAccessState(agent, targets, terminalOptions),
  };
}

export function formatRelativeTime(value: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - new Date(value).getTime());
  if (elapsed < 60_000) return "Less than a minute ago";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatAbsoluteTime(value: string): string {
  return formatPlatformDateTime(value);
}

export function formatUptime(agent: Agent, now = Date.now()): string {
  if (agent.status !== "READY") return "—";
  const elapsed = Math.max(0, now - new Date(agent.createdAt).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainingMinutes}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function getCapabilityCounts(agent: Agent) {
  return {
    skills: agent.skillIds?.length ?? 0,
    mcpServers: agent.mcpServerIds?.length ?? 0,
    knowledgeBases: agent.knowledgeSourceIds?.length ?? 0,
  };
}

export function endpointStatus(agent: Agent): "available" | "pending" | "unavailable" | "failed" {
  if (agent.httpEndpoint?.status === "READY" && agent.httpEndpoint.url) return "available";
  if (agent.status === "FAILED") return "failed";
  if (agent.status === "PROVISIONING") return "pending";
  return "unavailable";
}
