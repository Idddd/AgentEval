import type { ModelRoutingStatus as ModelRoutingStatusValue } from "@tasklattice/contracts";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function GatewaySyncStatus({
  compact = false,
  message,
  status,
}: {
  compact?: boolean;
  message?: string;
  status: ModelRoutingStatusValue;
}) {
  const synchronized = status === "READY";
  const pending =
    status === "DRAFT" ||
    status === "VALIDATING" ||
    status === "SUSPENDED";
  const label =
    status === "READY"
      ? "Synchronized"
      : status === "VALIDATING"
        ? "Synchronizing"
        : status === "DRAFT"
          ? "Pending synchronization"
          : status === "SUSPENDED"
            ? "Synchronization paused"
            : status === "NON_COMPLIANT"
              ? "Gateway policy mismatch"
              : status === "UNSUPPORTED"
                ? "Gateway sync unsupported"
                : "Gateway sync failed";
  const Icon = synchronized
    ? CheckCircle2
    : pending
      ? RefreshCw
      : CircleAlert;
  const description = message && !synchronized
    ? `${label}: ${message}`
    : label;

  return (
    <span
      aria-label={description}
      title={description}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        synchronized
          ? "text-emerald-700"
          : pending
            ? "text-amber-700"
            : "text-destructive",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          status === "VALIDATING" && "animate-spin",
        )}
      />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
