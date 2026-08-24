export interface AgentGardenFacetGroup {
  title: string;
  tags: readonly string[];
}

export const agentGardenFacetGroups: readonly AgentGardenFacetGroup[] = [
  {
    title: "Core AI Capabilities & Tasks",
    tags: [
      "Human-in-the-Loop",
      "RAG",
      "Image Generation",
      "Invoice Processing",
      "Finance",
      "Continuous Learning",
    ],
  },
  {
    title: "Tools & Integrations",
    tags: [
      "Google Search",
      "Agent tool",
      "Function tool",
      "Custom tool",
      "Java",
      "Spanner",
    ],
  },
  {
    title: "Data Sources, Types & Management",
    tags: [
      "Database",
      "Structured data",
      "BigQuery",
      "Multimedia",
      "Live streaming",
      "BQML",
    ],
  },
  {
    title: "Agent Architecture & Design Patterns",
    tags: [
      "Multi-agent",
      "RAG engine",
      "Input and output schema",
      "Updatable context",
      "Dynamic instructions",
      "Single-agent",
    ],
  },
  {
    title: "Use Cases",
    tags: [
      "SDLC",
      "Software Engineering",
      "Customer Support",
      "Research",
      "Healthcare",
      "Travel",
    ],
  },
];
