import { useMemo, useState } from "react";
import type { PlatformAuditLogEvent } from "@tasklattice/contracts";
import { Link } from "@tanstack/react-router";
import {
  Braces,
  Check,
  CheckCircle2,
  CircleSlash2,
  Copy,
  ExternalLink,
  FileJson2,
  ShieldCheck,
  TriangleAlert,
  Waypoints,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPlatformDateTime } from "@/lib/platform-preferences";
import { auditActionLabel, titleCase } from "./audit-log-utils";

function OutcomeIcon({ outcome }: { outcome: PlatformAuditLogEvent["outcome"] }) {
  if (outcome === "success") return <CheckCircle2 className="size-4" />;
  if (outcome === "denied") return <CircleSlash2 className="size-4" />;
  return <TriangleAlert className="size-4" />;
}

function Fact({
  label,
  mono,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 break-words text-sm", mono && "font-mono text-xs")}>
        {value}
      </dd>
    </div>
  );
}

function JsonAttachment({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const serialized = useMemo(
    () => open ? JSON.stringify(value, null, 2) : undefined,
    [open, value],
  );
  const serializedBytes = useMemo(
    () => serialized
      ? new TextEncoder().encode(serialized).length
      : undefined,
    [serialized],
  );
  const copy = async () => {
    if (!serialized) return;
    await navigator.clipboard.writeText(serialized);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <details
      className="group border-b last:border-b-0"
      onToggle={(toggleEvent) => setOpen(toggleEvent.currentTarget.open)}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 text-sm font-medium hover:bg-muted/35 focus-visible:outline-2">
        <FileJson2 className="size-4 text-muted-foreground" />
        <span>{label}</span>
        <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
          {serializedBytes === undefined ? "JSON" : `${serializedBytes} B`}
        </span>
      </summary>
      {serialized ? <div className="border-t bg-muted/20">
        <div className="flex items-center justify-end border-b px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void copy()}
            aria-label={`Copy ${label} JSON`}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy JSON"}
          </Button>
        </div>
        <div className="max-h-80 overflow-auto p-4">
          <pre
            aria-label={`${label} JSON tree`}
            className="whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-foreground"
          >
            {serialized}
          </pre>
        </div>
      </div> : null}
    </details>
  );
}

function tempoTraceUrl(traceId: string): string | undefined {
  const template = import.meta.env.VITE_TEMPO_TRACE_URL_TEMPLATE?.trim();
  if (!template?.includes("{traceId}")) return undefined;
  try {
    const url = new URL(template.replaceAll("{traceId}", encodeURIComponent(traceId)));
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function AuditLogDetailPanel({
  event,
  id,
  onClose,
}: {
  event: PlatformAuditLogEvent;
  id: string;
  onClose: () => void;
}) {
  const externalTraceUrl = event.trace
    ? tempoTraceUrl(event.trace.traceId)
    : undefined;
  const titleId = `${id}-title`;
  const summaryId = `${id}-summary`;
  const requestId = `${id}-request`;
  const traceId = `${id}-trace`;
  const attachmentsId = `${id}-attachments`;
  const outcomeTone =
    event.outcome === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : event.outcome === "denied"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
        : "border-destructive/30 bg-destructive/10 text-destructive";

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="border-y bg-muted/10 text-sm text-foreground"
    >
      <header className="relative border-b px-5 py-4 pr-16">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Project audit event
        </div>
        <h3
          id={titleId}
          className="mt-2 font-heading text-lg font-medium text-foreground"
        >
          {event.actor.name} {event.verb} {event.object.name}
        </h3>
        <p className="font-mono text-xs text-muted-foreground">
          {event.id}
        </p>
        <button
          type="button"
          className="absolute right-3 top-3 grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2"
          aria-label="Close audit event details"
          onClick={onClose}
        >
          <X className="size-5" />
        </button>
      </header>

        <div>
          <section className="border-b p-5" aria-labelledby={summaryId}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={outcomeTone}>
                <OutcomeIcon outcome={event.outcome} />
                {titleCase(event.outcome)}
              </Badge>
              <Badge variant="outline">{auditActionLabel(event.action)}</Badge>
            </div>
            <h4 id={summaryId} className="sr-only">Event summary</h4>
            <p className="mt-4 text-sm leading-6">{event.summary}</p>
            <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <Fact label="Time" value={formatPlatformDateTime(event.occurredAt, { timeStyle: "medium" })} />
              <Fact label="Actor" value={`${event.actor.name}${event.actor.email ? ` · ${event.actor.email}` : ""}`} />
              <Fact label="Authorization" value={`${titleCase(event.authorization.decision)} · ${titleCase(event.authorization.role)}`} />
              <Fact label="Actor type" value={titleCase(event.actor.type)} />
              <Fact label="Action" value={event.action} mono />
              <Fact label="Object" value={`${event.object.type} · ${event.object.name}`} />
            </dl>
          </section>

          <section className="border-b p-5" aria-labelledby={requestId}>
            <h4 id={requestId} className="flex items-center gap-2 text-sm font-semibold">
              <Braces className="size-4 text-muted-foreground" />
              Request context
            </h4>
            <div className="mt-4 flex min-w-0 items-start gap-3 border bg-muted/20 px-3 py-3">
              <Badge variant="outline" className="font-mono">{event.request.method}</Badge>
              <code className="min-w-0 break-all text-xs leading-5">{event.request.route}</code>
            </div>
            <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <Fact label="Request ID" value={event.request.id} mono />
              <Fact label="IP address" value={event.request.ipAddress} mono />
              <Fact label="User agent" value={event.request.userAgent} />
              <Fact label="Object ID" value={event.object.id} mono />
            </dl>
          </section>

          {event.trace ? (
            <section className="border-b p-5" aria-labelledby={traceId}>
              <h4 id={traceId} className="flex items-center gap-2 text-sm font-semibold">
                <Waypoints className="size-4 text-muted-foreground" />
                Distributed trace
              </h4>
              <dl className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <Fact label="Trace ID" value={event.trace.traceId} mono />
                {event.trace.spanId ? <Fact label="Span ID" value={event.trace.spanId} mono /> : null}
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild type="button" variant="outline" size="sm">
                  <Link
                    to="/$projectId/traces"
                    params={{ projectId: event.projectId }}
                    search={{ traceId: event.trace.traceId }}
                  >
                    <Waypoints />
                    Open trace
                  </Link>
                </Button>
                {externalTraceUrl ? (
                  <Button asChild type="button" variant="ghost" size="sm">
                    <a href={externalTraceUrl} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      Open in Grafana
                    </a>
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}

          {event.request.parameters || event.request.body !== undefined || event.metadata ? (
            <section aria-labelledby={attachmentsId}>
              <div className="border-b px-5 py-4">
                <h4 id={attachmentsId} className="text-sm font-semibold">
                  Payload attachments
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Expand an attachment to inspect the retained JSON.
                </p>
              </div>
              <div>
                {event.request.parameters ? <JsonAttachment label="Parameters" value={event.request.parameters} /> : null}
                {event.request.body !== undefined ? <JsonAttachment label="Request body" value={event.request.body} /> : null}
                {event.metadata ? <JsonAttachment label="Event metadata" value={event.metadata} /> : null}
              </div>
            </section>
          ) : null}
        </div>

      <footer className="border-t p-5">
        <p className="text-xs leading-5 text-muted-foreground">
          Request metadata and redacted payloads are retained for review.
          Authorization headers, credentials, and secrets are excluded.
        </p>
      </footer>
    </section>
  );
}
