import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type { CostDailyPoint, CostGroupBy } from "@tasklattice/contracts";
import type { CalendarTooltipProps } from "@/components/shared/calendar-heatmap";
import { ChartLoadingState } from "@/components/shared/chart-loading-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { compactNumber, costGroupLabels, fillDailyActivity, usd } from "./cost-utils";

type ActivityMode = "daily" | "weekly" | "cumulative";
type HeatmapCell = CostDailyPoint & { label: string };

const CalendarHeatmap = lazy(() =>
  import("@/components/shared/calendar-heatmap").then((module) => ({
    default: module.CalendarHeatmap,
  })),
);

const intensityColors = [
  "var(--cost-heatmap-0)",
  "var(--cost-heatmap-1)",
  "var(--cost-heatmap-2)",
  "var(--cost-heatmap-3)",
  "var(--cost-heatmap-4)",
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function weekStart(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function today(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    .toISOString()
    .slice(0, 10);
}

function uniqueActive(points: CostDailyPoint[]): string[] {
  return [...new Set(points.flatMap((point) => point.activeObjectIds ?? []))];
}

function buildWeekly(points: CostDailyPoint[]): HeatmapCell[] {
  const weeks = new Map<string, CostDailyPoint[]>();
  for (const point of points) {
    const start = weekStart(point.date);
    weeks.set(start, [...(weeks.get(start) ?? []), point]);
  }
  const summaries = new Map([...weeks].map(([start, week]) => {
    const activeObjectIds = uniqueActive(week);
    return [start, {
      label: `${formatDate(start)} – ${formatDate(addDays(start, 6))}`,
      spend: week.reduce((sum, point) => sum + point.spend, 0),
      tokens: week.reduce((sum, point) => sum + point.tokens, 0),
      requests: week.reduce((sum, point) => sum + point.requests, 0),
      active: activeObjectIds.length || Math.max(0, ...week.map((point) => point.active)),
      activeObjectIds,
    }] as const;
  }));
  return points.map((point) => ({
    ...point,
    ...summaries.get(weekStart(point.date))!,
  }));
}

function buildCumulative(points: CostDailyPoint[]): HeatmapCell[] {
  let spend = 0;
  let tokens = 0;
  let requests = 0;
  const active = new Set<string>();
  return points.map((point) => {
    spend += point.spend;
    tokens += point.tokens;
    requests += point.requests;
    point.activeObjectIds?.forEach((id) => active.add(id));
    return {
      ...point,
      label: `${formatDate(point.date)} · cumulative`,
      spend,
      tokens,
      requests,
      active: active.size || point.active,
      activeObjectIds: [...active],
    };
  });
}

function ActivityTooltip({
  cell,
  color,
  groupBy,
}: {
  cell: HeatmapCell;
  color: string;
  groupBy: CostGroupBy;
}) {
  const activeLabel = costGroupLabels[groupBy];
  return (
    <div className="min-w-56 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md">
      <p className="mb-2 flex items-center gap-2 font-medium">
        <span className="size-2 rounded-[2px]" style={{ backgroundColor: color }} />
        {cell.label}
      </p>
      <div className="flex justify-between gap-6"><span className="opacity-70">Spend</span><strong>{usd(cell.spend)}</strong></div>
      <div className="flex justify-between gap-6"><span className="opacity-70">Tokens</span><strong>{compactNumber(cell.tokens)}</strong></div>
      <div className="flex justify-between gap-6"><span className="opacity-70">Requests</span><strong>{cell.requests.toLocaleString()}</strong></div>
      <div className="flex justify-between gap-6"><span className="opacity-70">Active {activeLabel}s</span><strong>{cell.active}</strong></div>
    </div>
  );
}

export function SpendActivityHeatmap({
  activity,
  from,
  to,
  groupBy,
}: {
  activity: CostDailyPoint[];
  from: string;
  to: string;
  groupBy: CostGroupBy;
}) {
  const [mode, setMode] = useState<ActivityMode>("daily");
  const daily = useMemo(() => fillDailyActivity(activity, from, to), [activity, from, to]);
  const calendarTo = today();
  const trailingYearStart = addDays(calendarTo, -364);
  const calendarFrom = from < trailingYearStart ? from : trailingYearStart;
  const cells = useMemo<HeatmapCell[]>(() => {
    if (mode === "weekly") return buildWeekly(daily);
    if (mode === "cumulative") return buildCumulative(daily);
    return daily.map((point) => ({ ...point, label: formatDate(point.date) }));
  }, [daily, mode]);
  const max = Math.max(0, ...cells.map((point) => point.spend));
  const hasSpend = daily.some((point) => point.spend > 0);
  const cellsByDate = useMemo(
    () => new Map(cells.map((cell) => [cell.date, cell])),
    [cells],
  );
  const tooltip = useCallback(
    ({ day, color }: CalendarTooltipProps) => {
      const cell = cellsByDate.get(day);
      return cell ? <ActivityTooltip cell={cell} color={color} groupBy={groupBy} /> : null;
    },
    [cellsByDate, groupBy],
  );

  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="flex min-h-14 flex-col items-stretch justify-between gap-2 border-b px-4 py-2.5 sm:flex-row sm:items-center">
        <div>
          <CardTitle className="font-sans text-sm font-medium">Spend activity</CardTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Selected-period spend in a rolling view ending today.
          </p>
        </div>
        <Tabs value={mode} onValueChange={(value) => setMode(value as ActivityMode)}>
          <TabsList className="h-9 gap-1 bg-transparent p-0">
            <TabsTrigger className="h-8 px-3" value="daily">Daily</TabsTrigger>
            <TabsTrigger className="h-8 px-3" value="weekly">Weekly</TabsTrigger>
            <TabsTrigger className="h-8 px-3" value="cumulative">Cumulative</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-1">
        <ClientOnly fallback={<ChartLoadingState className="h-[220px] xl:h-[260px] 2xl:h-[300px]" />}>
          <Suspense fallback={<ChartLoadingState className="h-[220px] xl:h-[260px] 2xl:h-[300px]" />}>
            <CalendarHeatmap
              ariaLabel={`${mode} spend activity for ${from} through ${to}; calendar ends today`}
              colors={intensityColors}
              data={cells.map((cell) => ({ day: cell.date, value: cell.spend }))}
              from={calendarFrom}
              to={calendarTo}
              legendFormat={usd}
              maxValue={max}
              tooltip={tooltip}
            />
          </Suspense>
        </ClientOnly>
        <ul className="sr-only">
          {cells.map((cell) => (
            <li key={`${mode}-${cell.date}`}>
              {cell.label}: {usd(cell.spend)}, {compactNumber(cell.tokens)} tokens, {cell.requests} requests
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-2 text-[11px] text-muted-foreground">
          <span>Selected period: {from} – {to}</span>
          <span>{hasSpend ? `Peak ${mode} spend: ${usd(max)}` : "No spend in the selected period"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
