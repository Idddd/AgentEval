import type {
  AgentConnection,
  AgentGardenEntry,
  AgentGardenSnapshot,
  CreateAgentConnectionInput,
  CreateAgentGardenEntryInput,
} from "@tasklattice/contracts";

const SEEDED_AT = "2026-07-26T00:00:00.000Z";

interface CatalogFixture {
  category: string;
  description: string;
  framework: string;
  icon: string;
  id: string;
  language: string;
  name: string;
  platformLabel: string;
  tags: string[];
  integrationType?: AgentGardenEntry["integrationType"];
}

const blueprintFixtures: CatalogFixture[] = [
  {
    id: "github-daily-triage",
    name: "GitHub Daily Triage",
    description: "Reviews repository activity and prepares a prioritized daily engineering triage.",
    platformLabel: "A2A Standard",
    category: "Developer Tools",
    framework: "A2A",
    icon: "github",
    language: "TypeScript",
    tags: ["Automation", "SDLC", "Agent tool"],
  },
  {
    id: "pull-request-risk-scanner",
    name: "Pull Request Risk Scanner",
    description: "Scans proposed code changes and summarizes review, rollout, and testing risks.",
    platformLabel: "A2A Standard",
    category: "Developer Tools",
    framework: "A2A",
    icon: "scan-search",
    language: "TypeScript",
    tags: ["Software Engineering", "SDLC", "Human-in-the-Loop"],
  },
  {
    id: "release-notes-composer",
    name: "Release Notes Composer",
    description: "Turns merged work into audience-focused release notes and operator follow-ups.",
    platformLabel: "A2A Standard",
    category: "Productivity",
    framework: "A2A",
    icon: "notebook-pen",
    language: "TypeScript",
    tags: ["Release", "Writing", "Automation"],
  },
  {
    id: "langgraph-support-escalation-router",
    name: "Support Escalation Router",
    description: "Routes support cases through classification, policy checks, approval, and response handoff.",
    platformLabel: "LangGraph",
    category: "Customer Support",
    framework: "LangGraph",
    icon: "workflow",
    language: "Python",
    tags: ["Workflow", "Human-in-the-Loop", "Customer Support"],
    integrationType: "langgraph",
  },
  {
    id: "adk-customer-service",
    name: "Customer Service",
    description: "Analyzes customer evidence and prepares relevant recommendations, discounts, and support actions.",
    platformLabel: "ADK",
    category: "Customer Support",
    framework: "Google ADK",
    icon: "headphones",
    language: "Python",
    tags: ["Human-in-the-Loop", "Multimedia", "Agent tool"],
  },
  {
    id: "adk-global-kyc-agent",
    name: "Global KYC Agent",
    description: "Builds an evidence-backed KYC review across company registries and regulatory filings.",
    platformLabel: "ADK",
    category: "Finance",
    framework: "Google ADK",
    icon: "landmark",
    language: "Python",
    tags: ["Finance", "RAG", "Structured data"],
  },
  {
    id: "adk-nurse-handover",
    name: "Nurse Handover",
    description: "Summarizes clinical shift records into a structured handover with risks and follow-up actions.",
    platformLabel: "ADK",
    category: "Healthcare",
    framework: "Google ADK",
    icon: "clipboard-plus",
    language: "Python",
    tags: ["Healthcare", "Structured data", "Human-in-the-Loop"],
  },
  {
    id: "adk-deep-search",
    name: "Deep Search",
    description: "Coordinates research that searches, evaluates, and synthesizes evidence for complex questions.",
    platformLabel: "ADK",
    category: "Research",
    framework: "Google ADK",
    icon: "scan-search",
    language: "Python",
    tags: ["Research", "RAG", "Google Search"],
  },
  {
    id: "adk-cyber-guardian",
    name: "Cyber Guardian",
    description: "Coordinates security alert triage and produces an auditable incident response plan.",
    platformLabel: "ADK",
    category: "Security",
    framework: "Google ADK",
    icon: "shield-check",
    language: "Python",
    tags: ["Security", "Multi-agent", "Human-in-the-Loop"],
  },
  {
    id: "adk-academic-research",
    name: "Academic Research",
    description: "Finds publications, clusters related work, and surfaces emerging areas for researchers.",
    platformLabel: "ADK",
    category: "Research",
    framework: "Google ADK",
    icon: "library-big",
    language: "Python",
    tags: ["Research", "RAG", "Continuous Learning"],
  },
  {
    id: "adk-small-business-loans",
    name: "Small Business Loans",
    description: "Coordinates document extraction and underwriting into a reviewable lending recommendation.",
    platformLabel: "ADK",
    category: "Finance",
    framework: "Google ADK",
    icon: "hand-coins",
    language: "Python",
    tags: ["Finance", "Invoice Processing", "Human-in-the-Loop"],
  },
  {
    id: "adk-software-bug-assistant",
    name: "Software Bug Assistant",
    description: "Queries engineering context to diagnose software issues and prepare focused remediation plans.",
    platformLabel: "ADK",
    category: "Developer Tools",
    framework: "Google ADK",
    icon: "bug",
    language: "Java",
    tags: ["Software Engineering", "SDLC", "Agent tool"],
  },
  {
    id: "adk-travel-concierge",
    name: "Travel Concierge",
    description: "Orchestrates personalized travel planning, itinerary changes, and real-time journey alerts.",
    platformLabel: "ADK",
    category: "Travel",
    framework: "Google ADK",
    icon: "plane",
    language: "Python",
    tags: ["Travel", "Google Search", "Multi-agent"],
  },
  {
    id: "adk-time-series-forecasting",
    name: "Time Series Forecasting",
    description: "Builds and explains forecasts from historical signals with uncertainty and follow-up thresholds.",
    platformLabel: "ADK",
    category: "Data",
    framework: "Google ADK",
    icon: "chart",
    language: "Python",
    tags: ["Structured data", "BigQuery", "Continuous Learning"],
  },
  {
    id: "adk-llm-auditor",
    name: "LLM Auditor",
    description: "Evaluates model responses against quality, safety, and policy criteria for review.",
    platformLabel: "ADK",
    category: "Governance",
    framework: "Google ADK",
    icon: "shield-check",
    language: "Python",
    tags: ["Governance", "Evaluation", "Human-in-the-Loop"],
  },
  {
    id: "adk-personalized-shopping",
    name: "Personalized Shopping",
    description: "Builds explainable product recommendations from preferences, constraints, and catalog data.",
    platformLabel: "ADK",
    category: "Commerce",
    framework: "Google ADK",
    icon: "shopping-bag",
    language: "Python",
    tags: ["Commerce", "Recommendations", "Structured data"],
  },
];

const commonBuiltIn = {
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

const builtInFixtures: AgentGardenEntry[] = [
  {
    ...commonBuiltIn,
    id: "openclaw-generalist",
    name: "OpenClaw Generalist",
    description: "A general-purpose interactive Agent for browser tasks, terminal work, and multi-step automation.",
    integrationType: "openclaw",
    platformLabel: "OpenClaw",
    category: "General",
    owner: "TaskLattice",
    tags: ["Automation", "Browser", "Coding"],
    status: "READY",
    usageMode: "INTERACTIVE",
    usageCapabilities: { interactive: true, canDelegate: true, acceptsDelegation: false },
    specializationId: "general-purpose",
  },
  {
    ...commonBuiltIn,
    id: "hermes-deep-researcher",
    name: "Hermes Deep Researcher",
    description: "Investigates complex questions with durable memory, evidence gathering, and synthesis.",
    integrationType: "hermes",
    platformLabel: "Hermes",
    category: "Research",
    owner: "TaskLattice",
    tags: ["Research", "RAG", "Memory"],
    status: "READY",
    usageMode: "INTERACTIVE",
    usageCapabilities: { interactive: true, canDelegate: true, acceptsDelegation: false },
    specializationId: "research-analyst",
  },
  {
    ...commonBuiltIn,
    id: "claude-code",
    name: "Claude Code",
    description: "A repository-native interactive coding Agent whose runtime integration is on the roadmap.",
    integrationType: "claude-code",
    platformLabel: "Claude Code",
    category: "Developer Tools",
    owner: "TaskLattice",
    tags: ["Coding", "Repository"],
    status: "COMING_SOON",
    usageMode: "INTERACTIVE",
    usageCapabilities: { interactive: true, canDelegate: false, acceptsDelegation: false },
    specializationId: null,
  },
];

const catalogFixtures: AgentGardenEntry[] = blueprintFixtures.map((fixture, index) => ({
  id: fixture.id,
  name: fixture.name,
  description: fixture.description,
  source: "BUILT_IN",
  integrationType: fixture.integrationType ?? "a2a",
  platformLabel: fixture.platformLabel,
  category: fixture.category,
  owner: fixture.id.startsWith("adk-") ? "TaskLattice Example Store" : "TaskLattice Demo",
  tags: fixture.tags,
  status: "READY",
  usageMode: "CALLABLE",
  usageCapabilities: { interactive: false, canDelegate: false, acceptsDelegation: true },
  endpoint: `https://demo.invalid/api/v1/demo-agents/${fixture.id}`,
  agentCardUrl: `https://demo.invalid/api/v1/demo-agents/${fixture.id}/agent-card`,
  authType: "none",
  authReference: "",
  internalNetworkOnly: true,
  configuration: {
    catalogKind: fixture.id.startsWith("adk-") ? "EXAMPLE_BLUEPRINT" : "TASKLATTICE_DEMO",
    catalogOrder: String(index),
    catalogVersion: "2026-07-26.3",
    previewMode: "DETERMINISTIC",
    framework: fixture.framework,
    icon: fixture.icon,
    language: fixture.language,
  },
  skills: [
    {
      id: `${fixture.id}-primary-skill`,
      name: `${fixture.name} workflow`,
      description: `Runs the reviewable ${fixture.name} example workflow.`,
      tags: fixture.tags.slice(0, 2),
    },
  ],
  specializationId: null,
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
  lastDiscoveredAt: null,
  lastDiscoveryError: null,
}));

function clone<T>(value: T): T {
  return structuredClone(value);
}

function connectionId(sequence: number): string {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

export function createUiDemoAgentGardenRuntime() {
  let agents = clone([...builtInFixtures, ...catalogFixtures]);
  let connections: AgentConnection[] = [];
  let sequence = 1;

  return {
    async snapshot(): Promise<AgentGardenSnapshot> {
      return clone({ agents, connections });
    },

    async register(input: CreateAgentGardenEntryInput): Promise<AgentGardenEntry> {
      const now = new Date().toISOString();
      const agent: AgentGardenEntry = {
        ...input,
        id: `registered-${sequence++}`,
        source: "PROJECT_REGISTERED",
        platformLabel: input.integrationType,
        status: "UNCHECKED",
        usageCapabilities: {
          interactive: input.usageMode !== "CALLABLE",
          canDelegate: false,
          acceptsDelegation: input.usageMode !== "INTERACTIVE",
        },
        agentCardUrl: input.agentCardUrl ?? null,
        skills: [],
        specializationId: null,
        createdAt: now,
        updatedAt: now,
        lastDiscoveredAt: null,
        lastDiscoveryError: null,
      };
      agents = [...agents, agent];
      return clone(agent);
    },

    async discover(id: string): Promise<AgentGardenEntry> {
      const agent = agents.find((candidate) => candidate.id === id);
      if (!agent) throw new Error("Agent was not found.");
      const discovered = {
        ...agent,
        status: "READY" as const,
        lastDiscoveredAt: new Date().toISOString(),
        lastDiscoveryError: null,
      };
      agents = agents.map((candidate) => candidate.id === id ? discovered : candidate);
      return clone(discovered);
    },

    async remove(id: string): Promise<{ message: string }> {
      const agent = agents.find((candidate) => candidate.id === id);
      if (!agent || agent.source !== "PROJECT_REGISTERED") {
        throw new Error("Only Project-registered Agents can be removed.");
      }
      if (connections.some((connection) => connection.connectedAgentId === id)) {
        throw new Error("Disconnect this Agent before removing it.");
      }
      agents = agents.filter((candidate) => candidate.id !== id);
      return { message: "The Project-registered Agent was removed." };
    },

    async connect(input: CreateAgentConnectionInput): Promise<AgentConnection> {
      const now = new Date().toISOString();
      const connection: AgentConnection = {
        ...input,
        id: connectionId(sequence++),
        createdAt: now,
        updatedAt: now,
      };
      connections = [...connections, connection];
      return clone(connection);
    },

    async disconnect(id: string): Promise<{ message: string }> {
      connections = connections.filter((connection) => connection.id !== id);
      return { message: "Agent connection removed." };
    },
  };
}

export const uiDemoAgentGarden = createUiDemoAgentGardenRuntime();
