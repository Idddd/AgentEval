import type { DemoAgentDefinition } from "./demo-agent-runtime";

function preview(
  title: string,
  lines: string[],
): (prompt: string) => string {
  return (prompt) => [
    `${title} preview`,
    "",
    ...lines.map((line) => `• ${line}`),
    "",
    `Task interpreted as: “${prompt.slice(0, 180)}”`,
    "This blueprint uses sample data and does not call an external system.",
  ].join("\n");
}

export const exampleStoreAgentDefinitions: DemoAgentDefinition[] = [
  {
    id: "adk-customer-service",
    name: "Customer Service",
    description:
      "Analyzes issues from streamed video or uploaded images, then prepares relevant recommendations, discounts, and support actions.",
    integrationType: "a2a",
    platformLabel: "ADK",
    category: "Customer Support",
    catalogKind: "EXAMPLE_BLUEPRINT",
    framework: "Google ADK",
    icon: "headphones",
    language: "Python",
    tags: [
      "Human-in-the-Loop",
      "Multimedia",
      "Live streaming",
      "Agent tool",
      "Custom tool",
      "Single-agent",
    ],
    skills: [
      {
        id: "analyze-multimedia-support-case",
        name: "Analyze multimedia support case",
        description:
          "Extracts the issue, product context, and customer intent from text, images, or streamed evidence.",
        tags: ["Multimedia", "Customer Support"],
      },
      {
        id: "recommend-customer-resolution",
        name: "Recommend customer resolution",
        description:
          "Prepares a bounded resolution with an escalation path for human approval.",
        tags: ["Human-in-the-Loop", "Recommendations"],
      },
    ],
    examplePrompts: [
      "Review this damaged-product case and recommend the next support action.",
      "Summarize the customer issue and show what needs human approval.",
    ],
    trace: ["Intake", "Analyze evidence", "Policy check", "Resolution"],
    response: preview("Customer service", [
      "Issue classified as a damaged delivery with high customer impact.",
      "Recommended action: replacement shipment plus a shipping-fee credit.",
      "Human approval is required before applying the account credit.",
    ]),
  },
  {
    id: "adk-global-kyc-agent",
    name: "Global KYC Agent",
    description:
      "Builds an evidence-backed KYC review using company registry and regulatory filing data across jurisdictions.",
    integrationType: "a2a",
    platformLabel: "ADK",
    category: "Finance",
    catalogKind: "EXAMPLE_BLUEPRINT",
    framework: "Google ADK",
    icon: "landmark",
    language: "Python",
    tags: [
      "RAG",
      "Google Search",
      "Database",
      "Structured data",
      "Multi-agent",
      "Finance",
    ],
    skills: [
      {
        id: "verify-entity-kyc",
        name: "Verify entity KYC",
        description:
          "Checks entity identity, ownership indicators, and jurisdiction-specific registry evidence.",
        tags: ["KYC", "Finance"],
      },
      {
        id: "assemble-kyc-evidence",
        name: "Assemble KYC evidence",
        description:
          "Produces a review packet with sources, conflicts, and manual-review flags.",
        tags: ["RAG", "Structured data"],
      },
    ],
    examplePrompts: [
      "Prepare a KYC review for an international supplier.",
      "Show the evidence and unresolved risks for this company.",
    ],
    trace: ["Resolve entity", "Collect filings", "Cross-check", "Risk review"],
    response: preview("Global KYC", [
      "Entity identity and registered address are consistent across sample sources.",
      "One beneficial-owner record requires manual verification.",
      "Recommended disposition: enhanced review before onboarding.",
    ]),
  },
  {
    id: "adk-nurse-handover",
    name: "Nurse Handover",
    description:
      "Summarizes detailed clinical shift records into a concise, structured handover with risks and follow-up actions.",
    integrationType: "a2a",
    platformLabel: "ADK",
    category: "Healthcare",
    catalogKind: "EXAMPLE_BLUEPRINT",
    framework: "Google ADK",
    icon: "clipboard-plus",
    language: "Python",
    tags: [
      "Human-in-the-Loop",
      "RAG",
      "Structured data",
      "Updatable context",
      "Dynamic instructions",
      "Input and output schema",
    ],
    skills: [
      {
        id: "summarize-clinical-handover",
        name: "Summarize clinical handover",
        description:
          "Transforms shift records into a structured situation, background, assessment, and recommendation summary.",
        tags: ["Healthcare", "Structured data"],
      },
      {
        id: "flag-handover-risk",
        name: "Flag handover risk",
        description:
          "Highlights incomplete observations and items requiring clinician review.",
        tags: ["Human-in-the-Loop", "Risk"],
      },
    ],
    examplePrompts: [
      "Prepare an ISBAR-style handover from these sample shift notes.",
      "Summarize the case and flag anything a clinician must verify.",
    ],
    trace: ["Normalize notes", "Build handover", "Flag gaps", "Clinician review"],
    response: preview("Nurse handover", [
      "Situation: stable after treatment, with pain improving during the shift.",
      "Watch item: the latest observation set is incomplete.",
      "Next shift should confirm medication timing and repeat observations.",
    ]),
  },
  {
    id: "adk-deep-search",
    name: "Deep Search",
    description:
      "Coordinates a modular research workflow that searches, evaluates, and synthesizes evidence for complex questions.",
    integrationType: "a2a",
    platformLabel: "ADK",
    category: "Research",
    catalogKind: "EXAMPLE_BLUEPRINT",
    framework: "Google ADK",
    icon: "scan-search",
    language: "Python",
    tags: [
      "RAG",
      "Google Search",
      "Agent tool",
      "Function tool",
      "RAG engine",
      "Dynamic instructions",
    ],
    skills: [
      {
        id: "perform-deep-search",
        name: "Perform deep search",
        description:
          "Breaks a complex question into bounded research threads and evaluates candidate evidence.",
        tags: ["Research", "Google Search"],
      },
      {
        id: "synthesize-research-evidence",
        name: "Synthesize research evidence",
        description:
          "Produces a concise answer with source quality and uncertainty notes.",
        tags: ["RAG", "Synthesis"],
      },
    ],
    examplePrompts: [
      "Research the major approaches to enterprise Agent governance.",
      "Compare the evidence for three possible implementation strategies.",
    ],
    trace: ["Plan research", "Search", "Evaluate sources", "Synthesize"],
    response: preview("Deep search", [
      "The sample evidence favors explicit capability contracts over role-name inference.",
      "Human approval remains the most common control for high-impact actions.",
      "The final answer should preserve source quality and unresolved disagreement.",
    ]),
  },
  {
    id: "adk-cyber-guardian",
    name: "Cyber Guardian",
    description:
      "Coordinates multi-agent triage and investigation to accelerate security-alert response and produce an auditable action plan.",
    integrationType: "a2a",
    platformLabel: "ADK",
    category: "Security",
    catalogKind: "EXAMPLE_BLUEPRINT",
    framework: "Google ADK",
    icon: "shield-check",
    language: "Python",
    tags: [
      "Human-in-the-Loop",
      "Multi-agent",
      "Function tool",
      "Database",
      "Live streaming",
      "SDLC",
      "Software Engineering",
    ],
    skills: [
      {
        id: "triage-security-alert",
        name: "Triage security alert",
        description:
          "Correlates sample alert evidence and assigns a bounded severity.",
        tags: ["Security", "Triage"],
      },
      {
        id: "coordinate-threat-response",
        name: "Coordinate threat response",
        description:
          "Builds containment, investigation, and human-approval steps.",
        tags: ["Multi-agent", "Human-in-the-Loop"],
      },
    ],
    examplePrompts: [
      "Triage this suspicious authentication alert.",
      "Create a response plan and show which containment step needs approval.",
    ],
    trace: ["Correlate alerts", "Assess severity", "Plan containment", "Approve"],
    response: preview("Cyber Guardian", [
      "Severity: High due to impossible travel and a privileged account.",
      "Recommended containment: revoke active sessions and rotate the credential.",
      "Account suspension remains behind a human approval gate.",
    ]),
  },
  {
    id: "adk-academic-research",
    name: "Academic Research",
    description:
      "Helps researchers identify recent publications, cluster related work, and surface emerging research areas.",
    integrationType: "a2a",
    platformLabel: "ADK",
    category: "Research",
    catalogKind: "EXAMPLE_BLUEPRINT",
    framework: "Google ADK",
    icon: "library-big",
    language: "Python",
    tags: [
      "RAG",
      "Google Search",
      "BigQuery",
      "Structured data",
      "Continuous Learning",
      "RAG engine",
    ],
    skills: [
      {
        id: "discover-academic-research",
        name: "Discover academic research",
        description:
          "Finds and groups publications for a bounded research question.",
        tags: ["Research", "RAG"],
      },
      {
        id: "map-emerging-topics",
        name: "Map emerging topics",
        description:
          "Identifies topic clusters, evidence gaps, and candidate follow-up queries.",
        tags: ["Continuous Learning", "Structured data"],
      },
    ],
    examplePrompts: [
      "Find emerging research themes in multi-agent evaluation.",
      "Create a reading list and identify evidence gaps.",
    ],
    trace: ["Define scope", "Discover papers", "Cluster topics", "Review gaps"],
    response: preview("Academic research", [
      "Three sample clusters emerged: evaluation reliability, coordination protocols, and human oversight.",
      "The newest cluster has promising results but limited replication.",
      "Recommended next step: prioritize surveys and independently reproduced studies.",
    ]),
  },
  {
    id: "adk-small-business-loans",
    name: "Small Business Loans",
    description:
      "Coordinates document extraction and underwriting steps from loan intake through a reviewable lending recommendation.",
    integrationType: "a2a",
    platformLabel: "ADK",
    category: "Finance",
    catalogKind: "EXAMPLE_BLUEPRINT",
    framework: "Google ADK",
    icon: "hand-coins",
    language: "Python",
    tags: [
      "Human-in-the-Loop",
      "Invoice Processing",
      "Finance",
      "Database",
      "Structured data",
      "Multi-agent",
      "Input and output schema",
    ],
    skills: [
      {
        id: "assess-loan-package",
        name: "Assess loan package",
        description:
          "Checks document completeness and extracts sample financial indicators.",
        tags: ["Finance", "Invoice Processing"],
      },
      {
        id: "route-underwriting-review",
        name: "Route underwriting review",
        description:
          "Produces a recommendation with policy reasons and manual-review gates.",
        tags: ["Human-in-the-Loop", "Multi-agent"],
      },
    ],
    examplePrompts: [
      "Review this sample small-business loan package.",
      "Show missing documents and the recommended underwriting route.",
    ],
    trace: ["Intake", "Extract documents", "Policy evaluation", "Underwriter"],
    response: preview("Small business loans", [
      "The sample package is missing one recent bank statement.",
      "Cash-flow coverage is within the example policy range.",
      "Disposition: hold for document completion, then route to an underwriter.",
    ]),
  },
  {
    id: "adk-software-bug-assistant",
    name: "Software Bug Assistant",
    description:
      "Queries ticketing and engineering context to diagnose a software issue and prepare a focused remediation plan.",
    integrationType: "a2a",
    platformLabel: "ADK",
    category: "Developer Tools",
    catalogKind: "EXAMPLE_BLUEPRINT",
    framework: "Google ADK",
    icon: "bug",
    language: "Java",
    tags: [
      "Human-in-the-Loop",
      "Agent tool",
      "Function tool",
      "Java",
      "Spanner",
      "Database",
      "SDLC",
      "Software Engineering",
      "Dynamic instructions",
    ],
    skills: [
      {
        id: "diagnose-software-bug",
        name: "Diagnose software bug",
        description:
          "Correlates a sample ticket with logs, affected components, and recent changes.",
        tags: ["Java", "Software Engineering"],
      },
      {
        id: "propose-fix-plan",
        name: "Propose fix plan",
        description:
          "Returns a reproduction hypothesis, test plan, and review checkpoints.",
        tags: ["SDLC", "Human-in-the-Loop"],
      },
    ],
    examplePrompts: [
      "Diagnose the repeated timeout in this sample Java service.",
      "Prepare a fix plan and the tests required before merge.",
    ],
    trace: ["Read ticket", "Correlate evidence", "Form hypothesis", "Fix plan"],
    response: preview("Software bug assistant", [
      "Likely cause: a connection pool is exhausted after retry amplification.",
      "Proposed fix: cap retries and release timed-out connections deterministically.",
      "Required evidence: reproduction test, load test, and owner review.",
    ]),
  },
  {
    id: "adk-travel-concierge",
    name: "Travel Concierge",
    description:
      "Orchestrates a personalized journey from initial planning through real-time itinerary changes and travel alerts.",
    integrationType: "a2a",
    platformLabel: "ADK",
    category: "Travel",
    catalogKind: "EXAMPLE_BLUEPRINT",
    framework: "Google ADK",
    icon: "plane",
    language: "Python",
    tags: [
      "Google Search",
      "Agent tool",
      "Custom tool",
      "Structured data",
      "Updatable context",
      "Multi-agent",
    ],
    skills: [
      {
        id: "plan-travel-itinerary",
        name: "Plan travel itinerary",
        description:
          "Builds a sample itinerary from preferences, constraints, and availability.",
        tags: ["Travel", "Structured data"],
      },
      {
        id: "monitor-travel-journey",
        name: "Monitor travel journey",
        description:
          "Responds to sample disruptions and proposes bounded alternatives.",
        tags: ["Updatable context", "Multi-agent"],
      },
    ],
    examplePrompts: [
      "Plan a three-day business trip with one free afternoon.",
      "Re-route this sample itinerary after a flight cancellation.",
    ],
    trace: ["Collect preferences", "Plan", "Check constraints", "Update journey"],
    response: preview("Travel concierge", [
      "The sample itinerary groups meetings geographically to reduce transfer time.",
      "A flexible afternoon remains available for weather-dependent activities.",
      "One cancellation alternative requires traveler confirmation before rebooking.",
    ]),
  },
  {
    id: "adk-time-series-forecasting",
    name: "Time Series Forecasting",
    description:
      "Builds and explains a forecast from structured historical signals, including uncertainty and operational follow-ups.",
    integrationType: "a2a",
    platformLabel: "ADK",
    category: "Data",
    catalogKind: "EXAMPLE_BLUEPRINT",
    framework: "Google ADK",
    icon: "chart",
    language: "Python",
    tags: [
      "BQML",
      "BigQuery",
      "Structured data",
      "Database",
      "Continuous Learning",
      "Single-agent",
    ],
    skills: [
      {
        id: "forecast-time-series",
        name: "Forecast time series",
        description:
          "Produces a sample forecast with confidence bounds and detected seasonality.",
        tags: ["BQML", "BigQuery"],
      },
      {
        id: "explain-forecast",
        name: "Explain forecast",
        description:
          "Summarizes drivers, uncertainty, and monitoring thresholds.",
        tags: ["Continuous Learning", "Structured data"],
      },
    ],
    examplePrompts: [
      "Forecast weekly support volume for the next month.",
      "Explain the uncertainty and monitoring thresholds in this forecast.",
    ],
    trace: ["Validate series", "Fit forecast", "Check uncertainty", "Explain"],
    response: preview("Time series forecasting", [
      "The sample forecast shows a moderate weekly seasonal pattern.",
      "Expected volume rises 8% next month with a wide holiday confidence interval.",
      "Re-forecast if actual volume exceeds the upper bound for two periods.",
    ]),
  },
  {
    id: "adk-llm-auditor",
    name: "LLM Auditor",
    description:
      "Evaluates model responses against quality, safety, and policy criteria, then recommends reviewable guardrail changes.",
    integrationType: "a2a",
    platformLabel: "ADK",
    category: "Governance",
    catalogKind: "EXAMPLE_BLUEPRINT",
    framework: "Google ADK",
    icon: "scan-search",
    language: "Python",
    tags: [
      "Human-in-the-Loop",
      "RAG",
      "Function tool",
      "Input and output schema",
      "SDLC",
      "Software Engineering",
    ],
    skills: [
      {
        id: "audit-llm-output",
        name: "Audit LLM output",
        description:
          "Scores sample responses against evidence, policy, and response-contract criteria.",
        tags: ["Governance", "RAG"],
      },
      {
        id: "recommend-llm-guardrails",
        name: "Recommend LLM guardrails",
        description:
          "Proposes prompt, policy, and evaluation changes for human approval.",
        tags: ["Human-in-the-Loop", "SDLC"],
      },
    ],
    examplePrompts: [
      "Audit these sample Agent responses for evidence and policy gaps.",
      "Recommend guardrail changes and show which require approval.",
    ],
    trace: ["Load criteria", "Evaluate outputs", "Classify gaps", "Recommend"],
    response: preview("LLM auditor", [
      "Two sample responses state conclusions without enough evidence.",
      "One response violates the required structured-output contract.",
      "Recommended changes: source-required prompting and a schema validation gate.",
    ]),
  },
  {
    id: "adk-personalized-shopping",
    name: "Personalized Shopping",
    description:
      "Combines preferences, product evidence, and multimodal context to prepare transparent shopping recommendations.",
    integrationType: "a2a",
    platformLabel: "ADK",
    category: "Commerce",
    catalogKind: "EXAMPLE_BLUEPRINT",
    framework: "Google ADK",
    icon: "shopping-basket",
    language: "Python",
    tags: [
      "RAG",
      "Image Generation",
      "Google Search",
      "Multimedia",
      "Updatable context",
      "Dynamic instructions",
      "Multi-agent",
    ],
    skills: [
      {
        id: "personalize-shopping-options",
        name: "Personalize shopping options",
        description:
          "Matches sample products against preferences, constraints, and multimodal context.",
        tags: ["Commerce", "Multimedia"],
      },
      {
        id: "compare-product-tradeoffs",
        name: "Compare product trade-offs",
        description:
          "Explains why options were included and where evidence is incomplete.",
        tags: ["RAG", "Recommendations"],
      },
    ],
    examplePrompts: [
      "Recommend three products for this sample customer profile.",
      "Compare the options and explain the trade-offs.",
    ],
    trace: ["Read preferences", "Retrieve options", "Compare", "Explain"],
    response: preview("Personalized shopping", [
      "Three sample products satisfy the budget and compatibility constraints.",
      "The recommended option balances durability and total cost.",
      "One sustainability claim lacks enough evidence and is flagged for review.",
    ]),
  },
];
