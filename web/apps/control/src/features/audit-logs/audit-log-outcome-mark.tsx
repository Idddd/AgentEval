import type { PlatformAuditLogEvent } from "@tasklattice/contracts";
import { cn } from "@/lib/utils";

export function AuditLogOutcomeMark({
  outcome,
}: {
  outcome: PlatformAuditLogEvent["outcome"];
}) {
  const tone =
    outcome === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : outcome === "denied"
        ? "text-amber-800 dark:text-amber-300"
        : "text-destructive";
  const dot =
    outcome === "success"
      ? "bg-emerald-500"
      : outcome === "denied"
        ? "bg-amber-500"
        : "bg-destructive";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em]",
        tone,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      {outcome}
    </span>
  );
}
