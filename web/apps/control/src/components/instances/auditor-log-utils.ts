import type { Agent, SandboxAuditEvent } from "@tasklattice/contracts";
import { getPlatformTimezone } from "@/lib/platform-preferences";

export const auditorLogLevels = ["info", "warning", "error", "debug"] as const;
export type AuditorLogLevel = (typeof auditorLogLevels)[number];
export type AuditorLogLevelFilter = "all" | AuditorLogLevel;
export type AuditorLogTimeRange = "15m" | "1h" | "24h" | "all";

export type AuditorLogEntry = {
  id: string;
  level: AuditorLogLevel;
  source: string;
  component?: string | null;
  message: string;
  timestamp: string;
};

export type AuditorLogFilters = {
  level?: AuditorLogLevelFilter;
  timeRange?: AuditorLogTimeRange;
  search?: string;
  source?: string | null;
  component?: string | null;
};

const ansiPattern = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const blockedDecisions = new Set<SandboxAuditEvent["decision"]>(["DENIED", "BLOCKED", "REJECTED"]);

function auditLevel(event: SandboxAuditEvent): AuditorLogLevel {
  if (blockedDecisions.has(event.decision) || event.severity === "HIGH" || event.severity === "CRIT") return "error";
  if (event.severity === "MED") return "warning";
  if (event.severity === "LOW") return "debug";
  return "info";
}

function provisioningLevel(message: string): AuditorLogLevel {
  if (/\b(error|failed|failure|denied|blocked|rejected)\b/i.test(message)) return "error";
  if (/\b(warn|warning|unavailable|retry|timeout)\b/i.test(message)) return "warning";
  if (/\b(debug|trace)\b/i.test(message)) return "debug";
  return "info";
}

function safeTime(value: string, fallback: number): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function adaptAgentToAuditorLogs(agent: Agent, auditEvents: SandboxAuditEvent[] = []): AuditorLogEntry[] {
  const now = Date.now();
  const createdAt = safeTime(agent.createdAt, now);
  const updatedAt = Math.max(createdAt, safeTime(agent.updatedAt, now));
  const provisioningSpan = Math.max(0, updatedAt - createdAt);
  const entries: AuditorLogEntry[] = [
    {
      id: "lifecycle-created",
      level: "info",
      source: "system",
      component: "Control plane",
      message: "Instance creation was accepted by the control plane.",
      timestamp: new Date(createdAt).toISOString(),
    },
    ...agent.logs.map((line, index) => {
      const clean = line.replace(ansiPattern, "");
      const offset = agent.logs.length > 1 ? provisioningSpan * (index / (agent.logs.length - 1)) : 0;
      return {
        id: `provisioning-${index}-${clean}`,
        level: provisioningLevel(clean),
        source: "runtime",
        component: "Sandbox",
        message: clean,
        timestamp: new Date(createdAt + offset).toISOString(),
      } satisfies AuditorLogEntry;
    }),
    ...auditEvents.map((event) => ({
      id: `audit-${event.id}`,
      level: auditLevel(event),
      source: event.source,
      component: event.source === "sandbox" ? "Sandbox" : event.source === "gateway" ? "Gateway" : "Control plane",
      message: `${event.summary} · ${event.category} · ${event.decision}`,
      timestamp: event.timestamp,
    }) satisfies AuditorLogEntry),
  ];

  if (agent.status === "READY") {
    entries.push({
      id: "lifecycle-ready",
      level: "info",
      source: "system",
      component: "Control plane",
      message: "Instance is ready.",
      timestamp: new Date(updatedAt).toISOString(),
    });
  }
  if (agent.status === "FAILED") {
    entries.push({
      id: "lifecycle-failed",
      level: "error",
      source: "system",
      component: "Control plane",
      message: agent.error ?? "Instance provisioning failed.",
      timestamp: new Date(updatedAt).toISOString(),
    });
  }

  return entries.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

export function filterAuditorLogs(entries: AuditorLogEntry[], filters: AuditorLogFilters, now = Date.now()): AuditorLogEntry[] {
  const search = filters.search?.trim().toLocaleLowerCase();
  const rangeMs = filters.timeRange === "15m" ? 15 * 60_000 : filters.timeRange === "1h" ? 60 * 60_000 : filters.timeRange === "24h" ? 24 * 60 * 60_000 : null;
  return entries.filter((entry) => {
    if (filters.level && filters.level !== "all" && entry.level !== filters.level) return false;
    if (filters.source && entry.source !== filters.source) return false;
    if (filters.component && entry.component !== filters.component) return false;
    if (rangeMs !== null && Date.parse(entry.timestamp) < now - rangeMs) return false;
    if (search && !`${entry.level} ${entry.source} ${entry.component ?? ""} ${entry.message}`.toLocaleLowerCase().includes(search)) return false;
    return true;
  });
}

export function formatAuditorLogTime(value: string, includeMilliseconds = true): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const formatted = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: getPlatformTimezone(),
  }).format(date);
  return includeMilliseconds ? `${formatted}.${String(date.getMilliseconds()).padStart(3, "0")}` : formatted;
}

export function serializeAuditorLogs(entries: AuditorLogEntry[]): string {
  return entries.map((entry) => `${entry.timestamp}  ${entry.level.toUpperCase().padEnd(7)} ${entry.source.padEnd(12)} ${entry.message}`).join("\n");
}
