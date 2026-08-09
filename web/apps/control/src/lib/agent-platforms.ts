import {
  agentPlatforms,
  defaultAgentPlatformId,
  type AgentPlatformId,
} from "@tasklattice/contracts";

const platformBrandAssets: Partial<Record<AgentPlatformId, string>> = {
  openclaw: "/assets/brands/openclaw-lobehub.webp",
  hermes: "/assets/brands/hermesagent-lobehub.webp",
};

export const agentRuntimePresentation = {
  name: "OpenShell",
  description: "Sandbox execution and isolation runtime",
} as const;

export const agentConfigurationPresentation = {
  name: "NemoClaw",
  description: "Configures the selected Agent inside OpenShell",
} as const;

export const agentPlatformPresentations = agentPlatforms.map((platform) => ({
  ...platform,
  brandAsset: platformBrandAssets[platform.id],
  configurationLabel: `${agentConfigurationPresentation.name} configuration`,
  configurationName: agentConfigurationPresentation.name,
  consoleLabel: `${platform.name} Console`,
  runtimeName: agentRuntimePresentation.name,
}));

export type AgentPlatformPresentation =
  (typeof agentPlatformPresentations)[number];

export function getAgentPlatformPresentation(
  id: AgentPlatformId = defaultAgentPlatformId,
): AgentPlatformPresentation {
  return (
    agentPlatformPresentations.find((platform) => platform.id === id) ??
    agentPlatformPresentations[0]!
  );
}
