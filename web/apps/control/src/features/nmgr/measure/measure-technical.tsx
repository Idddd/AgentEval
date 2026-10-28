import { SystemMetrics } from "./measure-metrics";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RunnerCenter, type MeasureCenter } from "./measure-runner";
import { ProtectionCenter } from "./measure-protection";
import {
  agents,
  sourceReason,
  type Decision,
  type MeasureState,
  type Report,
} from "./measure-data";
import {
  AgentIdentity,
  MeasureCard,
  MeasureSheet,
  Pager,
  StatusBadge,
  utc,
} from "./measure-shared";
import {
  Evidence,
  HistoricalDefinitions,
  ReportSummary,
  ReportTimeline,
  ReviewBoundary,
} from "./measure-evidence";

export function TechnicalMeasure({
  state,
  onReview,
  error,
  clearError,
  onPolicyAdjustment,
  center,
  onCenter,
}: {
  state: MeasureState;
  onReview: (id: string, decision: Decision, reason: string) => boolean;
  error: string;
  clearError: () => void;
  onPolicyAdjustment?: () => void;
  center: MeasureCenter;
  onCenter: (center: MeasureCenter) => void;
}) {
  const [status, setStatus] = useState("All");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [stage, setStage] = useState<"detail" | "review" | "reviewed">(
    "detail",
  );
  const [decision, setDecision] = useState<Decision>("Confirm false positive");
  const [reason, setReason] = useState("");
  const [adjustment, setAdjustment] = useState(false);
  const pageHeading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected && stage !== "detail")
      pageHeading.current?.scrollIntoView?.({ block: "start" });
  }, [selected, stage]);
  const rows = state.reports.filter(
    (r) =>
      (status === "All" || r.status === status) &&
      (!date || r.reportedAt.slice(0, 10) === date),
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 10)));
  const report = state.reports.find((r) => r.id === selected);
  const close = () => {
    setSelected("");
    setStage("detail");
    clearError();
  };
  function open(r: Report) {
    setSelected(r.id);
    setStage(r.status === "Reviewed" ? "reviewed" : "detail");
    clearError();
  }
  function startReview() {
    setStage("review");
    setDecision("Confirm false positive");
    setReason(report?.id === "FPR-2026-00418" ? sourceReason : "");
    clearError();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (report && onReview(report.id, decision, reason)) setStage("reviewed");
  }
  const fullPage = report && stage !== "detail";
  if (center === "runners")
    return <RunnerCenter onBack={() => onCenter("overview")} />;
  if (center === "protection")
    return <ProtectionCenter onBack={() => onCenter("overview")} />;
  return (
    <>
      {fullPage ? (
        <>
          <div ref={pageHeading} className="nm-measure-page-heading">
            <div>
              <button className="nm-link nm-measure-back" onClick={close}>
                <ArrowLeft size={14} />
                False-positive reports
              </button>
              <h2>
                {stage === "review"
                  ? "Review false-positive report"
                  : "Report reviewed"}
              </h2>
            </div>
            <span className="nm-muted">Example data</span>
          </div>
          {stage === "reviewed" && (
            <div className="nm-inline-notice nm-measure-success" role="status">
              <CheckCircle2 size={20} />
              <div>
                <strong>
                  Review submitted ·{" "}
                  {report.review?.decision === "Confirm false positive"
                    ? "Confirmed false positive"
                    : "Not a false positive"}
                </strong>
                <p>
                  Decision recorded for this report only. Production policy and
                  guardrails are unchanged.
                </p>
              </div>
            </div>
          )}
          <ReportSummary report={report} />
          {stage === "review" ? (
            <form onSubmit={submit} noValidate>
              <div className="nm-measure-review-grid">
                <div>
                  <Evidence report={report} />
                  <ReviewBoundary />
                </div>
                <MeasureCard title="Review decision">
                  <div className="nm-measure-review-form">
                    <p className="nm-muted">Reviewer: Alex MORGAN · TEC</p>
                    <fieldset>
                      <legend>Decision *</legend>
                      {(
                        [
                          "Confirm false positive",
                          "Not a false positive",
                        ] as const
                      ).map((value) => (
                        <label
                          key={value}
                          className={decision === value ? "selected" : ""}
                        >
                          <input
                            type="radio"
                            name="review-decision"
                            value={value}
                            checked={decision === value}
                            onChange={() => setDecision(value)}
                          />
                          {value}
                        </label>
                      ))}
                    </fieldset>
                    <label htmlFor="nm-measure-review-reason">
                      Review reason *
                    </label>
                    <Textarea
                      id="nm-measure-review-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={10}
                      required
                    />
                    {error && (
                      <p
                        role="alert"
                        className="nm-inline-notice nm-inline-error"
                      >
                        {error}
                      </p>
                    )}
                  </div>
                </MeasureCard>
              </div>
              <footer className="nm-measure-submit">
                <div>
                  <strong>Record an event review, not a policy change</strong>
                  <p className="nm-muted">
                    Submission adds the decision, reason, reviewer and time to
                    the audit trail.
                  </p>
                </div>
                <div className="nm-actions">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setStage("detail");
                      clearError();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Submit review</Button>
                </div>
              </footer>
            </form>
          ) : (
            <>
              <div className="nm-measure-completed-grid">
                <div>
                  <MeasureCard title="Completed review">
                    <div className="nm-measure-completed">
                      <span className="nm-muted">Review decision</span>
                      <strong>{report.review?.decision}</strong>
                      <span className="nm-muted">Review reason</span>
                      <p className="nm-measure-preserve-lines">
                        {report.review?.reason}
                      </p>
                      <dl className="nm-measure-summary-fields">
                        <div>
                          <dt>Reviewer</dt>
                          <dd>{report.review?.reviewer}</dd>
                        </div>
                        <div>
                          <dt>Reviewed at · UTC</dt>
                          <dd>
                            {report.review ? utc(report.review.time) : "—"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </MeasureCard>
                  <MeasureCard title="Original enforcement · retained">
                    <div className="nm-measure-completed">
                      <strong>
                        {report.action}
                        {report.id === "FPR-2026-00418"
                          ? " → CBGT Identity Verification Queue"
                          : ""}
                      </strong>
                      {report.id === "FPR-2026-00418" && (
                        <>
                          <p>
                            Case MVR-2073 · Accepted 09:16:45 · Resolved 09:24
                          </p>
                          <p>
                            Maya CHEN confirmed in-app verification is
                            sufficient and returned approved process guidance.
                            No identity document was collected or disclosed; no
                            original request was replayed.
                          </p>
                        </>
                      )}
                    </div>
                  </MeasureCard>
                </div>
                <ReportTimeline report={report} />
              </div>
              <div className="nm-measure-completed-grid">
                <Evidence report={report} completed />
                <HistoricalDefinitions report={report} />
              </div>
              <ReviewBoundary />
              <section className="nm-card nm-measure-adjustment">
                <div>
                  <h3>Policy improvement is a separate process</h3>
                  <p>
                    A request enters evaluation → approval → deployment. This
                    action does not make a live change or disable{" "}
                    {report.guardrail}.
                  </p>
                </div>
                <Button variant="outline" onClick={() => setAdjustment(true)}>
                  Request policy adjustment
                </Button>
              </section>
              <footer className="nm-measure-report-navigation">
                <Button variant="outline" onClick={close}>
                  Back to reports
                </Button>
                <Button
                  disabled={
                    !rows.some(
                      (r) => r.id !== selected && r.status !== "Reviewed",
                    )
                  }
                  onClick={() => {
                    const after =
                      state.reports
                        .slice(
                          state.reports.findIndex((r) => r.id === selected) + 1,
                        )
                        .find(
                          (r) =>
                            r.status !== "Reviewed" &&
                            rows.some((filtered) => filtered.id === r.id),
                        ) ??
                      rows.find(
                        (r) => r.id !== selected && r.status !== "Reviewed",
                      );
                    if (after) open(after);
                  }}
                >
                  Next report
                  <ChevronRight size={14} />
                </Button>
              </footer>
            </>
          )}
        </>
      ) : (
        <>
          <SystemMetrics onCenter={onCenter} />
          <MeasureCard
            title="False-Positive Reports"
            aside="False-Positive Reported by users"
          >
            <div className="nm-measure-report-filters">
              <label className="nm-select">
                <span>Status</span>
                <select
                  aria-label="Report status"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  {["All", "Pending review", "In review", "Reviewed"].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="nm-select">
                <span>Reported date · UTC</span>
                <Input
                  aria-label="Report date"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <span className="nm-muted">
                Example data · {rows.length} reports
              </span>
            </div>
            {error && (
              <p role="alert" className="nm-inline-notice nm-inline-error">
                {error}
              </p>
            )}
            <div className="nm-scroll">
              <table className="nm-measure-report-table">
                <thead>
                  <tr>
                    {[
                      "Agent / Report",
                      "Policy",
                      "Guardrail",
                      "Enforcement action",
                    ].map((x) => (
                      <th key={x}>{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice((currentPage - 1) * 10, currentPage * 10)
                    .map((r) => (
                      <tr
                        key={r.id}
                        className={
                          selected === r.id ? "nm-measure-selected" : ""
                        }
                      >
                        <td>
                          <AgentIdentity
                            agent={agents.find((a) => a.id === r.agentId)!}
                            openLabel={`Open report ${r.id}`}
                            onOpen={() => open(r)}
                          />
                          <small>
                            {r.id} · {utc(r.reportedAt)} UTC
                          </small>
                          <StatusBadge>{r.status}</StatusBadge>
                        </td>
                        <td>
                          <strong>{r.policy}</strong>
                          <small>{r.policyDescription}</small>
                        </td>
                        <td>
                          <strong>{r.guardrail}</strong>
                          <small>{r.guardDescription}</small>
                        </td>
                        <td>
                          <StatusBadge>{r.action}</StatusBadge>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <div className="nm-empty">No matching reports.</div>
            )}
            <Pager
              page={currentPage}
              count={rows.length}
              size={10}
              onPage={setPage}
            />
          </MeasureCard>
        </>
      )}
      {report && stage === "detail" && (
        <MeasureSheet
          title="Report detail"
          description={`${report.id} · ${report.status}`}
          onClose={close}
          width={720}
        >
          <div className="nm-measure-detail-heading">
            <strong>{report.id}</strong>
            <StatusBadge>{report.status}</StatusBadge>
          </div>
          <dl className="nm-measure-summary-fields">
            <div>
              <dt>Reported at · UTC</dt>
              <dd>{utc(report.reportedAt)}</dd>
            </div>
            <div>
              <dt>Reporter / Control Unit</dt>
              <dd>
                {report.reporter} / {report.controlUnit ?? "ISS"}
              </dd>
            </div>
          </dl>
          <p className="nm-muted">
            {report.evidence.requestId} / {report.evidence.eventId} · Event:{" "}
            {utc(report.evidence.time)} UTC
          </p>
          <MeasureCard title="Reporter’s reason & expected outcome">
            <div className="nm-measure-evidence">
              <p>
                {report.reportReason ??
                  (report.id === "FPR-2026-00418"
                    ? "“I asked for the approved verification process, not an actual passport number. This routine guidance should not need a manual Transformed.”"
                    : "The reported request may have been incorrectly blocked or transformed.")}
              </p>
              <p>
                <strong>Expected: </strong>
                {report.id === "FPR-2026-00418"
                  ? "Allow process-only guidance while keeping all personal identifiers protected."
                  : "Review the original event against the historical policy and Guardrail."}
              </p>
            </div>
          </MeasureCard>
          <AgentIdentity agent={agents.find((a) => a.id === report.agentId)!} />
          <HistoricalDefinitions report={report} />
          <Evidence report={report} />
          <p className="nm-muted">
            {utc(report.reportedAt)} · {report.reporter} submitted report
          </p>
          <ReviewBoundary />
          <div className="nm-actions">
            <Button onClick={startReview}>Review & Decision</Button>
          </div>
          <p className="nm-muted">
            Close returns to the same filters, page and selected row.
          </p>
        </MeasureSheet>
      )}
      {adjustment && report && (
        <MeasureSheet
          title="Request policy adjustment"
          description="Policy improvement is a separate process"
          onClose={() => setAdjustment(false)}
          width={620}
        >
          <p>
            A request enters evaluation → approval → deployment. This action
            does not make a live change or disable {report.guardrail}.
          </p>
          <HistoricalDefinitions report={report} />
          {onPolicyAdjustment && (
            <Button onClick={onPolicyAdjustment}>
              Open Guardrail Requests
            </Button>
          )}
        </MeasureSheet>
      )}
    </>
  );
}
