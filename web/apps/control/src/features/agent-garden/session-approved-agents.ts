import { useSyncExternalStore } from "react";
import type { AgentGardenEntry } from "@tasklattice/contracts";
import type {
  EvaluationLayerTarget,
  EvaluationLayerTargetRevision,
} from "@/features/evaluation-layer/model";

const EMPTY_AGENTS: AgentGardenEntry[] = [];
const agentsByProject = new Map<string, AgentGardenEntry[]>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSessionApprovedAgents(projectId: string) {
  return agentsByProject.get(projectId) ?? EMPTY_AGENTS;
}

export function publishSessionApprovedAgent(
  projectId: string,
  target: EvaluationLayerTarget,
  revision: EvaluationLayerTargetRevision,
  publishedAt = new Date().toISOString(),
) {
  if (target.kind !== "agent") return;
  const id = `session-approved-${target.id}-${revision.id}`;
  const entry: AgentGardenEntry = {
    id,
    name: target.name,
    description: target.description,
    source: "PROJECT_REGISTERED",
    integrationType: "openclaw",
    platformLabel: "Approved Agent",
    category: "Approved Agents",
    owner: "Approved by Admin",
    tags: ["Approved", "Evaluated", "Demo"],
    status: "READY",
    usageMode: "INTERACTIVE",
    usageCapabilities: {
      interactive: true,
      canDelegate: false,
      acceptsDelegation: false,
    },
    endpoint: null,
    agentCardUrl: null,
    authType: "none",
    authReference: "",
    internalNetworkOnly: true,
    configuration: {
      icon: target.icon ?? "sparkles",
      model: revision.model ?? "Approved evaluation revision",
      revision: `R${revision.revision}`,
    },
    skills: revision.tools.slice(0, 12).map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      tags: tool.tags,
    })),
    specializationId: null,
    createdAt: target.createdAt,
    updatedAt: publishedAt,
    lastDiscoveredAt: publishedAt,
    lastDiscoveryError: null,
  };
  const existing = agentsByProject.get(projectId) ?? EMPTY_AGENTS;
  agentsByProject.set(projectId, [
    entry,
    ...existing.filter((agent) => agent.id !== id),
  ]);
  emit();
}

export function useSessionApprovedAgents(projectId: string) {
  return useSyncExternalStore(
    subscribe,
    () => getSessionApprovedAgents(projectId),
    () => EMPTY_AGENTS,
  );
}

export function clearSessionApprovedAgents() {
  agentsByProject.clear();
  emit();
}
