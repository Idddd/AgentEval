import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  agents,
  historicalRule,
  policyDefinition,
  reviewBoundary,
  type Report,
} from "./measure-data";
import { MeasureCard, MeasureSheet, StatusBadge, utc } from "./measure-shared";

export function ReviewBoundary() {
  return (
    <aside className="nm-measure-boundary">
      <strong>This review applies to this event only.</strong>
      <p>{reviewBoundary}</p>
    </aside>
  );
}
export function ReportSummary({ report }: { report: Report }) {
  const agent = agents.find((agent) => agent.id === report.agentId);
  return (
    <MeasureCard
      title="Report summary"
      aside={<StatusBadge>{report.status}</StatusBadge>}
    >
      <div className="nm-measure-summary">
        <strong>{report.id}</strong>
        <dl className="nm-measure-summary-fields">
          {[
            ["Reported at · UTC", utc(report.reportedAt)],
            [
              "Agent Custodian / BU",
              `${agent?.poc ?? "—"} · ${agent?.bu ?? "—"}`,
            ],
            [
              "Reporter / Control Unit",
              `${report.reporter} / ${report.controlUnit ?? "ISS"}`,
            ],
            [
              "Request / enforcement event",
              `${report.evidence.requestId} / ${report.evidence.eventId}`,
            ],
            ["Enforcement action · unchanged", report.action],
            ["Event time · UTC", utc(report.evidence.time)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {report.reportReason && (
        <section className="nm-measure-report-reason-saved">
          <h4>Report Reason</h4>
          <p>{report.reportReason}</p>
        </section>
      )}
    </MeasureCard>
  );
}
export function Evidence({
  report,
  completed = false,
}: {
  report: Report;
  completed?: boolean;
}) {
  return (
    <MeasureCard
      title={
        completed
          ? "Request & response · preserved"
          : "Request & response evidence"
      }
    >
      <div className="nm-measure-evidence">
        <p className="nm-muted">
          Personal data masked · Original event snapshot · All times UTC
        </p>
        <div className="nm-measure-transcript">
          <strong>
            REQUEST ·{" "}
            {new Date(report.evidence.time).toISOString().slice(11, 19)}
          </strong>
          <p>{report.evidence.request}</p>
        </div>
        <div className="nm-measure-transcript">
          <strong>
            GATEWAY RESPONSE ·{" "}
            {new Date(new Date(report.evidence.time).getTime() + 1000)
              .toISOString()
              .slice(11, 19)}
          </strong>
          <p>
            {completed
              ? report.evidence.completedResponse
              : report.evidence.response}
          </p>
          <small>
            Agent generation was not invoked. No customer data was returned.
          </small>
        </div>
        {completed && report.id === "FPR-2026-00418" && (
          <p>
            <strong>Why it triggered: </strong>“passport number” matched
            IDENTITY-07 in the input. The broad lexical rule does not
            distinguish a process question from a request to reveal an
            identifier.
          </p>
        )}
      </div>
    </MeasureCard>
  );
}
export function HistoricalDefinitions({ report }: { report: Report }) {
  const [definition, setDefinition] = useState<"Policy" | "Guardrail" | null>(
    null,
  );
  const agent = agents.find((a) => a.id === report.agentId)!;
  const identity = report.id === "FPR-2026-00418";
  return (
    <>
      <MeasureCard title="Historical definitions · unchanged">
        <div className="nm-measure-definitions">
          <p className="nm-muted">
            Versions captured at enforcement time · Read-only
          </p>
          <div>
            <strong>
              {agent.name} · v{agent.version}
            </strong>
            <p>
              BU: {agent.bu} · PoC: {agent.poc} · {agent.description}
            </p>
          </div>
          <div>
            <div className="nm-measure-definition-heading">
              <strong>
                {report.policy} · v{report.evidence.policyVersion}
              </strong>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDefinition("Policy")}
              >
                View definition
              </Button>
            </div>
            <p>{identity ? policyDefinition : report.policyDescription}</p>
          </div>
          <div>
            <div className="nm-measure-definition-heading">
              <strong>
                {report.guardrail} · v{report.evidence.guardrailVersion}
              </strong>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDefinition("Guardrail")}
              >
                View definition
              </Button>
            </div>
            <p>
              {identity
                ? "Input rule IDENTITY-07 · Keyword match, case-insensitive. Transfer identity-related requests to manual verification."
                : report.guardDescription}
            </p>
          </div>
          {identity && (
            <div className="nm-measure-transcript">
              <strong>
                Historical rule excerpt · v3.2, deployed 15 Oct 2026
              </strong>
              <p>{historicalRule}</p>
            </div>
          )}
        </div>
      </MeasureCard>
      {definition && (
        <MeasureSheet
          title={`${definition === "Policy" ? report.policy : report.guardrail} · v${definition === "Policy" ? report.evidence.policyVersion : report.evidence.guardrailVersion}`}
          description="Historical definition · Read-only"
          onClose={() => setDefinition(null)}
          width={620}
        >
          <p>
            {definition === "Policy"
              ? identity
                ? policyDefinition
                : report.policyDescription
              : report.evidence.rule}
          </p>
        </MeasureSheet>
      )}
    </>
  );
}
export function ReportTimeline({ report }: { report: Report }) {
  const sample = report.id === "FPR-2026-00418";
  const entries = [
    [
      report.evidence.time,
      "Enforcement event recorded",
      sample
        ? "Guardrail XXXX v3.2 matched “passport number”. Request transformed; agent generation not invoked."
        : `${report.guardrail} · ${report.action}. Original enforcement retained.`,
    ],
    [
      report.reportedAt,
      `Report submitted · ${report.reporter}`,
      `${report.id} linked to ${report.evidence.requestId} / ${report.evidence.eventId}.`,
    ],
    ...(sample
      ? [
          [
            "2026-10-22T09:19:00Z",
            "Assigned to TEC review queue",
            "Report status set to Pending review. Original policy and guardrail versions retained.",
          ],
          [
            "2026-10-22T09:24:00Z",
            "Manual transfer resolved · Maya CHEN",
            "Case MVR-2073: approved in-app verification guidance returned. No identity document collected.",
          ],
        ]
      : []),
    ...(report.review
      ? [
          [
            report.review.time,
            `Review completed · ${report.review.reviewer}`,
            `${report.review.decision}. Decision and reason saved to the audit log; no production change.`,
          ],
        ]
      : []),
  ];
  return (
    <MeasureCard title="Audit timeline · UTC">
      <ol className="nm-measure-timeline">
        {entries.map(([time, title, description], i) => (
          <li key={`${time}-${i}`}>
            <time>{utc(time!)} UTC</time>
            <strong>{title}</strong>
            <p>{description}</p>
          </li>
        ))}
      </ol>
    </MeasureCard>
  );
}
