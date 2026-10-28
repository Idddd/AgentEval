import { useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Cpu,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Role } from "../model";
import { MeasureCard, MeasureSheet } from "./measure-shared";

export type HitFocus = "blocked" | "transformed";
type ModelUsage = {
  title: string;
  provider: string;
  model: string;
  queries: string;
  tone: "most" | "least";
};

export function BusinessOverview({
  role,
  onDashboard,
  onMetricFocus,
  focus,
}: {
  role: Role;
  onDashboard?: () => void;
  onMetricFocus: (metric: HitFocus) => void;
  focus: HitFocus | null;
}) {
  const [usage, setUsage] = useState<ModelUsage | null>(null);
  const models: ModelUsage[] = [
    {
      title: "Most Used Model of Month",
      provider: "OpenAPI",
      model: "GPT-6 Astra",
      queries: "8069",
      tone: "most",
    },
    {
      title: "Least Used Model of Month",
      provider: "Google",
      model: "Gemini-2.5 Pro",
      queries: "12",
      tone: "least",
    },
  ];
  return (
    <>
      <div className="nm-measure-overview nm-measure-overview-linked">
        <MeasureCard
          title="Last 10 Minutes in Your Control Unit"
          className="nm-measure-scan-card"
          aside={
            <span className="nm-overview-icon">
              <Activity size={17} aria-hidden="true" />
            </span>
          }
        >
          <div className="nm-measure-scans">
            <button
              type="button"
              className="nm-overview-total"
              aria-label="Open scan dashboard"
              disabled={!onDashboard}
              onClick={onDashboard}
            >
              <span>
                Total Scans
                {onDashboard && <ArrowUpRight size={13} aria-hidden="true" />}
              </span>
              <strong>12468</strong>
              {onDashboard && (
                <span className="nm-overview-total-link">Open dashboard</span>
              )}
            </button>
            <dl>
              {[
                {
                  label: "Pass",
                  count: "12000",
                  percent: "96.25 %",
                  tone: "pass",
                  focus: null,
                },
                {
                  label: "Block",
                  count: "400",
                  percent: "3.21 %",
                  tone: "blocked",
                  focus: "blocked",
                },
                {
                  label: "Transformed",
                  count: "68",
                  percent: "0.48 %",
                  tone: "transformed",
                  focus: "transformed",
                },
              ].map((metric) => (
                <div key={metric.label} data-tone={metric.tone}>
                  <dt>
                    <i aria-hidden="true" />
                    {metric.label}
                  </dt>
                  <dd>
                    {metric.focus ? (
                      <button
                        type="button"
                        aria-label={`View agents with ${metric.focus} hits`}
                        aria-pressed={focus === metric.focus}
                        onClick={() => onMetricFocus(metric.focus as HitFocus)}
                      >
                        {metric.count}
                        <ArrowUpRight size={12} aria-hidden="true" />
                      </button>
                    ) : (
                      <strong>{metric.count}</strong>
                    )}
                  </dd>
                  <dd>{metric.percent}</dd>
                </div>
              ))}
            </dl>
          </div>
        </MeasureCard>
        {models.map((model) => (
          <MeasureCard
            key={model.tone}
            title={model.title}
            className={`nm-measure-model-card nm-model-${model.tone}`}
            aside={
              <span className="nm-overview-icon">
                {model.tone === "most" ? (
                  <TrendingUp size={17} aria-hidden="true" />
                ) : (
                  <TrendingDown size={17} aria-hidden="true" />
                )}
              </span>
            }
          >
            <dl className="nm-measure-fields">
              <div>
                <dt>Provider</dt>
                <dd>{model.provider}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{model.model}</dd>
              </div>
              <div className="nm-model-query-count">
                <dt>Queries</dt>
                <dd>{model.queries}</dd>
              </div>
            </dl>
            <Button
              variant="ghost"
              className="nm-overview-card-link"
              aria-label={`View summary: ${model.title}`}
              onClick={() => setUsage(model)}
            >
              View summary
              <ArrowUpRight size={14} aria-hidden="true" />
            </Button>
          </MeasureCard>
        ))}
      </div>
      {usage && (
        <MeasureSheet
          title="Model usage summary"
          description={`${usage.title} · Current month`}
          width={580}
          onClose={() => setUsage(null)}
        >
          <div className={`nm-model-summary nm-model-${usage.tone}`}>
            <div className="nm-model-summary-identity">
              <span className="nm-overview-icon">
                <Cpu size={22} aria-hidden="true" />
              </span>
              <div>
                <p>Model</p>
                <h3>{usage.model}</h3>
              </div>
            </div>
            <div className="nm-model-summary-count">
              <span>Queries</span>
              <strong>{usage.queries}</strong>
            </div>
            <dl className="nm-measure-summary-fields">
              <div>
                <dt>Provider</dt>
                <dd>{usage.provider}</dd>
              </div>
              <div>
                <dt>Control Unit</dt>
                <dd>ISS</dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>Current month</dd>
              </div>
            </dl>
          </div>
        </MeasureSheet>
      )}
    </>
  );
}
