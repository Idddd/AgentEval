import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const positive = new Set(["READY", "ACTIVE", "PASSED", "HEALTHY", "ALLOW", "ONLINE", "VERIFIED", "SUCCESS", "PROTECTED"]);
const warning = new Set(["NEEDS_TESTING", "DEGRADED", "TRANSFORM", "REDACT", "WAITING", "PAUSED", "UNAVAILABLE"]);
const negative = new Set(["FAILED", "BLOCK", "ERROR"]);

export function GovernanceStatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  return (
    <Badge
      variant={negative.has(normalized) ? "destructive" : "outline"}
      className={cn(
        "gap-1.5 capitalize",
        positive.has(normalized) && "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
        warning.has(normalized) && "border-amber-500/25 bg-amber-500/10 text-amber-800",
        normalized === "DISABLED" && "bg-muted text-muted-foreground",
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {status.replaceAll("_", " ").toLowerCase()}
    </Badge>
  );
}
