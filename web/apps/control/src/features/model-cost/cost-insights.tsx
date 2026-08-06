import type { CostInsight } from "@tasklattice/contracts";
import { Activity, CalendarRange, Coins, Cpu, Gauge, Layers3 } from "lucide-react";
import { compactNumber, usd } from "./cost-utils";

const icons = {
  highest_spend_day: CalendarRange,
  average_daily_spend: Gauge,
  active_group: Layers3,
  active_model_endpoints: Cpu,
  most_expensive_provider: Coins,
  peak_tokens_day: Activity,
} as const;

function value(insight: CostInsight): string {
  if (insight.valueKind === "currency") return usd(insight.value);
  if (insight.valueKind === "tokens") return compactNumber(insight.value);
  return insight.value.toLocaleString();
}

export function CostInsights({ insights }: { insights: CostInsight[] }) {
  return (
    <section aria-labelledby="cost-insights-title" className="h-full rounded-lg border">
      <div className="flex min-h-11 items-center border-b px-4 py-2">
        <h2 id="cost-insights-title" className="font-sans text-sm font-medium">Cost insights</h2>
      </div>
      <div className="divide-y px-4">
        {insights.map((insight) => {
          const Icon = icons[insight.id];
          return (
            <div key={insight.id} className="grid min-h-8 grid-cols-[1rem_minmax(0,1fr)_auto_auto] items-center gap-3 py-1 text-xs">
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="min-w-0 truncate text-muted-foreground">{insight.label}</span>
              <span className="max-w-40 truncate text-muted-foreground">{insight.subject ?? ""}</span>
              <strong className="tabular-nums">{value(insight)}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
