import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function EvaluationLayerStatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const positive = ["PASS", "READY", "COMPLETED", "SUCCESS", "PUBLISHED"].includes(normalized);
  const negative = ["FAIL", "FAILED", "ERROR", "FAILURE"].includes(normalized);
  const active = ["RUNNING", "QUEUED", "OPEN", "DRAFT", "PARTIAL"].includes(normalized);
  return (
    <Badge
      variant="outline"
      className={cn(
        positive && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        negative && "border-destructive/30 bg-destructive/10 text-destructive",
        active && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    >
      {status.replaceAll("_", " ")}
    </Badge>
  );
}
