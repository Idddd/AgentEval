import type {
  AgentGardenEntry,
  AgentMarketplaceBrief,
} from "@tasklattice/contracts";

function fallbackBrief(agent: AgentGardenEntry): AgentMarketplaceBrief {
  return {
    tagline: agent.description,
    overview:
      `${agent.name} is a ${agent.platformLabel} Agent for ` +
      `${agent.category.toLowerCase()} workflows. Review its advertised ` +
      "skills, participation model, and connection requirements before making it available to a Coordinator.",
    useCases: agent.skills.map((skill) => skill.name),
    inputs: [
      "Natural-language task and scope",
      "Coordinator-provided context",
      "Applicable Project policies",
    ],
    outputs: agent.skills.length
      ? agent.skills.map((skill) => skill.description || skill.name)
      : ["A response from the registered Agent endpoint"],
    requirements: [
      "Applicable Project access and approval policies",
      agent.usageCapabilities.acceptsDelegation
        ? "A READY OpenClaw or Hermes Coordinator"
        : "A supported interactive runtime",
    ],
  };
}

export function agentMarketplaceBrief(
  agent: AgentGardenEntry,
): AgentMarketplaceBrief {
  const serialized = agent.configuration.marketplaceBrief;
  if (!serialized) return fallbackBrief(agent);
  try {
    const parsed = JSON.parse(serialized) as Partial<AgentMarketplaceBrief>;
    if (
      typeof parsed.tagline !== "string" ||
      typeof parsed.overview !== "string" ||
      !Array.isArray(parsed.useCases) ||
      !Array.isArray(parsed.inputs) ||
      !Array.isArray(parsed.outputs) ||
      !Array.isArray(parsed.requirements)
    ) {
      return fallbackBrief(agent);
    }
    return {
      tagline: parsed.tagline,
      overview: parsed.overview,
      useCases: parsed.useCases.filter(
        (value): value is string => typeof value === "string",
      ),
      inputs: parsed.inputs.filter(
        (value): value is string => typeof value === "string",
      ),
      outputs: parsed.outputs.filter(
        (value): value is string => typeof value === "string",
      ),
      requirements: parsed.requirements.filter(
        (value): value is string => typeof value === "string",
      ),
    };
  } catch {
    return fallbackBrief(agent);
  }
}
