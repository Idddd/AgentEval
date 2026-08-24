import { useMemo } from "react";
import {
  ResponsiveBar,
  type BarDatum,
  type BarTooltipProps,
} from "@nivo/bar";
import {
  ResponsiveLine,
  type LineSeries,
  type SliceTooltipProps,
} from "@nivo/line";
import type { CostTrendPoint } from "@tasklattice/contracts";
import { nivoChartTheme } from "@/components/shared/nivo-theme";
import { compactNumber, usd } from "./cost-utils";
import { CostEmptyState } from "./cost-states";

export type SpendTrendMode = "line" | "stacked";

export interface SpendTrendSeries {
  id: string;
  label: string;
}

type SpendLineSeries = LineSeries & {
  id: string;
  data: Array<{ x: string; y: number }>;
};

type SpendBarDatum = BarDatum & {
  date: string;
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function selectDateTicks(dates: string[]) {
  if (dates.length <= 5) return dates;
  return [...new Set([
    dates[0],
    dates[Math.floor((dates.length - 1) / 4)],
    dates[Math.floor((dates.length - 1) / 2)],
    dates[Math.floor(((dates.length - 1) * 3) / 4)],
    dates.at(-1),
  ].filter((date): date is string => Boolean(date)))];
}

function SpendTooltip({
  colors,
  point,
  series,
}: {
  colors: string[];
  point: CostTrendPoint | undefined;
  series: SpendTrendSeries[];
}) {
  if (!point) return null;
  const colorById = new Map(series.map((item, index) => [item.id, colors[index % colors.length]]));
  const active = point.series.filter((item) => item.spend > 0 || item.tokens > 0 || item.requests > 0);
  const total = point.series.reduce((sum, item) => sum + item.spend, 0);
  return (
    <div className="w-64 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md">
      <div className="mb-2 flex items-center justify-between gap-4">
        <p className="font-medium">{dateLabel(point.date)}</p>
        <strong>{usd(total)}</strong>
      </div>
      <div className="max-h-52 space-y-2 overflow-y-auto">
        {active.length ? active.map((item) => (
          <div key={item.id}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: colorById.get(item.id) }}
                />
                <span className="truncate">{item.label}</span>
              </span>
              <strong>{usd(item.spend)}</strong>
            </div>
            <p className="mt-0.5 pl-4 text-[10px] text-muted-foreground">
              {compactNumber(item.tokens)} tokens · {item.requests.toLocaleString()} requests
            </p>
          </div>
        )) : <p className="text-muted-foreground">No spend</p>}
      </div>
    </div>
  );
}

export function SpendTrendChart({
  colors,
  hasSpend,
  mode,
  series,
  trend,
}: {
  colors: string[];
  hasSpend: boolean;
  mode: SpendTrendMode;
  series: SpendTrendSeries[];
  trend: CostTrendPoint[];
}) {
  const trendByDate = useMemo(
    () => new Map(trend.map((point) => [point.date, point])),
    [trend],
  );
  const colorFor = (id: string) => {
    const index = series.findIndex((item) => item.id === id);
    return colors[(index < 0 ? 0 : index) % colors.length] ?? "var(--primary)";
  };
  const dates = trend.map((point) => point.date);
  const tickValues = selectDateTicks(dates);
  const maxTotal = Math.max(
    0,
    ...trend.map((point) => point.series.reduce((sum, item) => sum + item.spend, 0)),
  );
  const scaleMax = maxTotal > 0 ? maxTotal * 1.08 : 1;
  const lineData = useMemo<SpendLineSeries[]>(
    () => series.map((entry) => ({
      id: entry.id,
      data: trend.map((point) => ({
        x: point.date,
        y: point.series.find((item) => item.id === entry.id)?.spend ?? 0,
      })),
    })),
    [series, trend],
  );
  const barData = useMemo<SpendBarDatum[]>(
    () => trend.map((point) => Object.fromEntries([
      ["date", point.date],
      ...series.map((entry) => [
        entry.id,
        point.series.find((item) => item.id === entry.id)?.spend ?? 0,
      ]),
    ]) as SpendBarDatum),
    [series, trend],
  );
  const axisBottom = {
    format: (value: string | number) => String(value).slice(5),
    tickPadding: 8,
    tickRotation: 0,
    tickSize: 0,
    tickValues,
  };
  const axisLeft = {
    format: (value: string | number) => usd(Number(value)),
    tickPadding: 8,
    tickSize: 0,
    tickValues: 5,
  };
  const ariaLabel = `Daily USD spend ${mode === "line" ? "line" : "stacked bar"} chart`;

  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <div className="relative h-[260px] min-w-[680px] w-full">
        {mode === "line" ? (
          <ResponsiveLine<SpendLineSeries>
            data={lineData}
            margin={{ top: 18, right: 18, bottom: 42, left: 64 }}
            xScale={{ type: "point" }}
            yScale={{ type: "linear", min: 0, max: scaleMax, stacked: false }}
            axisBottom={axisBottom}
            axisLeft={axisLeft}
            axisRight={null}
            axisTop={null}
            colors={(item) => colorFor(String(item.id))}
            curve="linear"
            lineWidth={2}
            enableArea={series.length === 1}
            areaOpacity={0.08}
            enablePoints={trend.length <= 31}
            pointSize={5}
            pointColor={{ from: "seriesColor" }}
            pointBorderColor={{ from: "serieColor" }}
            pointBorderWidth={1}
            enableGridX={false}
            enableGridY
            enableSlices="x"
            enableCrosshair
            crosshairType="x"
            sliceTooltip={({ slice }: SliceTooltipProps<SpendLineSeries>) => (
              <SpendTooltip
                colors={colors}
                point={trendByDate.get(String(slice.points[0]?.data.x))}
                series={series}
              />
            )}
            useMesh
            animate={false}
            isFocusable
            pointAriaLabel={(point) => `${point.seriesId}, ${point.data.x}: ${usd(Number(point.data.y))}`}
            role="img"
            ariaLabel={ariaLabel}
            theme={nivoChartTheme}
          />
        ) : (
          <ResponsiveBar<SpendBarDatum>
            data={barData}
            keys={series.map((entry) => entry.id)}
            indexBy="date"
            groupMode="stacked"
            margin={{ top: 18, right: 18, bottom: 42, left: 64 }}
            padding={0.35}
            innerPadding={1}
            valueScale={{ type: "linear", min: 0, max: scaleMax }}
            indexScale={{ type: "band", round: true }}
            axisBottom={axisBottom}
            axisLeft={axisLeft}
            axisRight={null}
            axisTop={null}
            colors={(item) => colorFor(String(item.id))}
            colorBy="id"
            borderRadius={2}
            enableLabel={false}
            enableGridX={false}
            enableGridY
            tooltip={({ id, indexValue }: BarTooltipProps<SpendBarDatum>) => (
              <SpendTooltip
                colors={colors}
                point={trendByDate.get(String(indexValue))}
                series={series}
              />
            )}
            animate={false}
            animateOnMount={false}
            isFocusable
            barAriaLabel={(bar) => `${bar.id}, ${bar.indexValue}: ${usd(bar.value ?? 0)}`}
            role="img"
            ariaLabel={ariaLabel}
            theme={nivoChartTheme}
          />
        )}
        {!hasSpend ? (
          <div className="absolute inset-0 grid place-items-center bg-background/70">
            <CostEmptyState compact />
          </div>
        ) : null}
      </div>
    </div>
  );
}
