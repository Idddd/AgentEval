import {
  agentGardenEntrySchema,
  type AgentGardenEntry,
} from "@tasklattice/contracts";

const common = {
  source: "BUILT_IN" as const,
  endpoint: null,
  agentCardUrl: null,
  authType: "none" as const,
  authReference: "",
  internalNetworkOnly: false,
  configuration: {},
  skills: [],
  createdAt: null,
  updatedAt: null,
  lastDiscoveredAt: null,
  lastDiscoveryError: null,
};

export const builtInAgentCatalog: AgentGardenEntry[] = [
  {
    ...common,
    id: "openclaw-generalist",
    name: "OpenClaw Generalist",
    description:
      "A general-purpose interactive Agent for browser tasks, terminal work, and multi-step automation.",
    integrationType: "openclaw",
    platformLabel: "OpenClaw",
    category: "General",
    owner: "TaskLattice",
    tags: ["Automation", "Browser", "Coding"],
    status: "READY",
    usageMode: "INTERACTIVE",
    usageCapabilities: {
      interactive: true,
      canDelegate: true,
      acceptsDelegation: false,
    },
    specializationId: "general-purpose",
  },
  {
    ...common,
    id: "hermes-deep-researcher",
    name: "Hermes Deep Researcher",
    description:
      "Investigates complex questions with durable memory, evidence gathering, and synthesis.",
    integrationType: "hermes",
    platformLabel: "Hermes",
    category: "Research",
    owner: "TaskLattice",
    tags: ["Research", "RAG", "Memory"],
    status: "READY",
    usageMode: "INTERACTIVE",
    usageCapabilities: {
      interactive: true,
      canDelegate: true,
      acceptsDelegation: false,
    },
    specializationId: "research-analyst",
  },
  {
    ...common,
    id: "claude-code",
    name: "Claude Code",
    description:
      "A repository-native interactive coding Agent. Runtime integration is on the TaskLattice roadmap.",
    integrationType: "claude-code",
    platformLabel: "Claude Code",
    category: "Developer Tools",
    owner: "TaskLattice",
    tags: ["Coding", "Repository"],
    status: "COMING_SOON",
    usageMode: "INTERACTIVE",
    usageCapabilities: {
      interactive: true,
      canDelegate: false,
      acceptsDelegation: false,
    },
    specializationId: null,
  },
].map((entry) => agentGardenEntrySchema.parse(entry));
