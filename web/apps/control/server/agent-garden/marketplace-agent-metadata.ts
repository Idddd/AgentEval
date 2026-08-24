import type {
  AgentMarketplaceBrief,
  AgentGardenEntry,
} from "@tasklattice/contracts";

type MarketplaceDefinition = {
  category: string;
  description: string;
  examplePrompts: string[];
  id: string;
  integrationType: "a2a" | "langgraph";
  name: string;
  platformLabel: string;
  skills: AgentGardenEntry["skills"];
};

const marketplaceBriefs: Record<string, AgentMarketplaceBrief> = {
  "adk-customer-service": {
    tagline: "Turn multimodal support evidence into a reviewable resolution.",
    overview:
      "Customer Service is a blueprint for support teams that receive a mixture of messages, product photos, and streamed evidence. It organizes the issue, identifies customer impact, recommends a bounded next action, and keeps account-changing decisions behind a human approval step.",
    useCases: [
      "Triage damaged-product and delivery cases with image evidence.",
      "Prepare consistent replacement, refund, or escalation recommendations.",
      "Create a concise handoff when a case requires specialist review.",
    ],
    inputs: [
      "Customer message or conversation summary",
      "Product images or streamed visual evidence",
      "Order, policy, and account context",
    ],
    outputs: [
      "Structured issue and impact summary",
      "Recommended resolution with policy rationale",
      "Explicit human-approval and escalation checklist",
    ],
    requirements: [
      "A READY OpenClaw or Hermes Coordinator for delegation",
      "Approved access to customer and order context",
      "Human approval policy for credits, refunds, or account changes",
    ],
  },
  "adk-global-kyc-agent": {
    tagline: "Assemble traceable KYC evidence across jurisdictions.",
    overview:
      "Global KYC Agent coordinates entity resolution, registry lookup, filing comparison, and risk review into one evidence-backed onboarding brief. It is designed to surface inconsistencies and missing ownership information instead of hiding uncertainty behind a single score.",
    useCases: [
      "Review an international supplier before onboarding.",
      "Compare company identity and ownership evidence across registries.",
      "Prepare an enhanced-review packet for a compliance analyst.",
    ],
    inputs: [
      "Company name, jurisdiction, and known identifiers",
      "Registry extracts and regulatory filings",
      "Organization-specific onboarding policy",
    ],
    outputs: [
      "Entity identity and ownership evidence map",
      "Conflicts, missing records, and manual-review flags",
      "Review disposition with cited rationale",
    ],
    requirements: [
      "Authorized registry or filing data sources",
      "Current KYC policy and jurisdiction rules",
      "Compliance reviewer for final disposition",
    ],
  },
  "adk-nurse-handover": {
    tagline: "Convert shift records into a concise, structured clinical handover.",
    overview:
      "Nurse Handover is a human-supervised summarization blueprint for turning detailed shift notes into a consistent handover. It organizes situation, background, assessment, and recommendations while highlighting incomplete observations that a clinician must verify.",
    useCases: [
      "Prepare an ISBAR-style end-of-shift handover.",
      "Surface incomplete observations and medication follow-ups.",
      "Standardize handover structure across wards or teams.",
    ],
    inputs: [
      "Shift notes and observation records",
      "Medication and treatment timeline",
      "Local handover schema and clinical instructions",
    ],
    outputs: [
      "Structured handover summary",
      "Watch items and missing-information flags",
      "Next-shift follow-up checklist",
    ],
    requirements: [
      "Approved access to relevant clinical records",
      "Organization-specific privacy and retention controls",
      "Clinician verification before operational use",
    ],
  },
  "adk-deep-search": {
    tagline: "Plan, evaluate, and synthesize evidence for complex questions.",
    overview:
      "Deep Search breaks an open-ended question into bounded research threads, evaluates candidate sources, and produces a synthesis that preserves uncertainty. It is suited to work where source quality and disagreement matter as much as the final answer.",
    useCases: [
      "Compare technical or market approaches before a decision.",
      "Build an evidence brief from multiple source types.",
      "Identify consensus, disagreement, and unanswered questions.",
    ],
    inputs: [
      "Research question and scope constraints",
      "Approved search and knowledge sources",
      "Source-quality and freshness criteria",
    ],
    outputs: [
      "Research plan and evidence inventory",
      "Source-quality and uncertainty notes",
      "Concise synthesis with recommended follow-ups",
    ],
    requirements: [
      "Approved search or knowledge integrations",
      "A clearly bounded research question",
      "Human review for high-impact conclusions",
    ],
  },
  "adk-cyber-guardian": {
    tagline: "Coordinate alert triage into an auditable response plan.",
    overview:
      "Cyber Guardian is a multi-agent security-response blueprint that correlates alert evidence, assigns a bounded severity, and prepares containment and investigation steps. High-impact actions remain visible and subject to existing access and approval policies.",
    useCases: [
      "Triage suspicious authentication and identity alerts.",
      "Correlate related alerts into a single incident timeline.",
      "Prepare containment steps for analyst approval.",
    ],
    inputs: [
      "Security alerts and identity events",
      "Asset, account, and recent-change context",
      "Incident severity and containment policies",
    ],
    outputs: [
      "Severity assessment with evidence",
      "Containment and investigation plan",
      "Approval-gated action checklist",
    ],
    requirements: [
      "Read access to approved security telemetry",
      "Current incident-response and access policies",
      "Security analyst approval for containment actions",
    ],
  },
  "adk-academic-research": {
    tagline: "Map recent literature and surface emerging research areas.",
    overview:
      "Academic Research helps researchers discover publications, cluster related work, and explain how a field is changing. The blueprint focuses on transparent grouping and citation-ready notes rather than presenting an opaque literature ranking.",
    useCases: [
      "Prepare a literature scan for a new research question.",
      "Cluster publications by method, dataset, or finding.",
      "Identify emerging topics and underexplored gaps.",
    ],
    inputs: [
      "Research topic, timeframe, and discipline",
      "Publication metadata and abstracts",
      "Inclusion, exclusion, and quality criteria",
    ],
    outputs: [
      "Grouped literature map",
      "Citation-ready publication summaries",
      "Emerging themes and research-gap brief",
    ],
    requirements: [
      "Approved scholarly search sources",
      "Defined review timeframe and inclusion criteria",
      "Researcher validation of citations and claims",
    ],
  },
  "adk-small-business-loans": {
    tagline: "Coordinate document intake into a reviewable lending recommendation.",
    overview:
      "Small Business Loans organizes application intake, document extraction, policy checks, and underwriting evidence into one review packet. The Agent recommends a disposition but leaves regulated lending decisions and exceptions with an authorized reviewer.",
    useCases: [
      "Check an application package for missing evidence.",
      "Summarize financial and business signals for underwriting.",
      "Route exceptions to the correct lending reviewer.",
    ],
    inputs: [
      "Application form and business documents",
      "Structured financial and identity data",
      "Current lending policy and exception rules",
    ],
    outputs: [
      "Document completeness report",
      "Underwriting evidence summary",
      "Recommendation and manual-review flags",
    ],
    requirements: [
      "Approved document and financial-data access",
      "Current lending and fair-decision policies",
      "Authorized underwriter for final decisions",
    ],
  },
  "adk-software-bug-assistant": {
    tagline: "Turn fragmented engineering evidence into a focused remediation plan.",
    overview:
      "Software Bug Assistant combines issue reports, logs, recent changes, and runbook context to form a testable diagnosis. It is designed to reduce investigation overhead while keeping code changes, ticket updates, and deployments under normal engineering controls.",
    useCases: [
      "Triage a production issue before assigning an owner.",
      "Correlate symptoms with recent changes and known incidents.",
      "Prepare a reproduction and remediation checklist.",
    ],
    inputs: [
      "Issue or ticket description",
      "Logs, traces, and recent-change context",
      "Runbooks and service ownership metadata",
    ],
    outputs: [
      "Ranked root-cause hypotheses",
      "Reproduction and validation plan",
      "Remediation checklist with owner handoff",
    ],
    requirements: [
      "Read access to approved engineering systems",
      "Service ownership and runbook context",
      "Normal review policy for code or deployment changes",
    ],
  },
  "adk-travel-concierge": {
    tagline: "Orchestrate a personalized itinerary that can adapt in real time.",
    overview:
      "Travel Concierge combines traveler preferences, inventory context, and live itinerary changes into a coordinated journey plan. Recommendations remain explainable, and booking or payment actions can be separated behind explicit user confirmation.",
    useCases: [
      "Build an itinerary from preferences and constraints.",
      "Re-plan a journey after a delay or cancellation.",
      "Prepare contextual alerts and next-best travel options.",
    ],
    inputs: [
      "Traveler preferences, dates, and budget",
      "Destination and inventory context",
      "Live itinerary or disruption events",
    ],
    outputs: [
      "Personalized itinerary with rationale",
      "Alternative options and trade-offs",
      "Real-time change and confirmation checklist",
    ],
    requirements: [
      "Approved travel search or inventory integrations",
      "User confirmation for bookings and payments",
      "Current traveler preferences and constraints",
    ],
  },
  "adk-time-series-forecasting": {
    tagline: "Build an explainable forecast from structured historical signals.",
    overview:
      "Time Series Forecasting prepares a repeatable forecasting workflow from validated historical data. It reports uncertainty, notable drivers, and operational follow-ups so teams can judge the forecast rather than treating it as a single unquestionable number.",
    useCases: [
      "Forecast demand, volume, or capacity from historical data.",
      "Compare baseline and event-adjusted scenarios.",
      "Explain uncertainty and operational thresholds.",
    ],
    inputs: [
      "Timestamped historical observations",
      "Known events and explanatory features",
      "Forecast horizon and evaluation metric",
    ],
    outputs: [
      "Forecast series and confidence interval",
      "Driver and anomaly explanation",
      "Threshold-based operational follow-ups",
    ],
    requirements: [
      "Validated historical data with stable timestamps",
      "Defined horizon and evaluation criteria",
      "Domain review before operational decisions",
    ],
  },
  "adk-llm-auditor": {
    tagline: "Evaluate model behavior against reviewable quality and policy criteria.",
    overview:
      "LLM Auditor applies a structured evaluation rubric to model responses, records evidence for each finding, and recommends bounded guardrail changes. It supports governance review without claiming that an automated score replaces accountable human judgment.",
    useCases: [
      "Review a response set before a model or prompt release.",
      "Compare quality and safety behavior across versions.",
      "Prepare policy and guardrail improvement recommendations.",
    ],
    inputs: [
      "Model responses and evaluation prompts",
      "Quality, safety, and policy rubric",
      "Expected behavior and severity definitions",
    ],
    outputs: [
      "Criterion-level findings with evidence",
      "Severity and confidence summary",
      "Reviewable guardrail recommendations",
    ],
    requirements: [
      "Approved response datasets",
      "Versioned evaluation and policy rubric",
      "Governance reviewer for policy changes",
    ],
  },
  "adk-personalized-shopping": {
    tagline: "Create transparent recommendations from preferences and product evidence.",
    overview:
      "Personalized Shopping combines stated preferences, product attributes, and multimodal context into a ranked recommendation brief. It explains trade-offs and keeps purchase or account actions separate from the recommendation step.",
    useCases: [
      "Compare products against explicit preferences and budget.",
      "Use images or descriptions to find similar items.",
      "Explain why one option is a better fit than another.",
    ],
    inputs: [
      "Preferences, constraints, and budget",
      "Product catalog and availability context",
      "Optional image or multimodal reference",
    ],
    outputs: [
      "Ranked product recommendations",
      "Feature, price, and preference trade-offs",
      "Questions or missing context that could change the ranking",
    ],
    requirements: [
      "Approved product and inventory sources",
      "Current user preferences and consent",
      "Explicit confirmation before purchase actions",
    ],
  },
};

export function marketplaceMetadataFor(
  definition: MarketplaceDefinition,
): AgentMarketplaceBrief {
  const explicit = marketplaceBriefs[definition.id];
  if (explicit) return explicit;
  return {
    tagline: definition.description,
    overview:
      `${definition.name} is a ${definition.platformLabel} sample for ` +
      `${definition.category.toLowerCase()} workflows. It publishes bounded ` +
      "skills through an Agent Card and is designed to demonstrate discovery, preview, and Coordinator connection interactions.",
    useCases: definition.examplePrompts.slice(0, 3),
    inputs: [
      "Natural-language task and scope",
      "Coordinator-provided context",
      "Applicable Project policies",
    ],
    outputs: definition.skills.map((skill) => skill.description),
    requirements: [
      "A READY OpenClaw or Hermes Coordinator for delegation",
      `Network access to the ${definition.integrationType === "a2a" ? "A2A" : "adapter"} endpoint`,
      "Applicable Project access and approval policies",
    ],
  };
}
