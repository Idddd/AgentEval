import type {
  PlatformAuditLogEvent,
  PlatformAuditLogQuery,
} from "@tasklattice/contracts";
import { z } from "zod";

const querySchema = z.object({
  query: z.string().trim().max(200).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  actorId: z.string().trim().max(200).optional(),
  action: z.string().trim().max(200).optional(),
  objectType: z.string().trim().max(200).optional(),
  outcome: z.enum(["success", "failed", "denied"]).optional(),
  cursor: z.string().trim().max(1_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
});

function optionalParameter(parameters: URLSearchParams, name: string): string | undefined {
  const value = parameters.get(name)?.trim();
  return value ? value : undefined;
}

export function parseAuditLogQuery(request: Request): PlatformAuditLogQuery {
  const parameters = new URL(request.url).searchParams;
  const parsed = querySchema.parse({
    query: optionalParameter(parameters, "query"),
    from: optionalParameter(parameters, "from"),
    to: optionalParameter(parameters, "to"),
    actorId: optionalParameter(parameters, "actorId"),
    action: optionalParameter(parameters, "action"),
    objectType: optionalParameter(parameters, "objectType"),
    outcome: optionalParameter(parameters, "outcome"),
    cursor: optionalParameter(parameters, "cursor"),
    limit: optionalParameter(parameters, "limit"),
    direction: optionalParameter(parameters, "direction"),
  });
  return {
    ...(parsed.query ? { query: parsed.query } : {}),
    ...(parsed.from ? { from: parsed.from } : {}),
    ...(parsed.to ? { to: parsed.to } : {}),
    ...(parsed.actorId ? { actorId: parsed.actorId } : {}),
    ...(parsed.action ? { action: parsed.action } : {}),
    ...(parsed.objectType ? { objectType: parsed.objectType } : {}),
    ...(parsed.outcome ? { outcome: parsed.outcome } : {}),
    ...(parsed.cursor ? { cursor: parsed.cursor } : {}),
    ...(parsed.limit ? { limit: parsed.limit } : {}),
    ...(parsed.direction ? { direction: parsed.direction } : {}),
  };
}

const csvColumns = [
  ["Time", (event: PlatformAuditLogEvent) => event.occurredAt],
  ["Actor", (event: PlatformAuditLogEvent) => event.actor.name],
  ["Actor email", (event: PlatformAuditLogEvent) => event.actor.email],
  ["Actor type", (event: PlatformAuditLogEvent) => event.actor.type],
  ["Authorization role", (event: PlatformAuditLogEvent) => event.authorization.role],
  ["Authorization decision", (event: PlatformAuditLogEvent) => event.authorization.decision],
  ["Action", (event: PlatformAuditLogEvent) => event.action],
  ["Verb", (event: PlatformAuditLogEvent) => event.verb],
  ["Object type", (event: PlatformAuditLogEvent) => event.object.type],
  ["Object ID", (event: PlatformAuditLogEvent) => event.object.id],
  ["Object name", (event: PlatformAuditLogEvent) => event.object.name],
  ["Outcome", (event: PlatformAuditLogEvent) => event.outcome],
  ["Summary", (event: PlatformAuditLogEvent) => event.summary],
  ["Request ID", (event: PlatformAuditLogEvent) => event.request.id],
  ["Method", (event: PlatformAuditLogEvent) => event.request.method],
  ["Route", (event: PlatformAuditLogEvent) => event.request.route],
  ["IP address", (event: PlatformAuditLogEvent) => event.request.ipAddress],
  ["Trace ID", (event: PlatformAuditLogEvent) => event.trace?.traceId],
  ["Span ID", (event: PlatformAuditLogEvent) => event.trace?.spanId],
] as const;

function escapeCsvCell(value: unknown): string {
  const stringValue = value == null ? "" : String(value);
  const spreadsheetSafe = /^[=+\-@\t\r]/.test(stringValue)
    ? `'${stringValue}`
    : stringValue;
  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
}

export function createAuditLogCsv(events: readonly PlatformAuditLogEvent[]): string {
  const header = csvColumns.map(([label]) => escapeCsvCell(label)).join(",");
  const rows = events.map((event) =>
    csvColumns.map(([, value]) => escapeCsvCell(value(event))).join(","),
  );
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}
