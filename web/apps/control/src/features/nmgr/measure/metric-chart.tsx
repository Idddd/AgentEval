import { useLayoutEffect, useRef, useState } from "react";
import { Line } from "@nivo/line";
import { nivoChartTheme } from "@/components/shared/nivo-theme";
import { metricValue, sampleTime, type MetricSeries } from "./metric-data";

export function MetricChart({
  metric,
  color,
  focusable = true,
}: {
  metric: MetricSeries;
  color: string;
  focusable?: boolean;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(112);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const size = element.getBoundingClientRect().width;
      if (size > 0) setWidth(Math.round(size));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const min = Math.min(...metric.samples);
  const max = Math.max(...metric.samples);
  const padding = (max - min) * 0.3;
  return (
    <span ref={root} className="nm-metric-chart">
      <Line
        data={[
          { id: metric.title, data: metric.samples.map((y, x) => ({ x, y })) },
        ]}
        width={width}
        height={64}
        margin={{ top: 6, right: 4, bottom: 2, left: 4 }}
        xScale={{ type: "point" }}
        yScale={{
          type: "linear",
          min: min - padding,
          max: max + padding,
          stacked: false,
        }}
        axisBottom={null}
        axisLeft={null}
        colors={[color]}
        lineWidth={1.6}
        curve="linear"
        enableArea
        areaBaselineValue={min - padding}
        areaOpacity={0.08}
        enablePoints
        pointSize={3}
        pointColor={color}
        pointBorderWidth={0}
        enableGridX={false}
        enableGridY={false}
        useMesh
        enableCrosshair
        crosshairType="x"
        animate={false}
        isFocusable={focusable}
        pointAriaLabel={(point) =>
          `${metric.title}, ${sampleTime(Number(point.data.x))}: ${metricValue(Number(point.data.y), metric.unit)} ${metric.unit}`
        }
        tooltip={({ point }) => {
          const tooltipWidth = Math.min(104, width);
          const left = 4 + point.x - tooltipWidth / 2;
          const shift =
            Math.max(0, Math.min(width - tooltipWidth, left)) - left;
          return (
            <div
              role="tooltip"
              className="nm-metric-tooltip"
              style={{
                width: tooltipWidth,
                transform: `translateX(${shift}px)`,
              }}
            >
              <strong>
                {metricValue(Number(point.data.y), metric.unit)} {metric.unit}
              </strong>
            </div>
          );
        }}
        role="img"
        ariaLabel={`${metric.title} mock data trend`}
        theme={nivoChartTheme}
      />
    </span>
  );
}
