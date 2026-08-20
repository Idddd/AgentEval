import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DemoTechnicalResult } from "../model";

const plannedChecks = [
  ["configuration", "Configuration completeness", "Required technical fields and bindings are present."],
  ["dependencies", "Dependency resolution", "MCP, Skills, and Knowledge bindings resolve in session state."],
  ["schema", "Schema compatibility", "Demo inputs and outputs have compatible shapes."],
  ["endpoint", "Endpoint format", "The presentation-only endpoint has a valid URL shape."],
] as const;

export function TechnicalResult({
  result,
  running,
}: {
  result: DemoTechnicalResult | null;
  running: boolean;
}) {
  const checks = result?.checks ?? plannedChecks.map(([id, label, detail]) => ({ id, label, detail, status: "PENDING" as const }));
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {checks.map((check, index) => {
        const status = "status" in check ? check.status : "PENDING";
        const passed = status === "PASSED";
        const failed = status === "FAILED";
        const Icon = passed ? CheckCircle2 : failed ? XCircle : CircleDashed;
        return (
          <Card key={check.id} className={passed ? "border-emerald-200" : failed ? "border-destructive/30" : ""}>
            <CardHeader className="pb-2"><div className="flex items-center justify-between gap-3"><CardTitle className="text-sm">{check.label}</CardTitle><Icon className={`size-5 ${passed ? "text-emerald-600" : failed ? "text-destructive" : running ? "animate-spin text-primary motion-reduce:animate-none" : "text-muted-foreground"}`} /></div></CardHeader>
            <CardContent><p className="text-xs leading-5 text-muted-foreground">{check.detail}</p><span className="mt-3 block text-[11px] font-semibold uppercase tracking-wider">{running && !result ? `Check ${index + 1} queued` : passed ? `${check.label} passed` : failed ? `${check.label} failed` : "Waiting to run"}</span></CardContent>
          </Card>
        );
      })}
    </div>
  );
}
