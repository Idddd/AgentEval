import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Activity,
  Server,
  MessageSquare,
  ChartNoAxesCombined,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MeasureCard } from "./measure-shared";
import "./tech-workspace.css";

const titles = {
  overview: "System Performance",
  throughput: "Throughput Trend",
  latency: "Latency Trend",
  models: "Model Usage",
  model: "Model Usage Trend",
  runners: "Runners",
  runner: "Runner Status",
  gpu: "GPU Usage Trend",
  cpu: "CPU Usage Trend",
  feedback: "All Feedback",
  review: "Feedback Review",
  close: "Close Feedback",
  closed: "Feedback Closure",
} as const;
type Page = keyof typeof titles;
const parents: Partial<Record<Page, Page>> = {
  model: "models",
  runner: "runners",
  review: "feedback",
  close: "review",
  closed: "feedback",
};
const categories = [
  "All categories",
  "False-positive",
  "False-negative",
  "Common feedback",
];
function readRoute() {
  const q = new URLSearchParams(
    (typeof window === "undefined" ? "" : window.location.hash).split("?")[1],
  );
  const fallback =
    typeof window !== "undefined" &&
    window.location.hash.startsWith("#Profile/runners/")
      ? "runners"
      : "overview";
  const page = q.get("tech") ?? fallback;
  return {
    page: (Object.hasOwn(titles, page) ? page : "overview") as Page,
    period: q.get("period") === "mom" ? "mom" : "dod",
    category: categories.includes(q.get("category") ?? "")
      ? q.get("category")!
      : categories[0]!,
    status: ["Open", "Closed"].includes(q.get("status") ?? "")
      ? q.get("status")!
      : "All statuses",
    query: q.get("q") ?? "",
  };
}
function Placeholder({
  children = "Data placeholder",
  chart = false,
}: {
  children?: ReactNode;
  chart?: boolean;
}) {
  return (
    <div
      className={
        chart ? "nm-tech-placeholder nm-tech-chart" : "nm-tech-placeholder"
      }
    >
      <ChartNoAxesCombined size={22} aria-hidden="true" />
      <span>{children}</span>
      <small>Data not available</small>
    </div>
  );
}
function Fields({ names }: { names: string[] }) {
  return (
    <dl className="nm-tech-fields">
      {names.map((name) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd aria-label={`${name}: data not available`}>—</dd>
        </div>
      ))}
    </dl>
  );
}
function PlaceholderTable({
  columns,
  action,
}: {
  columns: string[];
  action?: ReactNode;
}) {
  return (
    <>
      <div className="nm-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th scope="col" key={c}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {columns.map((c, i) => (
                <td key={c}>
                  {i === 0 ? (
                    <span className="nm-tech-row-label">{c} placeholder</span>
                  ) : (
                    "—"
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="nm-tech-table-footer">
        <span>Placeholder layout · No records loaded</span>
        {action}
      </div>
    </>
  );
}
export function TechWorkspace() {
  const [route, setRoute] = useState(readRoute);
  const [comment, setComment] = useState("");
  const [jira, setJira] = useState("");
  const { page, period, category, status, query } = route;
  useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  useLayoutEffect(() => {
    const root = document.scrollingElement ?? document.documentElement;
    root.scrollTop = 0;
  }, [page]);
  function navigate(next: Partial<typeof route>, replace = false) {
    const value = { ...route, ...next };
    const q = new URLSearchParams({
      tech: value.page,
      period: value.period,
      category: value.category,
      status: value.status,
    });
    if (value.query) q.set("q", value.query);
    window.history[replace ? "replaceState" : "pushState"](
      replace
        ? window.history.state
        : { ...window.history.state, techPrevious: page },
      "",
      `#Profile/measure/?${q}`,
    );
    setRoute(value);
  }
  const go = (next: Page) => navigate({ page: next });
  function back() {
    const parent = parents[page] ?? "overview";
    if (window.history.state?.techPrevious === parent) window.history.back();
    else go(parent);
  }
  const action = (label: string, target: Page) => (
    <Button variant="outline" size="sm" onClick={() => go(target)}>
      {label}
      <ArrowRight size={14} />
    </Button>
  );
  const closureForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (comment.trim()) go("closed");
      }}
    >
      <MeasureCard title="Feedback Closure">
        <div className="nm-tech-form">
          <label>
            <span>
              Closure comment <span aria-hidden="true">*</span>
            </span>
            <Textarea
              aria-label="Closure comment"
              className="min-h-36 resize-y"
              required
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Summarize the review and any follow-up required…"
              rows={6}
              maxLength={5000}
            />
          </label>
          <label>
            <span>
              JIRA ticket <span className="nm-muted">(optional)</span>
            </span>
            <Input
              aria-label="JIRA ticket"
              value={jira}
              onChange={(e) => setJira(e.target.value)}
              placeholder="Enter the follow-up ticket number"
              maxLength={100}
            />
          </label>
          <p className="nm-muted">
            Close the feedback with a comment and an optional JIRA ticket for
            follow-up. This placeholder preview does not update live records.
          </p>
          <div className="nm-tech-form-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => go("feedback")}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Go Back
            </Button>
            <Button type="submit" disabled={!comment.trim()}>
              Close feedback
              <ArrowRight size={14} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </MeasureCard>
    </form>
  );
  const comparison = (
    <label className="nm-select">
      <span>Comparison</span>
      <select
        aria-label="Comparison"
        value={period}
        onChange={(e) => navigate({ period: e.target.value }, true)}
      >
        <option value="dod">Day over day</option>
        <option value="mom">Month over month</option>
      </select>
    </label>
  );
  function metric(
    title: string,
    unit: string,
    target: Page,
    detail?: ReactNode,
  ) {
    return (
      <button
        className="nm-tech-metric"
        onClick={() => go(target)}
        aria-label={`View ${title}`}
      >
        <span className="nm-tech-metric-heading">
          {title}
          <ArrowRight size={16} />
        </span>
        {detail ?? (
          <span className="nm-tech-value">
            — <small>{unit}</small>
          </span>
        )}
        <span className="nm-tech-metric-foot">
          View{" "}
          {target === "models" || target === "runners" ? "details" : "trend"}
        </span>
      </button>
    );
  }
  function feedbackTable() {
    return (
      <MeasureCard
        title="Feedback Requests"
        aside={
          page === "overview" ? action("All feedback", "feedback") : undefined
        }
      >
        <div className="nm-tech-filters">
          <label className="nm-select">
            <span>Category</span>
            <select
              aria-label="Feedback category"
              value={category}
              onChange={(e) => navigate({ category: e.target.value }, true)}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="nm-select">
            <span>Status</span>
            <select
              aria-label="Feedback status"
              value={status}
              onChange={(e) => navigate({ status: e.target.value }, true)}
            >
              {["All statuses", "Open", "Closed"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="nm-tech-search">
            <span>Search</span>
            <Input
              aria-label="Search feedback"
              placeholder="Search feedback, agent or policy…"
              value={query}
              onChange={(e) => navigate({ query: e.target.value }, true)}
            />
          </label>
          {(query ||
            category !== categories[0] ||
            status !== "All statuses") && (
            <Button
              variant="ghost"
              onClick={() =>
                navigate(
                  {
                    query: "",
                    category: categories[0]!,
                    status: "All statuses",
                  },
                  true,
                )
              }
            >
              Reset filters
            </Button>
          )}
        </div>
        <PlaceholderTable
          columns={[
            "Feedback",
            "Category",
            "Agent / Control Unit",
            "Policy / Guardrail",
            "Status",
            "Submitted at",
          ]}
          action={action("Preview feedback review", "review")}
        />
      </MeasureCard>
    );
  }
  const trend = ["throughput", "latency", "model", "gpu", "cpu"].includes(page);
  const trendFields =
    page === "latency"
      ? ["P99 · ms", "P75 · ms", "P50 · ms"]
      : page === "gpu"
        ? ["GPU utilization · %", "VRAM used · GB"]
        : page === "cpu"
          ? ["CPU utilization · %", "RAM used · GB"]
          : page === "model"
            ? ["Model", "Requests", "Usage share · %"]
            : ["Throughput · QPS", "Peak QPS", "Average QPS"];
  return (
    <div className="nm-tech-workspace">
      <header className="nm-tech-heading">
        <div>
          <nav aria-label="Measure breadcrumb">
            <button
              className="nm-link"
              aria-label="Back to Tech overview"
              onClick={() => go("overview")}
            >
              Measure
            </button>
            <span>
              {" "}
              / {page === "overview" ? "Tech overview" : titles[page]}
            </span>
          </nav>
          <h2>{page === "overview" ? "Tech Overview" : titles[page]}</h2>
          <p className="nm-muted">
            {page === "overview"
              ? "Monitor performance, resource health and enhancement feedback."
              : "Placeholder view · Values and records are not connected."}
          </p>
        </div>
        {page !== "overview" && (
          <Button variant="outline" size="sm" onClick={back}>
            <ArrowLeft size={14} />
            Back to {parents[page] ? titles[parents[page]!] : "Overview"}
          </Button>
        )}
      </header>
      {page === "overview" && (
        <>
          <section aria-labelledby="tech-performance">
            <div className="nm-tech-section-heading">
              <h2 id="tech-performance">
                <Activity size={18} />
                System Performance
              </h2>
              <span className="nm-muted">Metrics placeholder</span>
            </div>
            <div className="nm-tech-grid">
              {metric("Throughput", "QPS", "throughput")}
              {metric(
                "Latency",
                "ms",
                "latency",
                <Fields names={["P99 · ms", "P75 · ms", "P50 · ms"]} />,
              )}
              {metric(
                "Model Usage",
                "",
                "models",
                <Fields names={["Most used model", "Least used model"]} />,
              )}
            </div>
          </section>
          <section aria-labelledby="tech-resource">
            <div className="nm-tech-section-heading">
              <h2 id="tech-resource">
                <Server size={18} />
                Resource Health
              </h2>
            </div>
            <div className="nm-tech-grid">
              {metric(
                "Runners",
                "active / quota",
                "runners",
                <span className="nm-tech-value">
                  — / — <small>active / quota</small>
                </span>,
              )}
              {metric(
                "GPU & VRAM",
                "",
                "gpu",
                <Fields names={["GPU utilization · %", "VRAM used · GB"]} />,
              )}
              {metric(
                "CPU & RAM",
                "",
                "cpu",
                <Fields names={["CPU utilization · %", "RAM used · GB"]} />,
              )}
            </div>
          </section>
          <section aria-label="Enhancement feedback">
            <div className="nm-tech-section-heading">
              <h2>
                <MessageSquare size={18} />
                Feedback Requests
              </h2>
              <span className="nm-muted">
                False-positive · False-negative · Common feedback
              </span>
            </div>
            {feedbackTable()}
          </section>
        </>
      )}
      {trend && (
        <>
          <div className="nm-tech-filters">
            {comparison}
            <span className="nm-muted">
              {period === "dod"
                ? "Current day compared with previous day"
                : "Current month compared with previous month"}
            </span>
          </div>
          <MeasureCard
            title={
              page === "model" ? "Model information" : "Performance summary"
            }
          >
            <Fields names={trendFields} />
          </MeasureCard>
          <MeasureCard
            title={titles[page]}
            aside={
              <span className="nm-muted">Current period / Previous period</span>
            }
          >
            <Placeholder chart>
              {titles[page]} ·{" "}
              {period === "dod"
                ? "Day-over-day comparison"
                : "Month-over-month comparison"}
            </Placeholder>
          </MeasureCard>
          <MeasureCard title="Period comparison">
            <PlaceholderTable
              columns={[
                "Metric",
                "Current period",
                "Previous period",
                "Change",
              ]}
            />
          </MeasureCard>
        </>
      )}
      {page === "models" && (
        <>
          <MeasureCard title="Model usage summary">
            <Fields
              names={["Active models", "Most used model", "Least used model"]}
            />
          </MeasureCard>
          <MeasureCard title="Active Models">
            <PlaceholderTable
              columns={["Model", "Requests", "Usage share", "Last activity"]}
              action={action("Preview model usage trend", "model")}
            />
          </MeasureCard>
        </>
      )}
      {page === "runners" && (
        <>
          <MeasureCard title="Runner capacity">
            <Fields
              names={["Active runners", "Runner quota", "Resource status"]}
            />
          </MeasureCard>
          <MeasureCard title="Runner List">
            <PlaceholderTable
              columns={[
                "Runner",
                "Status",
                "GPU / VRAM",
                "CPU / RAM",
                "Last heartbeat",
              ]}
              action={action("Preview runner status", "runner")}
            />
          </MeasureCard>
        </>
      )}
      {page === "runner" && (
        <>
          <MeasureCard title="Runner Information">
            <Fields
              names={["Runner name", "Runner ID", "Status", "Last heartbeat"]}
            />
          </MeasureCard>
          <div className="nm-tech-two">
            <MeasureCard title="GPU & VRAM">
              <Fields names={["GPU utilization · %", "VRAM used · GB"]} />
              <Placeholder chart>Runner GPU & VRAM trend</Placeholder>
            </MeasureCard>
            <MeasureCard title="CPU & RAM">
              <Fields names={["CPU utilization · %", "RAM used · GB"]} />
              <Placeholder chart>Runner CPU & RAM trend</Placeholder>
            </MeasureCard>
          </div>
        </>
      )}
      {page === "feedback" && feedbackTable()}
      {["review", "close", "closed"].includes(page) && (
        <>
          <MeasureCard
            title="Feedback Summary"
            aside={
              <span className="nm-tech-tag">
                {page === "closed" && comment.trim()
                  ? "Closed · Preview"
                  : "Placeholder"}
              </span>
            }
          >
            <Fields
              names={[
                "Feedback ID",
                "Category",
                ...(page === "closed" && comment.trim() ? [] : ["Status"]),
                "Submitted at · UTC",
                "Reporter / Control Unit",
                "Agent / Custodian",
              ]}
            />
          </MeasureCard>
          {(page === "review" || page === "close") && (
            <>
              <div className="nm-tech-two">
                <div>
                  <MeasureCard title="Scan Evidence">
                    <Fields
                      names={["Scan ID", "Event time · UTC", "Decision"]}
                    />
                    <div className="nm-tech-evidence">
                      <h4>Prompt / context</h4>
                      <Placeholder>Prompt or context placeholder</Placeholder>
                      <h4>Response / modified output</h4>
                      <Placeholder>Response placeholder</Placeholder>
                    </div>
                  </MeasureCard>
                  <MeasureCard title="Policy / Guardrail">
                    <Fields
                      names={[
                        "Policy",
                        "Policy version",
                        "Guardrail",
                        "Guardrail version",
                      ]}
                    />
                  </MeasureCard>
                </div>
                <div>
                  <MeasureCard title="Reporter’s Feedback">
                    <div className="nm-tech-evidence">
                      <h4>Comment</h4>
                      <Placeholder>
                        Feedback description placeholder
                      </Placeholder>
                      <h4>Expected behavior</h4>
                      <Placeholder>Expected outcome placeholder</Placeholder>
                    </div>
                  </MeasureCard>
                  <MeasureCard title="Agent / Profile">
                    <Fields
                      names={["Agent", "Business unit", "Custodian", "Profile"]}
                    />
                  </MeasureCard>
                  {closureForm}
                </div>
              </div>
            </>
          )}
          {page === "closed" && (
            <>
              <MeasureCard title="Closure Summary">
                <div className="nm-tech-form">
                  <p className="nm-muted">
                    {comment.trim()
                      ? "The feedback has reached its Closed state in this preview. No live record was changed."
                      : "Closure details placeholder · No feedback record loaded."}
                  </p>
                  <div>
                    <h4>Closure comment</h4>
                    <p className="nm-tech-comment">
                      {comment || "Closure comment placeholder"}
                    </p>
                  </div>
                  <div>
                    <h4>JIRA ticket</h4>
                    <p>{jira || "—"}</p>
                  </div>
                  <Fields names={["Closed by", "Closed at · UTC"]} />
                  <div className="nm-tech-form-actions">
                    <Button onClick={() => go("feedback")}>
                      <ArrowLeft size={14} aria-hidden="true" />
                      Go Back
                    </Button>
                  </div>
                </div>
              </MeasureCard>
            </>
          )}
        </>
      )}
    </div>
  );
}
