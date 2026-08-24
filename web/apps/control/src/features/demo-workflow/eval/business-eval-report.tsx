import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { DemoBusinessEvaluation } from "../model";
import { buildBusinessEvalCaseResults } from "./business-eval-case-results";

export function BusinessEvalReport({ evaluation, submissionJustification, datasetName, besideDecision = false, fullReportHref, detailed = false }: { evaluation: DemoBusinessEvaluation; submissionJustification?: string | null; datasetName?: string | undefined; besideDecision?: boolean; fullReportHref?: string; detailed?: boolean }) {
  if (evaluation.outcome === "RUNNING") {
    return (
      <section className={`${besideDecision ? "border-t lg:border-l lg:border-t-0" : "border-t"} border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/20`}>
          <div className="flex items-center justify-between gap-4">
            <div><strong>Evaluation in progress</strong><p className="mt-1 text-sm text-muted-foreground">Running business scenarios and pinned safety coverage.</p></div>
            <span className="text-sm font-semibold tabular-nums">65%</span>
          </div>
          <Progress className="mt-4" value={65} />
      </section>
    );
  }

  const passed = evaluation.outcome === "PASSED";
  return (
    <section className={besideDecision ? "border-t lg:border-l lg:border-t-0" : "border-t"}>
      <div className={`border-b px-4 py-3 ${passed ? "bg-emerald-50/50 dark:bg-emerald-950/20" : "bg-destructive/5"}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
          <span className={`grid size-8 place-items-center rounded-full ${passed ? "bg-emerald-100 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>
            {passed ? <CheckCircle2 /> : <ShieldCheck />}
          </span>
            <div><strong>Evaluation report</strong><p className="text-xs text-muted-foreground">{passed ? "Passed" : "Needs attention"}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <strong className={passed ? "text-emerald-700" : "text-destructive"}>{evaluation.outcome}</strong>
            {fullReportHref ? <Button asChild size="sm" variant="outline"><a href={fullReportHref}>View full report<ArrowRight /></a></Button> : null}
          </div>
        </div>
      </div>
      <div>
        <dl className="divide-y">
          {submissionJustification ? <ReportRow label="Submission justification" value={submissionJustification} /> : null}
          <ReportRow label="Test result" value={`${evaluation.scenarioSuccess ?? 0}% pass rate · ${evaluation.scenariosCovered} evaluated`} />
          <ReportRow label="Required pass rate" value={`${evaluation.successThreshold}%`} />
          <ReportRow label="Business dataset" value={datasetName ?? evaluation.datasetId} />
          <ReportRow label="Safety checks" value={evaluation.guardrailTemplates.map((template) => `${template.name} · R${template.version}`).join(", ") || "None recorded"} />
          {evaluation.guardrailTemplates.some((template) => template.sourcePolicies?.length) ? (
            <ReportRow
              label="Pinned Policies"
              value={evaluation.guardrailTemplates.flatMap((template) => template.sourcePolicies ?? []).map((policy) => `${policy.name} · v${policy.version}`).join(", ")}
            />
          ) : null}
          {evaluation.guardrailTemplates.some((template) => template.runtimePosture) ? (
            <ReportRow
              label="Runtime posture"
              value={evaluation.guardrailTemplates.map((template) => template.runtimePosture ? `${template.runtimePosture.safetyLevel.replaceAll("_", " ")} · ${template.runtimePosture.outputDelivery.replaceAll("_", " ")}` : null).filter(Boolean).join(", ")}
            />
          ) : null}
          <ReportRow label="Residual risk" value={evaluation.residualRisk ?? "Pending"} />
          <ReportRow label="Actual cost" value={`$${evaluation.estimatedCost.toFixed(2)}`} />
          {evaluation.completedAt ? <ReportRow label="Completed" value={new Date(evaluation.completedAt).toLocaleString()} /> : null}
          <ReportRow label="Recommendation" value={evaluation.approvalReason} />
        </dl>
      </div>
      {detailed ? <TestCaseResults evaluation={evaluation} /> : null}
    </section>
  );
}

function ReportRow({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-medium">{value}</dd></div>;
}

function TestCaseResults({ evaluation }: { evaluation: DemoBusinessEvaluation }) {
  const results = evaluation.caseResults?.length
    ? evaluation.caseResults
    : buildBusinessEvalCaseResults(evaluation.outcome === "FAILED" ? "FAILED" : "PASSED");
  const passed = results.filter((result) => result.status === "PASS").length;
  const failed = results.length - passed;

  return (
    <section className="border-t" aria-labelledby="business-eval-test-results">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 id="business-eval-test-results" className="font-heading text-lg font-semibold">Test case results</h2>
          <p className="text-sm text-muted-foreground">Inputs, expected behavior, and the evidence recorded by this Eval.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline" className="border-emerald-300 text-emerald-700">{passed} passed</Badge>
          {failed ? <Badge variant="destructive">{failed} failed</Badge> : null}
          <Badge variant="secondary">{results.length} total</Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="w-56 px-4 py-3 font-medium">Test case</th>
              <th className="px-4 py-3 font-medium">Input</th>
              <th className="px-4 py-3 font-medium">Expected</th>
              <th className="px-4 py-3 font-medium">Actual result</th>
              <th className="w-24 px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {results.map((result) => (
              <tr key={result.id} className={result.status === "FAIL" ? "bg-destructive/5" : undefined}>
                <td className="px-4 py-3 align-top">
                  <strong className="block">{result.name}</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">{result.category}</span>
                </td>
                <td className="px-4 py-3 align-top text-muted-foreground">{result.input}</td>
                <td className="px-4 py-3 align-top">{result.expected}</td>
                <td className={result.status === "FAIL" ? "px-4 py-3 align-top font-medium text-destructive" : "px-4 py-3 align-top"}>{result.actual}</td>
                <td className="px-4 py-3 align-top">
                  <Badge variant={result.status === "FAIL" ? "destructive" : "outline"} className={result.status === "PASS" ? "border-emerald-300 text-emerald-700" : undefined}>{result.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
