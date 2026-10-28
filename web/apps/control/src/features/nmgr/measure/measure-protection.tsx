import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  agents,
  policyEvents,
  policyHits,
  type PolicyEvent,
} from "./measure-data";
import { reportForEvent } from "./measure-store";
import { Evidence } from "./measure-evidence";
import {
  MeasureCard,
  MeasureSheet,
  Pager,
  StatusBadge,
  utc,
} from "./measure-shared";

// Read-only synthetic events already used by Measure. This never queries NeMo.
const events = policyHits.flatMap((hit) => policyEvents(agents[0]!.id, hit.id));
export function ProtectionCenter({ onBack }: { onBack: () => void }) {
  const [guardrail, setGuardrail] = useState("All Guardrails"),
    [time, setTime] = useState("All time"),
    [direction, setDirection] = useState("All directions"),
    [outcome, setOutcome] = useState("All outcomes");
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<PolicyEvent | null>(null);
  const guards = [...new Set(policyHits.map((hit) => hit.guardrail))];
  const latest = Math.max(...events.map((event) => Date.parse(event.time)));
  const rows = events.filter(
    (event) =>
      (guardrail === "All Guardrails" ||
        policyHits.find((hit) => hit.id === event.policyId)?.guardrail ===
          guardrail) &&
      (outcome === "All outcomes" || event.action === outcome) &&
      direction !== "Output" &&
      (time === "All time" ||
        Date.parse(event.time) >=
          latest - (time === "Last hour" ? 3600000 : 86400000)),
  );
  return (
    <>
      <div className="nm-measure-page-heading">
        <div>
          <button className="nm-link nm-measure-back" onClick={onBack}>
            <ArrowLeft size={14} />
            Back to Measure
          </button>
          <h2>Runtime logs</h2>
          <p className="nm-muted">
            Filter runtime records by Guardrail, time range, direction, and
            outcome. Open a record to inspect execution details and related
            checkpoints.
          </p>
        </div>
      </div>
      <MeasureCard title="Runtime records">
        <div className="nm-measure-report-filters">
          {[
            [
              "Guardrail",
              guardrail,
              ["All Guardrails", ...guards],
              setGuardrail,
            ],
            [
              "Time range",
              time,
              ["All time", "Last hour", "Last 24 hours"],
              setTime,
            ],
            [
              "Direction",
              direction,
              ["All directions", "Input", "Output"],
              setDirection,
            ],
            [
              "Outcome",
              outcome,
              ["All outcomes", "Blocked", "Transformed"],
              setOutcome,
            ],
          ].map(([label, value, options, update]) => (
            <label className="nm-select" key={label as string}>
              <span>{label as string}</span>
              <select
                aria-label={label as string}
                value={value as string}
                onChange={(event) => {
                  (update as (s: string) => void)(event.target.value);
                  setPage(1);
                }}
              >
                {(options as string[]).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {rows.length ? (
          <div className="nm-scroll">
            <table aria-label="Runtime records">
              <thead>
                <tr>
                  {[
                    "Time · UTC",
                    "Guardrail",
                    "Request",
                    "Direction",
                    "Outcome",
                    "Action",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice((page - 1) * 10, page * 10).map((event) => (
                  <tr key={event.id}>
                    <td>{utc(event.time)}</td>
                    <td>
                      {
                        policyHits.find((hit) => hit.id === event.policyId)
                          ?.guardrail
                      }
                    </td>
                    <td>{event.id}</td>
                    <td>Input</td>
                    <td>
                      <StatusBadge>{event.action}</StatusBadge>
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Open runtime record ${event.id}`}
                        onClick={() => setSelected(event)}
                      >
                        View record
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="nm-empty">
            <h3>No runtime logs for these filters</h3>
            <p>Try another time range or clear a filter.</p>
          </div>
        )}
        <Pager page={page} count={rows.length} size={10} onPage={setPage} />
        <p className="nm-muted nm-padding">
          Each row is one runtime record. Open a record to inspect it and browse
          other checkpoints from the same request.
        </p>
      </MeasureCard>
      {selected && (
        <MeasureSheet
          title="Runtime record"
          description={`${selected.id} · Input · ${selected.action}`}
          onClose={() => setSelected(null)}
        >
          <Evidence report={reportForEvent(selected, "Yann GUO")} />
          <div className="nm-runner-detail">
            <strong>Related checkpoints</strong>
            <p>
              Policy {selected.policyId} · {selected.action}
            </p>
            <p className="nm-muted">Original event snapshot · Read-only</p>
          </div>
        </MeasureSheet>
      )}
    </>
  );
}
