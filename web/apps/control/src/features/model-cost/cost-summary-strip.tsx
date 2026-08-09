import type { CostSummary } from "@tasklattice/contracts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { compactNumber, usd } from "./cost-utils";

function Trend({ value, label }: { value: number | undefined; label: string }) {
  if (value === undefined || !Number.isFinite(value)) {
    return <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus className="size-3" />No prior data</span>;
  }
  const normalized = Math.abs(value) < 0.05 ? 0 : value;
  const Icon = normalized > 0 ? ArrowUpRight : normalized < 0 ? ArrowDownRight : Minus;
  return (
    <span className={normalized > 0 ? "inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400" : normalized < 0 ? "inline-flex items-center gap-1 text-rose-700 dark:text-rose-400" : "inline-flex items-center gap-1 text-muted-foreground"}>
      <Icon className="size-3" />
      {Math.abs(normalized).toFixed(1)}% vs prior {label}
    </span>
  );
}

function IdentityValue({ item }: { item: CostSummary["highestCostInstance"] }) {
  if (!item) return <span className="text-muted-foreground">No spend</span>;
  return (
    <span className="block min-w-0">
      <span className="block truncate">{item.label}</span>
      <span className="mt-1 block text-xs font-normal text-muted-foreground">
        {usd(item.spend)} ({(item.share * 100).toFixed(1)}%)
      </span>
    </span>
  );
}

export function CostSummaryStrip({
  summary,
  priorLabel,
}: {
  summary: CostSummary;
  priorLabel: string;
}) {
  const items = [
    {
      label: "Total spend",
      value: usd(summary.totalSpend.current),
      trend: <Trend value={summary.totalSpend.changePercent} label={priorLabel} />,
    },
    {
      label: "Total tokens",
      value: compactNumber(summary.totalTokens.current),
      trend: <Trend value={summary.totalTokens.changePercent} label={priorLabel} />,
    },
    {
      label: "Requests",
      value: compactNumber(summary.requests.current),
      trend: <Trend value={summary.requests.changePercent} label={priorLabel} />,
    },
    {
      label: "Highest-cost Instance",
      value: <IdentityValue item={summary.highestCostInstance} />,
      trend: null,
    },
    {
      label: "Highest-cost model",
      value: <IdentityValue item={summary.highestCostModel} />,
      trend: null,
    },
  ];
  return (
    <section aria-label="Cost summary" className="overflow-x-auto rounded-lg border border-border/70 bg-card">
      <div className="grid min-w-[900px] grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.15fr)_minmax(0,1.15fr)]">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 border-l border-border/70 px-5 py-4 first:border-l-0">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <div className="mt-1 truncate text-lg font-semibold tabular-nums">{item.value}</div>
            <div className="mt-1 min-h-4 text-[11px]">{item.trend}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
