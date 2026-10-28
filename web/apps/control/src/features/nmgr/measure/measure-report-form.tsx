import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PolicyEvent } from "./measure-data";
import { reportForEvent } from "./measure-store";
import { Evidence, ReportSummary, ReviewBoundary } from "./measure-evidence";

export function ReportSubmission({
  event,
  actor,
  error,
  onCancel,
  onSubmit,
}: {
  event: PolicyEvent;
  actor: string;
  error: string;
  onCancel: () => void;
  onSubmit: (reason: string) => boolean;
}) {
  const [reason, setReason] = useState("");
  const preview = useRef(reportForEvent(event, actor)).current;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView?.({ block: "start" });
  }, []);
  return (
    <div className="nm-measure-report-draft">
      <div className="nm-measure-page-heading">
        <div>
          <button className="nm-link nm-measure-back" onClick={onCancel}>
            <ArrowLeft size={14} />
            Measure / False-positive reports / Review
          </button>
          <h2 ref={heading} tabIndex={-1}>
            Review false-positive report
          </h2>
        </div>
        <span className="nm-muted">Example data</span>
      </div>
      <ReportSummary report={preview} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim()) onSubmit(reason);
        }}
      >
        <div className="nm-measure-review-grid">
          <div>
            <Evidence report={preview} />
            <ReviewBoundary />
          </div>
          <section className="nm-card nm-measure-report-reason">
            <label htmlFor="nm-report-reason">Report Reason</label>
            <Textarea
              id="nm-report-reason"
              required
              maxLength={5000}
              rows={14}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why is this a false positive here."
            />
            {error && (
              <p className="nm-inline-notice nm-inline-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
        <footer className="nm-measure-submit">
          <p className="nm-muted">
            Submission records this event report for technical review.
          </p>
          <div className="nm-runner-actions">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!reason.trim()}>
              Submit
            </Button>
          </div>
        </footer>
      </form>
    </div>
  );
}
