import { forwardRef, useEffect, useMemo, useState } from "react";
import {
  complianceDomainCatalog,
  providerPresets,
  providerSupportsComplianceDomain,
  type ComplianceDomain,
  type ProviderKind,
} from "@tasklattice/contracts";
import { ChevronDown, Plus, Search } from "lucide-react";
import { ProviderIcon } from "./provider-icon";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const categories = ["Popular", "Chinese Providers", "Infrastructure", "Self-Hosted / Custom"] as const;

interface ProviderPickerProps {
  complianceDomain?: ComplianceDomain | undefined;
  disabled?: boolean;
  onChange: (provider: ProviderKind) => void;
  value?: ProviderKind | undefined;
}

export const ProviderPicker = forwardRef<HTMLButtonElement, ProviderPickerProps>(function ProviderPicker(
  { complianceDomain, disabled, onChange, value },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = providerPresets.find((provider) => provider.id === value);
  const boundary = complianceDomainCatalog.find(
    (domain) => domain.id === complianceDomain,
  );
  const visibleProviders = useMemo(() => {
    if (!complianceDomain) return [];
    const query = search.trim().toLowerCase();
    return providerPresets.filter(
      (provider) =>
        providerSupportsComplianceDomain(provider.id, complianceDomain)
        && (!query
          || `${provider.name} ${provider.description} ${provider.category}`
            .toLowerCase()
            .includes(query)),
    );
  }, [complianceDomain, search]);

  useEffect(() => {
    setOpen(false);
    setSearch("");
  }, [complianceDomain]);

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          id="provider-picker"
          ref={ref}
          type="button"
          disabled={disabled || !complianceDomain}
          aria-label={selected ? `Selected provider: ${selected.name}` : "Select a provider"}
          className="flex min-h-12 w-full items-center gap-3 rounded-md border bg-background px-3 text-left text-sm shadow-xs transition-colors hover:bg-muted/35 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {selected ? (
            <ProviderIcon presetId={selected.id} className="size-7 [&_img]:size-5" />
          ) : (
            <span aria-hidden className="grid size-7 place-items-center rounded-md border bg-muted/25 text-muted-foreground">
              <Plus className="size-4" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate", !selected && "text-muted-foreground")}>
              {selected?.name
                ?? (complianceDomain
                  ? "Select an available Provider"
                  : "Select a compliance boundary first")}
            </span>
            {selected && boundary ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                Available in {boundary.label}
              </span>
            ) : null}
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={10}
        className="!z-[100] flex max-h-[min(36rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] flex-col overflow-hidden rounded-lg p-0"
      >
        <div className="border-b p-3">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                Available in {boundary?.label}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Compatible endpoint configurations only
              </p>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {visibleProviders.length} shown
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              aria-label="Search provider catalog"
              className="h-10 pl-9"
              placeholder="Search providers…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                close();
              }}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {categories.map((category) => {
            const items = visibleProviders.filter((provider) => provider.category === category);
            if (!items.length) return null;
            return (
              <section key={category} className="border-b px-3 py-3 last:border-b-0">
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">{category}</h3>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {items.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      aria-pressed={value === provider.id}
                      onClick={() => { onChange(provider.id); close(); }}
                      className={cn(
                        "flex min-h-16 max-w-full items-start gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:border-border hover:bg-muted/50 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20",
                        value === provider.id && "border-primary/30 bg-primary/5",
                      )}
                    >
                      <ProviderIcon presetId={provider.id} className="mt-0.5 size-7 shrink-0 [&_img]:size-5" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {provider.name}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-4 text-muted-foreground">
                          {provider.description}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
          {!visibleProviders.length ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No providers match “{search}”.</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
});
