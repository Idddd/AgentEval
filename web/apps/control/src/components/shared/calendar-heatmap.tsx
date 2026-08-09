import {
  type CSSProperties,
  type FC,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export type CalendarDatum = { day: string; value: number };
export type CalendarTooltipProps = {
  color: string;
  day: string;
  value: number;
};

type CalendarDay = {
  day: string;
  week: number;
  weekday: number;
};

type CalendarMonth = {
  label: string;
  week: number;
};

const dayMs = 86_400_000;

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function buildCalendarLayout(from: string, to: string): {
  days: CalendarDay[];
  months: CalendarMonth[];
  weekCount: number;
} {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    return { days: [], months: [], weekCount: 0 };
  }

  const gridStart = new Date(start);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  const days: CalendarDay[] = [];
  const months = new Map<number, CalendarMonth>();

  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const week = Math.floor((cursor.getTime() - gridStart.getTime()) / (7 * dayMs));
    const day = isoDate(cursor);
    days.push({ day, week, weekday: cursor.getUTCDay() });

    if (days.length === 1 || cursor.getUTCDate() === 1) {
      months.set(week, {
        label: new Intl.DateTimeFormat("en-US", {
          month: "short",
          timeZone: "UTC",
        }).format(cursor),
        week,
      });
    }
  }

  return {
    days,
    months: [...months.values()],
    weekCount: days.at(-1)!.week + 1,
  };
}

export function resolveCalendarMaxValue(maxValue: number) {
  return maxValue > 0 ? maxValue : 1;
}

function resolveCellColor(value: number, maxValue: number, colors: string[]) {
  const emptyColor = colors[0] ?? "transparent";
  if (value <= 0 || colors.length === 1) return emptyColor;
  const level = Math.max(
    1,
    Math.ceil((value / resolveCalendarMaxValue(maxValue)) * (colors.length - 1)),
  );
  return colors[Math.min(colors.length - 1, level)] ?? emptyColor;
}

export function CalendarHeatmap({
  ariaLabel,
  colors,
  data,
  from,
  legendFormat,
  maxValue,
  to,
  tooltip: Tooltip,
  className,
}: {
  ariaLabel: string;
  colors: string[];
  data: CalendarDatum[];
  from: string;
  legendFormat: (value: number) => string;
  maxValue: number;
  to: string;
  tooltip: FC<CalendarTooltipProps>;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeDay, setActiveDay] = useState<CalendarTooltipProps | null>(null);
  const layout = useMemo(() => buildCalendarLayout(from, to), [from, to]);
  const dataByDay = useMemo(
    () => new Map(data.map((datum) => [datum.day, datum])),
    [data],
  );
  const activeLayout = activeDay
    ? layout.days.find((item) => item.day === activeDay.day)
    : undefined;

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    viewport.scrollLeft = viewport.scrollWidth;
  }, [from, to]);

  const gridStyle = {
    gridTemplateColumns: `repeat(${Math.max(1, layout.weekCount)}, minmax(10px, 1fr))`,
    gridTemplateRows: "20px repeat(7, minmax(0, 1fr))",
    minWidth: Math.max(720, layout.weekCount * 16),
  } satisfies CSSProperties;

  return (
    <figure aria-label={ariaLabel} className="min-w-0">
      <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain">
        <div
          className={cn(
            "relative h-[220px] w-full xl:h-[260px] 2xl:h-[300px]",
            className,
          )}
          style={{ minWidth: gridStyle.minWidth }}
        >
          <div
            className="grid h-[calc(100%_-_42px)] gap-0.5"
            style={gridStyle}
          >
            {layout.months.map((month) => (
              <span
                key={`${month.label}-${month.week}`}
                className="self-end truncate pb-1 text-[10px] text-muted-foreground"
                style={{ gridColumn: month.week + 1, gridRow: 1 }}
              >
                {month.label}
              </span>
            ))}
            {layout.days.map((item) => {
              const datum = dataByDay.get(item.day);
              const color = datum
                ? resolveCellColor(datum.value, maxValue, colors)
                : "var(--cost-calendar-outside)";
              const cellStyle = {
                backgroundColor: color,
                gridColumn: item.week + 1,
                gridRow: item.weekday + 2,
              } satisfies CSSProperties;

              if (!datum) {
                return (
                  <span
                    key={item.day}
                    className="rounded-[1px] border border-border/70"
                    style={cellStyle}
                  />
                );
              }

              return (
                <button
                  key={item.day}
                  type="button"
                  aria-label={`${item.day}: ${legendFormat(datum.value)}`}
                  aria-current={item.day === to ? "date" : undefined}
                  className={cn(
                    "min-h-0 min-w-0 rounded-[1px] border border-border transition-[filter,box-shadow] duration-150 hover:brightness-95 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    item.day === to && "ring-1 ring-primary/70 ring-inset",
                  )}
                  style={cellStyle}
                  onBlur={() => setActiveDay(null)}
                  onFocus={() => setActiveDay({ color, day: item.day, value: datum.value })}
                  onMouseEnter={() => setActiveDay({ color, day: item.day, value: datum.value })}
                  onMouseLeave={() => setActiveDay(null)}
                />
              );
            })}
          </div>

          {activeDay && activeLayout ? (
            <div
              role="tooltip"
              className={cn(
                "pointer-events-none absolute z-20",
                activeLayout.week / Math.max(1, layout.weekCount - 1) > 0.78
                  ? "-translate-x-full"
                  : activeLayout.week / Math.max(1, layout.weekCount - 1) > 0.22
                    ? "-translate-x-1/2"
                    : undefined,
              )}
              style={{
                left: `${((activeLayout.week + 0.5) / layout.weekCount) * 100}%`,
                top: `${((activeLayout.weekday + 1.35) / 8) * 100}%`,
              }}
            >
              <Tooltip {...activeDay} />
            </div>
          ) : null}

          <div className="absolute inset-x-0 bottom-1 flex justify-end gap-3 text-[10px] text-muted-foreground">
            {colors.map((color, index) => (
              <span key={color} className="inline-flex items-center gap-1.5">
                <span className="size-2.5" style={{ backgroundColor: color }} />
                {legendFormat((maxValue * index) / Math.max(1, colors.length - 1))}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="sr-only">{ariaLabel}</figcaption>
    </figure>
  );
}
