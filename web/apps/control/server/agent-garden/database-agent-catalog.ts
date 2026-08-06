import {
  agentGardenEntrySchema,
  type AgentGardenEntry,
} from "@tasklattice/contracts";
import {
  demoAgentCardUrl,
  demoAgentDefinitions,
  demoAgentEndpoint,
} from "./demo-agent-runtime";
import { marketplaceMetadataFor } from "./marketplace-agent-metadata";

export const agentCatalogSeedVersion = "2026-07-26.3";
const seededAt = "2026-07-26T00:00:00.000Z";

export const databaseAgentCatalog: AgentGardenEntry[] =
  demoAgentDefinitions.map((definition, index) => {
    const catalogKind =
      definition.catalogKind ?? "TASKLATTICE_DEMO";
    return agentGardenEntrySchema.parse({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      source: "BUILT_IN",
      integrationType: definition.integrationType,
      platformLabel: definition.platformLabel,
      category: definition.category,
      owner:
        catalogKind === "EXAMPLE_BLUEPRINT"
          ? "TaskLattice Example Store"
          : "TaskLattice Demo",
      tags: definition.tags,
      status: "READY",
      usageMode: "CALLABLE",
      usageCapabilities: {
        interactive: false,
        canDelegate: false,
        acceptsDelegation: true,
      },
      endpoint: demoAgentEndpoint(definition.id),
      agentCardUrl: demoAgentCardUrl(definition.id),
      authType: "none",
      authReference: "",
      internalNetworkOnly: true,
      configuration: {
        catalogKind,
        catalogOrder: String(index),
        catalogVersion: agentCatalogSeedVersion,
        previewMode: "DETERMINISTIC",
        framework:
          definition.framework ??
          (definition.integrationType === "langgraph"
            ? "LangGraph"
            : "A2A"),
        icon: definition.icon ?? "",
        language: definition.language ?? "TypeScript",
        examplePrompt1: definition.examplePrompts[0] ?? "",
        examplePrompt2: definition.examplePrompts[1] ?? "",
        workflow: JSON.stringify(definition.trace),
        marketplaceBrief: JSON.stringify(
          marketplaceMetadataFor(definition),
        ),
        marketplaceVersion: "1.0.0-preview",
        releaseStage: "Preview",
        supportLevel: "TaskLattice sample catalog",
        license: "Sample blueprint",
        transport:
          definition.integrationType === "langgraph"
            ? "TaskLattice A2A demo adapter"
            : "JSON-RPC",
      },
      skills: definition.skills,
      specializationId: null,
      createdAt: seededAt,
      updatedAt: seededAt,
      lastDiscoveredAt: null,
      lastDiscoveryError: null,
    });
  });
