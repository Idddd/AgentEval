export type MultiSelectOption = {
  description?: string;
  disabled?: boolean;
  label: string;
  meta?: string;
  metaTone?: "danger" | "neutral" | "success" | "warning";
  value: string;
};

export function filterMultiSelectOptions(
  options: readonly MultiSelectOption[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...options];
  return options.filter((option) => `${option.label} ${option.description ?? ""} ${option.meta ?? ""}`
    .toLocaleLowerCase()
    .includes(normalizedQuery));
}

export function isMultiSelectOptionDisabled(
  option: MultiSelectOption,
  selectedValues: readonly string[],
  maxSelected?: number,
): boolean {
  const selected = selectedValues.includes(option.value);
  return Boolean(
    !selected &&
      (option.disabled ||
        (maxSelected !== undefined &&
          selectedValues.length >= maxSelected)),
  );
}
