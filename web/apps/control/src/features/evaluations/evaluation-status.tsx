import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CaseStatus, EvaluationStatus } from "./model";

const statusStyles: Record<EvaluationStatus | CaseStatus, string> = {
  DRAFT: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
  QUEUED: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200",
  RUNNING: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200",
  PASS: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  FAIL: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200",
  PENDING: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
  BLOCKED: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
};

export function EvaluationStatusBadge({
  status,
}: {
  status: EvaluationStatus | CaseStatus;
}) {
  return (
    <Badge variant="outline" className={cn("font-mono", statusStyles[status])}>
      {status}
    </Badge>
  );
}
