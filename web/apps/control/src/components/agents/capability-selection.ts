export type SelectionSource = "manual" | "specialization";

export type SelectedCapability = {
  id: string;
  source: SelectionSource;
};

export type CapabilityChangePreview = {
  add: string[];
  keep: string[];
  remove: string[];
};

export function specializationSelections(ids: readonly string[]): SelectedCapability[] {
  return ids.map((id) => ({ id, source: "specialization" }));
}

export function availableCapabilityIds(
  ids: readonly string[],
  availableIds: readonly string[],
): string[] {
  const available = new Set(availableIds);
  return [...new Set(ids)].filter((id) => available.has(id));
}

export function reconcileCapabilitySelection(
  current: readonly SelectedCapability[],
  availableIds: readonly string[],
): SelectedCapability[] {
  const available = new Set(availableIds);
  return current.filter((item) => available.has(item.id));
}

export function updateCapabilitySelection(
  current: readonly SelectedCapability[],
  nextIds: readonly string[],
): SelectedCapability[] {
  return nextIds.map((id) => current.find((item) => item.id === id) ?? { id, source: "manual" });
}

export function changeSpecializationSelection(
  current: readonly SelectedCapability[],
  nextDefaults: readonly string[],
): SelectedCapability[] {
  const manual = current.filter((item) => item.source === "manual");
  const manualIds = new Set(manual.map((item) => item.id));
  return [
    ...manual,
    ...nextDefaults
      .filter((id) => !manualIds.has(id))
      .map((id): SelectedCapability => ({ id, source: "specialization" })),
  ];
}

export function previewSpecializationChange(
  current: readonly SelectedCapability[],
  nextDefaults: readonly string[],
): CapabilityChangePreview {
  const currentSpecializationIds = current.filter((item) => item.source === "specialization").map((item) => item.id);
  const manualIds = current.filter((item) => item.source === "manual").map((item) => item.id);
  const selectedIds = new Set(current.map((item) => item.id));
  const nextIds = new Set(nextDefaults);
  return {
    remove: currentSpecializationIds.filter((id) => !nextIds.has(id)),
    add: nextDefaults.filter((id) => !selectedIds.has(id)),
    keep: manualIds,
  };
}
