import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox";

export function CapabilityMultiSelect({ ariaLabel, description, id, label, onChange, options, placeholder, selectedIds, warning, warningAction }: {
  ariaLabel: string;
  description: string;
  id: string;
  label: string;
  onChange: (ids: string[]) => void;
  options: readonly MultiSelectOption[];
  placeholder: string;
  selectedIds: readonly string[];
  warning?: string | undefined;
  warningAction?: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-md border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{label}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{selectedIds.length} selected</span>
      </div>
      <MultiSelectCombobox
        id={id}
        ariaLabel={ariaLabel}
        emptyMessage={`No ${label.toLowerCase()} match`}
        onValueChange={onChange}
        options={options}
        placeholder={placeholder}
        searchPlaceholder={`Search ${label.toLowerCase()}…`}
        value={selectedIds}
      />
      {warning ? <div role="alert" className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"><p className="flex gap-2 leading-5"><CircleAlert className="mt-0.5 size-4 shrink-0" />{warning}</p>{warningAction ? <div className="mt-1 pl-6">{warningAction}</div> : null}</div> : null}
    </section>
  );
}
