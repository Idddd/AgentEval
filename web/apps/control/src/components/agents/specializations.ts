import type { AgentSpecializationDefinition } from "@tasklattice/contracts";

export type SpecializationId = string;
export type Specialization = AgentSpecializationDefinition;

export function getSpecialization(
  specializations: readonly Specialization[],
  id: SpecializationId,
): Specialization | undefined {
  return specializations.find((item) => item.id === id)
    ?? specializations.find((item) => item.id === "general-purpose")
    ?? specializations[0];
}
