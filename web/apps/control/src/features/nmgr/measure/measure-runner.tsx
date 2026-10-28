import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  GitBranch,
  RefreshCw,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MeasureCard } from "./measure-shared";

export type MeasureCenter = "overview" | "runners" | "protection";
const instance = "marketplace-uat-local-1";
const versions = [
  ["Runner version", "v0.3.9-2-g9a1971b81b38"],
  ["NeMo version", "0.24.0"],
  ["Compiler", "Enabled"],
];
function Facts({ values }: { values: string[][] }) {
  return (
    <dl className="nm-runner-facts">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function RunnerCenter({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState("Runner");
  const [expanded, setExpanded] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [checked, setChecked] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") setChecked(new Date());
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);
  const updated = checked.toLocaleTimeString("en-US", { hour12: true });
  const heartbeat = new Date(checked.getTime() - 7000).toLocaleString("en-US");
  return (
    <div className="nm-runner" data-source="nemo-runner-screenshot">
      <div className="nm-measure-page-heading">
        <div>
          <button className="nm-link nm-measure-back" onClick={onBack}>
            <ArrowLeft size={14} />
            Back to Measure
          </button>
          <h2>Runner</h2>
          <p className="nm-muted">
            Inspect Runner status, applied configuration and runtime load.
          </p>
        </div>
        <Button variant="outline" onClick={() => setChecked(new Date())}>
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>
      <div
        className="nm-runner-tabs"
        role="tablist"
        aria-label="Runner settings"
        onKeyDown={(event) => {
          const labels = ["Health", "Runner", "Version"];
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const index =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? 2
                : (labels.indexOf(tab) +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    3) %
                  3;
          const next = labels[index]!;
          setTab(next);
          document.getElementById(`runner-tab-${next}`)?.focus();
        }}
      >
        {[
          ["Health", Activity],
          ["Runner", Server],
          ["Version", GitBranch],
        ].map(([label, Icon]) => {
          const name = label as string,
            TabIcon = Icon as typeof Activity;
          return (
            <button
              type="button"
              role="tab"
              id={`runner-tab-${name}`}
              key={name}
              tabIndex={tab === name ? 0 : -1}
              aria-selected={tab === name}
              aria-controls="runner-panel"
              onClick={() => setTab(name)}
            >
              <TabIcon size={15} />
              {name}
            </button>
          );
        })}
      </div>
      <section
        className="nm-card nm-runner-panel"
        id="runner-panel"
        role="tabpanel"
        aria-labelledby={`runner-tab-${tab}`}
      >
        <div className="nm-runner-summary">
          <div>
            <p className="nm-runner-group">
              <span>Runner group</span>
              <strong>GuardRails 0</strong>
              <span>· Default group</span>
            </p>
            <h2>1 Runner serving</h2>
            <p>
              All connected Runners have applied their current configuration.
            </p>
          </div>
          <div className="nm-runner-updated">
            <span>Last updated</span>
            <time aria-label="Last updated" dateTime={checked.toISOString()}>
              {updated}
            </time>
            <span>Updates every 10s</span>
          </div>
        </div>
        <div className="nm-runner-metrics">
          <Facts
            values={[
              ["Current throughput", "0.0 RPS"],
              ["Inflight utilization", "0%"],
              ["Highest Runner p95", "0 ms"],
              ["Error rate", "0.00%"],
            ]}
          />
        </div>
        {tab === "Runner" ? (
          <>
            <header className="nm-runner-table-head">
              <h3>Runner instances</h3>
              <span>1 registered</span>
            </header>
            <div className="nm-scroll">
              <table aria-label="Runner instances">
                <thead>
                  <tr>
                    {[
                      "Instance",
                      "Runtime",
                      "Configuration",
                      "Inflight / queue",
                      "Last heartbeat",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <button
                        className="nm-link nm-runner-instance"
                        aria-expanded={expanded}
                        aria-controls="runner-instance-detail"
                        onClick={() => setExpanded(!expanded)}
                      >
                        {expanded ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                        {instance}
                      </button>
                    </td>
                    <td>
                      <span className="nm-runner-serving">
                        <i />
                        Serving
                      </span>
                    </td>
                    <td>
                      <span className="nm-runner-serving">Up to date</span>
                      <small className="nm-runner-secondary">
                        Applied version 7
                      </small>
                    </td>
                    <td>0 / 0</td>
                    <td>7 seconds ago</td>
                  </tr>
                  {expanded && (
                    <tr id="runner-instance-detail">
                      <td colSpan={5}>
                        <div className="nm-runner-detail">
                          <Facts values={versions} />
                          <Facts
                            values={[
                              ["CPU / Memory", "0% / 2%"],
                              ["Max concurrency per Runner", "64"],
                              ["Heartbeat reported", heartbeat],
                            ]}
                          />
                          <Facts
                            values={[
                              [
                                "Applied / current configuration version",
                                "7 / 7",
                              ],
                            ]}
                          />
                          <p className="nm-muted">
                            The Runner has applied the latest configuration sent
                            by the Controller.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="nm-runner-capacity">
              <p>
                <strong>Capacity target: 2 Runners</strong>
                <span> · 1 currently serving</span>
              </p>
              <button
                className="nm-link"
                aria-expanded={planning}
                aria-controls="runner-capacity"
                onClick={() => setPlanning(!planning)}
              >
                Capacity planning
                <ChevronDown
                  size={14}
                  className={planning ? "nm-runner-chevron-open" : ""}
                />
              </button>
            </div>
            {planning && (
              <section id="runner-capacity" className="nm-runner-planning">
                <h3>Capacity planning</h3>
                <Facts
                  values={[
                    ["Serving Runners", "1"],
                    ["Desired Runners", "2"],
                    ["Recommended Runners", "2"],
                  ]}
                />
                <p>
                  Planned safe capacity: 50.0 RPS · 1 serving × 50.0 RPS per
                  Runner.
                </p>
                <p className="nm-muted">
                  These are planning targets, not measured throughput limits.
                  Changing them does not start or stop Runners. Apply replica
                  changes through Kubernetes, Helm or an external autoscaler.
                </p>
              </section>
            )}
          </>
        ) : tab === "Health" ? (
          <MeasureCard title="Configuration status">
            <div className="nm-runner-detail">
              <Facts
                values={[
                  ["Runtime", "Serving"],
                  ["Configuration", "Up to date"],
                  ["Last heartbeat", "7 seconds ago"],
                  ["Applied / current configuration version", "7 / 7"],
                ]}
              />
            </div>
          </MeasureCard>
        ) : (
          <MeasureCard title="Runtime versions">
            <div className="nm-runner-detail">
              <Facts values={versions} />
            </div>
          </MeasureCard>
        )}
        <p className="nm-runner-status" role="status">
          Runner data is up to date.
        </p>
      </section>
    </div>
  );
}
