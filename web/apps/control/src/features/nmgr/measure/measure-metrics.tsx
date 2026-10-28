import type { CSSProperties } from "react";
import {
  Activity,
  ArrowUpRight,
  CircleCheck,
  Cpu,
  Gauge,
  MemoryStick,
  Microchip,
  Server,
  Timer,
  type LucideIcon,
} from "lucide-react";
import {
  metricSeries,
  metricValue,
  usageState,
  type MetricSeries,
} from "./metric-data";
import { MetricChart } from "./metric-chart";
import type { MeasureCenter } from "./measure-runner";
import "./measure-metrics.css";

const icons: Record<MetricSeries["id"], LucideIcon> = {
  throughput: Activity,
  vram: MemoryStick,
  ram: Microchip,
  gpu: Gauge,
  cpu: Cpu,
};
function palette(color: string): CSSProperties {
  return { "--nm-metric-color": color } as CSSProperties;
}
function ResourceCard({
  metric,
  onProtection,
}: {
  metric: MetricSeries;
  onProtection?: () => void;
}) {
  const value = metric.samples.at(-1)!;
  const color = metric.unit === "%" ? usageState(value).color : metric.color;
  const Icon = icons[metric.id];
  const content = (
    <>
      <span
        className="nm-metric-reading"
        id={onProtection ? "nm-throughput-reading" : undefined}
      >
        <strong>{metricValue(value, metric.unit)}</strong>
        <span>{metric.unit}</span>
        {onProtection && <ArrowUpRight size={16} aria-hidden="true" />}
      </span>
      <MetricChart metric={metric} color={color} focusable={!onProtection} />
    </>
  );
  return (
    <section
      className={`nm-card nm-metric-card nm-metric-${metric.id}`}
      style={palette(color)}
      aria-label={metric.title}
    >
      <header className="nm-metric-heading">
        <span className="nm-metric-icon">
          <Icon size={16} aria-hidden="true" />
        </span>
        <h3>{metric.title}</h3>
      </header>
      {onProtection ? (
        <button
          type="button"
          className="nm-metric-content nm-metric-action"
          aria-label="Open Protection Center"
          aria-describedby="nm-throughput-reading"
          onClick={onProtection}
        >
          {content}
        </button>
      ) : (
        <div className="nm-metric-content">{content}</div>
      )}
    </section>
  );
}
function RunnerCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="nm-card nm-metric-runner" style={palette("#4f46e5")}>
      <button
        type="button"
        className="nm-metric-action"
        aria-label="Open Guardrail Runners"
        aria-describedby="nm-runner-overview-quota"
        onClick={onOpen}
      >
        <span className="nm-metric-heading">
          <span className="nm-metric-icon">
            <Server size={17} aria-hidden="true" />
          </span>
          <span role="heading" aria-level={3}>
            Runners (Running / Quota)
          </span>
        </span>
        <strong id="nm-runner-overview-quota">
          326 <span>/ 500</span>
        </strong>
        <ArrowUpRight size={17} aria-hidden="true" />
      </button>
    </section>
  );
}
function LatencyCard() {
  return (
    <section
      className="nm-card nm-metric-card nm-metric-latency"
      style={palette("#7c3aed")}
    >
      <header className="nm-metric-heading">
        <span className="nm-metric-icon">
          <Timer size={16} aria-hidden="true" />
        </span>
        <h3>Latency</h3>
      </header>
      <dl className="nm-metric-latencies">
        {[
          ["P99", 537, "#be123c"],
          ["P75", 320, "#b45309"],
          ["P50", 132, "#047857"],
        ].map(([label, value, color]) => (
          <div key={label} style={palette(String(color))}>
            <dt>
              <i />
              {label}
            </dt>
            <dd>
              {value} <span>ms</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
function ErrorCard() {
  return (
    <section
      className="nm-card nm-metric-card nm-metric-errors"
      style={palette("#047857")}
    >
      <header className="nm-metric-heading">
        <span className="nm-metric-icon">
          <CircleCheck size={16} aria-hidden="true" />
        </span>
        <h3>Errors of the Day</h3>
      </header>
      <strong className="nm-metric-error-total">0</strong>
    </section>
  );
}
export function SystemMetrics({
  onCenter,
}: {
  onCenter: (center: MeasureCenter) => void;
}) {
  return (
    <>
      <section aria-labelledby="nm-measure-performance">
        <h2 id="nm-measure-performance" className="nm-measure-section-title">
          System Performance
        </h2>
        <div className="nm-measure-performance">
          <ResourceCard
            metric={metricSeries.throughput}
            onProtection={() => onCenter("protection")}
          />
          <LatencyCard />
          <ErrorCard />
        </div>
      </section>
      <section aria-labelledby="nm-measure-health">
        <h2 id="nm-measure-health" className="nm-measure-section-title">
          Resource Health
        </h2>
        <div className="nm-measure-health">
          <RunnerCard onOpen={() => onCenter("runners")} />
          {[
            metricSeries.vram,
            metricSeries.ram,
            metricSeries.gpu,
            metricSeries.cpu,
          ].map((metric) => (
            <ResourceCard key={metric.id} metric={metric} />
          ))}
        </div>
      </section>
    </>
  );
}
