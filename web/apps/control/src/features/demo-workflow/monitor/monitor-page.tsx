import { Radio } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { EvaluationOverviewPage } from "@/features/evaluation-layer/overview/overview-page";

export function MonitorPage() {
  return (
    <div className="space-y-7">
      <PageHeader
        title="Production Monitor"
        description="Inspect live Agent traffic, evaluator outcomes, sampling policy, latency, and cost from one operational view."
        badge={(
          <Badge
            variant="outline"
            className="gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <Radio className="size-3" />
            Live
          </Badge>
        )}
      />
      <EvaluationOverviewPage />
    </div>
  );
}
