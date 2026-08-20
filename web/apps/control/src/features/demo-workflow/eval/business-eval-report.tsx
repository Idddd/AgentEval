import { CheckCircle2, CircleDollarSign, Gauge, ListChecks, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { DemoBusinessEvaluation } from "../model";

export function BusinessEvalReport({ evaluation }: { evaluation: DemoBusinessEvaluation }) {
  if (evaluation.outcome === "RUNNING") {
    return (
      <Card className="border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/20">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div><strong>Evaluation in progress</strong><p className="mt-1 text-sm text-muted-foreground">Running business scenarios and pinned safety coverage.</p></div>
            <span className="text-sm font-semibold tabular-nums">65%</span>
          </div>
          <Progress className="mt-4" value={65} />
        </CardContent>
      </Card>
    );
  }

  const passed = evaluation.outcome === "PASSED";
  return (
    <Card className={passed ? "border-emerald-200 dark:border-emerald-900" : "border-destructive/30"}>
      <CardHeader className="border-b">
        <div className="flex items-center gap-3">
          <span className={`grid size-10 place-items-center rounded-full ${passed ? "bg-emerald-100 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>
            {passed ? <CheckCircle2 /> : <ShieldCheck />}
          </span>
          <div><CardTitle>{passed ? "Business Eval passed" : "Business Eval needs attention"}</CardTitle><p className="mt-1 text-sm text-muted-foreground">Decision-ready evidence for the exact Release Candidate.</p></div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Gauge} label="Scenario success" value={`${evaluation.scenarioSuccess ?? 0}%`} />
        <Metric icon={ListChecks} label="Coverage" value={`${evaluation.scenariosCovered} scenarios`} />
        <Metric icon={ShieldCheck} label="Risk" value={`${evaluation.residualRisk ?? "Pending"} residual risk`} />
        <Metric icon={CircleDollarSign} label="Demo cost" value={`$${evaluation.estimatedCost.toFixed(2)} estimated cost`} />
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/20 p-4"><Icon className="size-5 text-primary" /><span className="mt-3 block text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-sm">{value}</strong></div>;
}
