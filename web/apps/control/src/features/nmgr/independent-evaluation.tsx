import { useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, FlaskConical, LoaderCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./independent-evaluation.css";

type Status = "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
type HistoryRun = { id: string; status: Status; createdAt: string };
type Run = HistoryRun & { phase?: string; completed: number; total: number };
type Setup = { revision: string; target: string; endpoint: string; demo: boolean; datasets: { id: string; name: string; version: number }[] };
type Report = {
  status: Status; total: number; offset: number; nextOffset?: number | null; matched: number; mismatches: number; errors: number;
  rows: { id: string; status: "PASS" | "FAIL" | "ERROR"; httpStatus?: number; labels: { expected?: string; observed?: string }[] }[];
};
type Pending = { key: string; revision: string };
class EvaluationFailure extends Error {
  constructor(message: string, readonly code: string, readonly status: number) { super(message); }
}
const transient = new Set(["evaluation_unreachable", "evaluation_busy", "evaluation_report_pending", "evaluation_transport"]);
const displayDate = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : value;
const loadPending = (key: string): Pending | null => {
  try { const value = JSON.parse(sessionStorage.getItem(key) ?? "null"); return typeof value?.key === "string" && typeof value.revision === "string" ? value : null; }
  catch { return null; }
};

export function IndependentEvaluation({ guardrail, version, demo = false, roleHeader, connectionRevision }: {
  guardrail: string; version: number; demo?: boolean; roleHeader?: string | undefined; connectionRevision?: string | undefined;
}) {
  const path = demo ? "/api/guardrail-evaluation" : "/api/nmgr/guardrail-evaluation";
  const storageKey = `nmgr-independent:${path}:${connectionRevision ?? ""}:${guardrail}@${version}`;
  const request = useMemo(() => async <T,>(signal: AbortSignal, query: Record<string, string> = {}, pending?: Pending): Promise<T> => {
    const params = new URLSearchParams({ guardrail, version: String(version), ...query, ...(pending ? { revision: pending.revision } : {}) });
    let response: Response;
    try {
      response = await fetch(`${path}?${params}`, {
        method: pending ? "POST" : "GET", cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(32_000)]),
        headers: {
          ...(demo || roleHeader ? { "X-Marketplace-Role": demo ? "IT Admin" : roleHeader! } : {}),
          ...(connectionRevision ? { "X-Marketplace-Connection": connectionRevision } : {}),
          ...(pending ? { "Idempotency-Key": pending.key } : {}),
        },
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new EvaluationFailure("Cannot reach the Marketplace evaluation API. Check your connection.", "evaluation_transport", 0);
    }
    const value = response.headers.get("content-type")?.includes("application/json") ? await response.json().catch(() => null) : null;
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new EvaluationFailure("Marketplace did not return evaluation data. Check that the API is deployed and reachable.", "evaluation_transport", response.status);
    if (!response.ok) throw new EvaluationFailure(value.error?.message || `Evaluation request failed (HTTP ${response.status}).`, value.error?.code || "", response.status);
    return value as T;
  }, [path, guardrail, version, demo, roleHeader, connectionRevision]);

  const [setup, setSetup] = useState<Setup | null>(null);
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [runId, selectRun] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [offset, setOffset] = useState(0);
  const [refreshSetup, reloadSetup] = useState(0);
  const [refreshRun, reloadRun] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [trackError, setTrackError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [pollPaused, setPollPaused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [pending, setPending] = useState<Pending | null>(() => loadPending(storageKey));
  const sending = useRef<AbortController | null>(null);
  useEffect(() => () => { sending.current?.abort(); }, []);
  const remember = (value: Pending | null) => {
    setPending(value);
    try { if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey); } catch {}
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    void request<{ setup: Setup; history: HistoryRun[] }>(controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setSetup(value.setup);
      setHistory(value.history);
      selectRun(previous => previous || value.history[0]?.id || "");
    }).catch(error => { if (!controller.signal.aborted) setLoadError(error.message); });
    return () => controller.abort();
  }, [request, refreshSetup]);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    let delay: number | undefined;
    let errors = 0;
    setTrackError("");
    setPollPaused(false);
    const poll = async () => {
      try {
        const value = await request<{ run: Run }>(controller.signal, { run: runId });
        if (controller.signal.aborted) return;
        setRun(value.run);
        setHistory(list => [value.run, ...list.filter(entry => entry.id !== value.run.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12));
        if (value.run.status === "RUNNING") {
          errors = 0;
          setTrackError("");
          delay = window.setTimeout(poll, 1800);
          return;
        }
        setReportLoading(true);
        const result = await request<{ report: Report }>(controller.signal, { run: runId, report: "true", offset: String(offset) });
        if (controller.signal.aborted) return;
        if (result.report.status === "RUNNING") throw new EvaluationFailure("The report is still being prepared.", "evaluation_report_pending", 404);
        setReport(result.report);
        setTrackError("");
        setReportLoading(false);
      } catch (error) {
        if (controller.signal.aborted) return;
        const failure = error as EvaluationFailure;
        if ((transient.has(failure.code) || failure.status >= 500 && failure.code !== "evaluation_credentials") && errors < 4) {
          errors++;
          if (failure.code !== "evaluation_report_pending") setTrackError(`${failure.message} Retrying automatically…`);
          delay = window.setTimeout(poll, Math.min(8000, 1500 * 2 ** (errors - 1)));
          return;
        }
        setPollPaused(true);
        setTrackError(failure.message);
        setReportLoading(false);
      }
    };
    void poll();
    return () => { controller.abort(); window.clearTimeout(delay); };
  }, [request, runId, offset, refreshRun]);

  const selectedRun = run?.id === runId ? run : null;
  function chooseRun(next: string) {
    setReport(null); setOffset(0); setTrackError(""); selectRun(next);
  }
  async function submit() {
    if (!setup || sending.current || loadError) return;
    if (pending && pending.revision !== setup.revision) {
      setSubmitError("The configuration changed after the last submission. Check Recent runs before starting a new evaluation.");
      return;
    }
    const controller = new AbortController();
    const attempt = pending ?? { key: crypto.randomUUID(), revision: setup.revision };
    remember(attempt);
    sending.current = controller;
    setSubmitting(true);
    setSubmitError("");
    try {
      const value = await request<{ run: Run }>(controller.signal, {}, attempt);
      if (controller.signal.aborted) return;
      remember(null);
      chooseRun(value.run.id);
      setRun(value.run);
      setHistory(list => [value.run, ...list.filter(entry => entry.id !== value.run.id)].slice(0, 12));
      reloadRun(i => i + 1);
    } catch (error) {
      if (controller.signal.aborted) return;
      const failure = error as EvaluationFailure;
      if (!pending && failure.status > 0 && failure.status < 500 && failure.status !== 409 && failure.code !== "evaluation_transport") remember(null);
      setSubmitError(failure.message);
    } finally {
      if (!controller.signal.aborted) { sending.current = null; setSubmitting(false); }
    }
  }
  const running = selectedRun?.status === "RUNNING";
  const progress = selectedRun ? Math.min(selectedRun.completed, selectedRun.total) : 0;
  const phase = selectedRun?.phase?.toUpperCase();
  const status = !selectedRun ? "Checking run" : running ? phase === "QUEUED" ? "Queued" : phase === "FINALIZING" || phase === "SCORING" ? "Finalizing" : "Running"
    : selectedRun.status === "COMPLETED" ? report && report.errors > 0 ? "Completed with errors" : report && report.mismatches > 0 ? "Completed with mismatches" : "Completed" : selectedRun.status === "FAILED" ? "Run failed" : "Cancelled";
  const formatLabels = (row: Report["rows"][number], field: "expected" | "observed") =>
    row.labels.map(label => label[field] ?? "—").join(" / ") || "—";

  return <section className="nm-independent" aria-label="Independent evaluation">
    <div className="nm-ie-heading">
      <div><h3>Independent evaluation</h3><p>Run the published suite for revision {version}.</p></div>
      {demo && <span className="nm-ie-demo">Local demo endpoint</span>}
    </div>
    {loadError ? <div className="nm-ie-error" role="alert">{loadError} <Button variant="outline" size="sm" onClick={() => reloadSetup(i => i + 1)}>Retry connection</Button></div>
      : !setup ? <p role="status">Connecting to the evaluation service…</p> : <>
        <div className="nm-ie-meta">
          <div><span>Dataset</span><strong>{setup.datasets.map(dataset => `${dataset.name} · v${dataset.version}`).join(", ")}</strong></div>
          <div><span>Endpoint</span><strong>{setup.endpoint}</strong></div>
        </div>
        <div className="nm-ie-controls">
          <Button disabled={submitting || (!pending && running) || (!!pending && pending.revision !== setup.revision)} onClick={() => void submit()}>
            {submitting ? <LoaderCircle aria-hidden className="nm-ie-spin" size={16} /> : <FlaskConical aria-hidden size={16} />}
            {submitting ? "Submitting…" : pending ? "Retry submission" : "Run evaluation"}
          </Button>
          {history.length > 0 && <label>Recent runs<select aria-label="Recent runs" value={runId} disabled={submitting} onChange={event => chooseRun(event.target.value)}>
            {history.map(entry => <option key={entry.id} value={entry.id}>{displayDate(entry.createdAt)} · {entry.status.toLowerCase()} · {entry.id.slice(-6)}</option>)}
          </select></label>}
        </div>
        {pending && !submitting && <div className="nm-ie-note">The last submission was not confirmed. {pending.revision === setup.revision ? "Retrying uses the same request and does not create a duplicate." : "The suite changed since that submission; check Recent runs before continuing."}
          <div className="nm-ie-controls"><Button variant="outline" size="sm" onClick={() => reloadSetup(i => i + 1)}>Refresh recent runs</Button>
          <Button variant="ghost" size="sm" onClick={() => { remember(null); setSubmitError(""); }}>Dismiss retry</Button></div>
        </div>}
        {submitError && <p className="nm-ie-error" role="alert">{submitError}</p>}
      </>}
    {runId && !submitting && <div className="nm-ie-result">
      <div className="nm-ie-run">
        <div role="status" aria-live="polite"><strong>
          {running || !selectedRun ? <LoaderCircle className="nm-ie-spin" size={18} aria-hidden /> : selectedRun.status === "COMPLETED" && !report?.errors && !report?.mismatches ? <CircleCheck size={18} aria-hidden /> : <CircleAlert size={18} aria-hidden />}
          {status}</strong>
          {selectedRun && <span>{progress}/{selectedRun.total} cases processed</span>}
        </div>
        {selectedRun && <small title={selectedRun.id}>Run {selectedRun.id}</small>}
      </div>
      {running && <progress aria-label="Evaluation progress" max={selectedRun.total || 1} {...(selectedRun.total ? { value: progress } : {})} />}
      {selectedRun?.status === "FAILED" && <p className="nm-ie-error">The evaluation runner failed. Check the evaluation backend logs using the run ID above.</p>}
      {reportLoading && <p role="status">Preparing the report…</p>}
      {trackError && <div className="nm-ie-error" role={pollPaused ? "alert" : "status"}>{trackError} {pollPaused && <Button variant="outline" size="sm" onClick={() => reloadRun(i => i + 1)}><RotateCw size={14} aria-hidden /> Refresh result</Button>}</div>}
      {report && <>
        <div className="nm-ie-totals">
          <div className="nm-ie-pass"><strong>{report.matched}</strong><span>Matched</span></div>
          <div className={report.mismatches ? "nm-ie-fail" : ""}><strong>{report.mismatches}</strong><span>Mismatched</span></div>
          <div className={report.errors ? "nm-ie-fail" : ""}><strong>{report.errors}</strong><span>Errors</span></div>
        </div>
        <div className="nm-ie-table-wrap">
          <table aria-label="Evaluation case results"><thead><tr><th>Case</th><th>Result</th><th>Expected</th><th>Observed</th></tr></thead>
          <tbody>{report.rows.map((row, index) => <tr key={`${row.id}-${index}`}>
            <td>{row.id}</td><td><span className={`nm-ie-case ${row.status === "PASS" ? "nm-ie-pass" : "nm-ie-fail"}`}>{row.status === "PASS" ? "✓ Pass" : row.status === "FAIL" ? "✕ Fail" : `! Error${row.httpStatus ? ` · HTTP ${row.httpStatus}` : ""}`}</span></td>
            <td>{formatLabels(row, "expected")}</td><td>{formatLabels(row, "observed")}</td>
          </tr>)}</tbody></table>
        </div>
        {report.total > 25 && <div className="nm-ie-controls">
          <small>{report.offset + 1}–{report.offset + report.rows.length} of {report.total}</small>
          <Button variant="outline" size="sm" disabled={reportLoading || !report.offset} onClick={() => { setReportLoading(true); setOffset(Math.max(0, report.offset - 25)); }}>Previous</Button>
          <Button variant="outline" size="sm" disabled={reportLoading || report.nextOffset == null} onClick={() => { if (report.nextOffset != null) { setReportLoading(true); setOffset(report.nextOffset); } }}>Next</Button>
        </div>}
      </>}
    </div>}
    <p className="nm-ie-foot">{demo ? "Synthetic test data and a mock endpoint; not a production assessment." : "Independent results do not change Marketplace sign-off status."}</p>
  </section>;
}
