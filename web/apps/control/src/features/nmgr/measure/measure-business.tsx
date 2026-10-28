import { useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Role } from "../model";
import {
  agents,
  policyEvents,
  policyHits,
  type Agent,
  type MeasureState,
  type PolicyEvent,
} from "./measure-data";
import {
  AgentIdentity,
  MeasureCard,
  MeasureSheet,
  Pager,
  StatusBadge,
  utc,
} from "./measure-shared";
import { BusinessOverview, type HitFocus } from "./measure-overview";
import { ReportSubmission } from "./measure-report-form";
import { actorNames } from "../workbench";

export function BusinessMeasure({
  role,
  state,
  onReport,
  error,
  clearError,
  onDashboard,
}: {
  role: Role;
  state: MeasureState;
  onReport: (event: PolicyEvent, reason: string) => boolean;
  error: string;
  clearError: () => void;
  onDashboard?: () => void;
}) {
  const [page, setPage] = useState(1);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [policy, setPolicy] = useState("");
  const [policyPage, setPolicyPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
  const [focus, setFocus] = useState<HitFocus | null>(null);
  const [reporting, setReporting] = useState<PolicyEvent | null>(null);
  const agentSection = useRef<HTMLDivElement>(null);
  const rankedAgents = focus
    ? agents.filter((a) => a[focus] > 0).sort((a, b) => b[focus] - a[focus])
    : agents;
  function focusMetric(metric: HitFocus) {
    setFocus(metric);
    setPage(1);
    agentSection.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "start",
    });
    agentSection.current?.focus({ preventScroll: true });
  }
  const hit = policyHits.find((p) => p.id === policy);
  const events = agent && hit ? policyEvents(agent.id, hit.id) : [];
  const close = () => {
    if (policy) setPolicy("");
    else setAgent(null);
  };
  if (reporting)
    return (
      <ReportSubmission
        event={reporting}
        actor={actorNames[role]}
        error={error}
        onCancel={() => {
          setReporting(null);
          clearError();
        }}
        onSubmit={(reason) => {
          const saved = onReport(reporting, reason);
          if (saved) setReporting(null);
          return saved;
        }}
      />
    );
  return (
    <>
      <BusinessOverview
        role={role}
        onMetricFocus={focusMetric}
        focus={focus}
        {...(onDashboard ? { onDashboard } : {})}
      />
      <div
        ref={agentSection}
        className="nm-measure-agent-section"
        tabIndex={-1}
      >
        <MeasureCard
          title="Agents Breach Hit-Threshold"
          aside={
            <span className="nm-measure-agent-aside">
              <span>Agents cause 20 hits per minute will be listed here.</span>
              {focus && (
                <button
                  className={`nm-measure-focus-chip ${focus}`}
                  aria-label="Clear metric focus"
                  onClick={() => {
                    setFocus(null);
                    setPage(1);
                  }}
                >
                  {focus === "blocked" ? "Blocked hits" : "Transformed hits"}
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </span>
          }
        >
          <div className="nm-scroll">
            <table
              className="nm-measure-agent-table"
              data-metric-focus={focus ?? "all"}
            >
              <thead>
                <tr>
                  {["Agent", "Max Hits Per Min", "Blocked", "Transformed"].map(
                    (x) => (
                      <th
                        key={x}
                        aria-sort={
                          (x === "Blocked" && focus === "blocked") ||
                          (x === "Transformed" && focus === "transformed")
                            ? "descending"
                            : undefined
                        }
                      >
                        {x}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rankedAgents.slice((page - 1) * 10, page * 10).map((a) => (
                  <tr key={a.id}>
                    <td>
                      <AgentIdentity
                        agent={a}
                        onOpen={() => {
                          setAgent(a);
                          setPolicyPage(1);
                        }}
                      />
                    </td>
                    <td>{a.hits}</td>
                    <td>{a.blocked}</td>
                    <td>{a.transformed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={page}
            count={rankedAgents.length}
            size={10}
            onPage={setPage}
          />
        </MeasureCard>
      </div>
      {agent && (
        <MeasureSheet
          title={hit ? hit.policy : "Hits Threshold Breach"}
          description={hit ? hit.description : "Threshold breach details"}
          onClose={close}
        >
          <AgentIdentity agent={agent} />
          {error && (
            <p role="alert" className="nm-inline-notice nm-inline-error">
              {error}
            </p>
          )}
          {hit ? (
            <>
              <div className="nm-measure-policy-heading">
                <div>
                  <strong>{hit.guardrail}</strong>
                  <p className="nm-muted">{hit.guardDescription}</p>
                </div>
                <div>
                  <span className="nm-muted">Operation</span>
                  <StatusBadge>{hit.action}</StatusBadge>
                </div>
              </div>
              <section className="nm-card nm-measure-event-list">
                <div className="nm-scroll">
                  <table>
                    <thead>
                      <tr>
                        {["Time", "Prompt", "Response", "Action"].map((x) => (
                          <th key={x}>{x}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {events
                        .slice((eventPage - 1) * 10, eventPage * 10)
                        .map((event) => (
                          <tr key={event.id}>
                            <td>{utc(event.time)}</td>
                            <td>{event.prompt}</td>
                            <td>{event.response}</td>
                            <td>
                              {event.reported ||
                              state.reports.some(
                                (r) => r.eventId === event.id,
                              ) ? (
                                <span className="nm-measure-reported">
                                  False Positive Reported
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    clearError();
                                    setReporting(event);
                                  }}
                                >
                                  Report False Positive
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <Pager
                  page={eventPage}
                  count={events.length}
                  size={10}
                  onPage={setEventPage}
                />
              </section>
            </>
          ) : (
            <section className="nm-card">
              <div className="nm-scroll">
                <table>
                  <thead>
                    <tr>
                      {["Policy", "Guardrail", "Decision", "Hits"].map((x) => (
                        <th key={x}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {policyHits
                      .slice((policyPage - 1) * 5, policyPage * 5)
                      .map((p) => (
                        <tr key={p.id}>
                          <td>
                            <button
                              className="nm-link"
                              onClick={() => {
                                setPolicy(p.id);
                                setEventPage(1);
                              }}
                            >
                              {p.policy}
                            </button>
                            <small>{p.description}</small>
                          </td>
                          <td>
                            <strong>{p.guardrail}</strong>
                            <small>{p.guardDescription}</small>
                          </td>
                          <td>
                            <StatusBadge>{p.action}</StatusBadge>
                          </td>
                          <td>{p.hits}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={policyPage}
                count={policyHits.length}
                size={5}
                onPage={setPolicyPage}
              />
            </section>
          )}
        </MeasureSheet>
      )}
    </>
  );
}
