import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type { CostGroupBy, CostTrendPoint } from "@tasklattice/contracts";
import { Ellipsis, FileDown } from "lucide-react";
import { ChartLoadingState } from "@/components/shared/chart-loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { costGroupLabels, usd } from "./cost-utils";

type SpendTrendMode = "line" | "stacked";

const SpendTrendChart = lazy(() =>
  import("./spend-trend-chart").then((module) => ({
    default: module.SpendTrendChart,
  })),
);

const colors = [
  "var(--cost-series-1)",
  "var(--cost-series-2)",
  "var(--cost-series-3)",
  "var(--cost-series-4)",
  "var(--cost-series-5)",
  "var(--cost-series-6)",
];

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadTrendCsv(trend: CostTrendPoint[], filename = "model-cost-trend.csv") {
  const rows = [["Date", "Object", "Spend USD", "Tokens", "Requests"]];
  trend.forEach((point) => point.series.forEach((series) => rows.push([
    point.date,
    series.label,
    String(series.spend),
    String(series.tokens),
    String(series.requests),
  ])));
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DailySpendBreakdown({
  groupBy,
  trend,
}: {
  groupBy: CostGroupBy;
  trend: CostTrendPoint[];
}) {
  const [mode, setMode] = useState<SpendTrendMode>("line");
  const series = useMemo(() => {
    const map = new Map<string, string>();
    trend.forEach((point) => point.series.forEach((item) => map.set(item.id, item.label)));
    return [...map].map(([id, label]) => ({ id, label }));
  }, [trend]);
  const hasSpend = trend.some((point) => point.series.some((item) => item.spend > 0));

  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="flex min-h-14 flex-col items-stretch justify-between gap-2 border-b px-4 py-2.5 sm:flex-row sm:items-center">
        <div>
          <CardTitle className="font-sans text-sm font-medium">
            Daily spend breakdown
          </CardTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Spend by {costGroupLabels[groupBy].toLowerCase()} across the selected period.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={mode} onValueChange={(value) => setMode(value as SpendTrendMode)}>
            <TabsList className="h-9 gap-1 bg-transparent p-0">
              <TabsTrigger className="h-8 px-3" value="line">Line</TabsTrigger>
              <TabsTrigger className="h-8 px-3" value="stacked">Bar</TabsTrigger>
            </TabsList>
          </Tabs>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More chart actions">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!hasSpend}
                onSelect={() => downloadTrendCsv(trend)}
              >
                <FileDown />
                Download CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-1">
        <ClientOnly fallback={<ChartLoadingState />}>
          <Suspense fallback={<ChartLoadingState />}>
            <SpendTrendChart
              colors={colors}
              hasSpend={hasSpend}
              mode={mode}
              series={series}
              trend={trend}
            />
          </Suspense>
        </ClientOnly>
        <ul className="sr-only">
          {trend.map((point) => (
            <li key={point.date}>
              {point.date}: {usd(point.series.reduce((sum, item) => sum + item.spend, 0))}
              {point.series.map((item) => `; ${item.label}: ${usd(item.spend)}`).join("")}
            </li>
          ))}
        </ul>
        {series.length ? (
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
            {series.map((entry, index) => (
              <span key={entry.id} className="flex max-w-48 items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: colors[index % colors.length] }}
                />
                <span className="truncate">{entry.label}</span>
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
