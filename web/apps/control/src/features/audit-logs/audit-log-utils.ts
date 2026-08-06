import type {
  PlatformAuditLogQuery,
  PlatformAuditOutcome,
} from "@tasklattice/contracts";

export type AuditTimeRange = "24h" | "7d" | "30d" | "all";

export interface AuditLogFilters {
  query: string;
  timeRange: AuditTimeRange;
  actorId: string;
  action: string;
  objectType: string;
  outcome: "all" | PlatformAuditOutcome;
}

export const defaultAuditLogFilters: AuditLogFilters = {
  query: "",
  timeRange: "7d",
  actorId: "all",
  action: "all",
  objectType: "all",
  outcome: "all",
};

const timeRangeMilliseconds: Record<Exclude<AuditTimeRange, "all">, number> = {
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

export function auditFiltersToQuery(
  filters: AuditLogFilters,
  now = Date.now(),
): PlatformAuditLogQuery {
  const query = filters.query.trim();
  return {
    ...(query ? { query } : {}),
    ...(filters.timeRange === "all"
      ? {}
      : {
          from: new Date(
            now - timeRangeMilliseconds[filters.timeRange],
          ).toISOString(),
        }),
    ...(filters.actorId === "all" ? {} : { actorId: filters.actorId }),
    ...(filters.action === "all" ? {} : { action: filters.action }),
    ...(filters.objectType === "all"
      ? {}
      : { objectType: filters.objectType }),
    ...(filters.outcome === "all" ? {} : { outcome: filters.outcome }),
  };
}

export function countAdvancedAuditFilters(filters: AuditLogFilters): number {
  return [
    filters.actorId,
    filters.action,
    filters.objectType,
    filters.outcome,
  ].filter((value) => value !== "all").length;
}

export function auditActionLabel(action: string): string {
  return action
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .join(" · ");
}

export function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
