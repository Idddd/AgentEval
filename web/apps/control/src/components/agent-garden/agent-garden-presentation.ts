import type {
  AgentGardenEntry,
  AgentGardenIntegrationType,
  AgentGardenRegisterableType,
} from "@tasklattice/contracts";

export interface AgentTypePresentation {
  description: string;
  label: string;
  shortLabel: string;
}

export const agentTypePresentations: Record<
  AgentGardenIntegrationType,
  AgentTypePresentation
> = {
  openclaw: {
    label: "OpenClaw",
    shortLabel: "OpenClaw",
    description: "Interactive OpenShell Agent runtime with delegation support.",
  },
  hermes: {
    label: "Hermes",
    shortLabel: "Hermes",
    description: "Interactive Agent runtime with durable memory and learning.",
  },
  "claude-code": {
    label: "Claude Code",
    shortLabel: "Claude Code",
    description: "Repository-native interactive coding Agent.",
  },
  a2a: {
    label: "A2A Standard",
    shortLabel: "A2A",
    description: "Discover an Agent Card from a standard A2A endpoint.",
  },
  langgraph: {
    label: "LangGraph",
    shortLabel: "LangGraph",
    description: "Connect through the LangGraph Platform API.",
  },
  langflow: {
    label: "LangFlow",
    shortLabel: "LangFlow",
    description: "Connect a deployed LangFlow Agent flow.",
  },
  "bedrock-agentcore": {
    label: "Bedrock AgentCore",
    shortLabel: "Bedrock",
    description: "Connect an AWS-hosted AgentCore runtime.",
  },
  "azure-ai-foundry": {
    label: "Azure AI Foundry",
    shortLabel: "Azure AI",
    description: "Connect a Microsoft Foundry Agent.",
  },
  "pydantic-ai": {
    label: "Pydantic AI",
    shortLabel: "Pydantic AI",
    description: "Connect a Pydantic AI Agent over A2A.",
  },
  "vertex-ai-agent-engine": {
    label: "Vertex AI Agent Engine",
    shortLabel: "Vertex AI",
    description: "Connect a Vertex AI Reasoning Engine.",
  },
  "watsonx-orchestrate": {
    label: "watsonx Orchestrate",
    shortLabel: "watsonx",
    description: "Connect an IBM Cloud or CP4D Agent.",
  },
  custom: {
    label: "Custom / Other",
    shortLabel: "Custom",
    description: "Register a generic remote Agent endpoint.",
  },
};

export const registerableAgentTypes: readonly AgentGardenRegisterableType[] = [
  "a2a",
  "langgraph",
  "langflow",
  "bedrock-agentcore",
  "azure-ai-foundry",
  "pydantic-ai",
  "vertex-ai-agent-engine",
  "watsonx-orchestrate",
  "custom",
];

export function usageModeLabel(
  mode: "INTERACTIVE" | "CALLABLE" | "HYBRID",
): string {
  if (mode === "INTERACTIVE") return "Interactive";
  if (mode === "CALLABLE") return "Callable";
  return "Interactive + callable";
}

export function agentStatusLabel(
  status: "READY" | "COMING_SOON" | "UNCHECKED" | "UNAVAILABLE",
): string {
  if (status === "COMING_SOON") return "Coming soon";
  if (status === "UNCHECKED") return "Checking";
  if (status === "UNAVAILABLE") return "Needs attention";
  return "Ready";
}

export function isPreviewAgent(agent: AgentGardenEntry): boolean {
  return agent.configuration.previewMode === "DETERMINISTIC";
}

export function previewAgentLabel(agent: AgentGardenEntry): string {
  return agent.configuration.catalogKind === "EXAMPLE_BLUEPRINT"
    ? "Blueprint"
    : "Demo";
}
