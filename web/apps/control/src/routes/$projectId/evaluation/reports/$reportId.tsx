import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { buildBusinessEvalCaseResults } from "@/features/demo-workflow/eval/business-eval-case-results";
import { BusinessEvalReport } from "@/features/demo-workflow/eval/business-eval-report";
import type { DemoBusinessEvaluation } from "@/features/demo-workflow/model";
import { useDemoWorkflowState } from "@/features/demo-workflow/provider";
import { EvaluationReportDetail } from "@/features/evaluation-layer/reports/report-page";
import { EvaluationLayerPageFrame } from "@/features/evaluation-layer/shared/evaluation-page-frame";

export const Route = createFileRoute("/$projectId/evaluation/reports/$reportId")({ component: ReportDetailRoute });
function ReportDetailRoute() {
  const { projectId, reportId } = Route.useParams();
  const workflowState = useDemoWorkflowState();
  const revision = workflowState.agentRevisions.find((item) => item.id === reportId);
  const agent = revision ? workflowState.agents.find((item) => item.id === revision.agentId) : undefined;
  const generated = Boolean(revision && !revision.businessEvaluation);
  const evaluation = revision?.businessEvaluation ?? (revision ? generatedDemoReport(revision.updatedAt, agent?.businessOutcome, agent?.targetUsers, workflowState.datasets[0]?.id) : undefined);

  if (revision && evaluation) {
    const dataset = workflowState.datasets.find((item) => item.id === evaluation.datasetId);
    return (
      <EvaluationLayerPageFrame
        title={`Report · ${agent?.name ?? reportId}`}
        description={generated ? `Generated demo report · R${revision.revision} · Sample evaluation evidence` : `Business Eval · R${revision.revision} · ${revision.status === "PENDING_APPROVAL" ? "Pending approval" : revision.status.replaceAll("_", " ").toLowerCase()}`}
        action={<Button asChild variant="outline"><a href={`/${projectId}/evaluation/catalog`}><ArrowLeft />Back to Eval</a></Button>}
      >
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><CardTitle>{agent?.name ?? reportId} · R{revision.revision}</CardTitle><p className="mt-1 text-sm text-muted-foreground">Owner · {agent?.owner ?? "Unassigned"}</p></div>
              {!generated ? <Badge variant="outline">Immutable report</Badge> : null}
            </div>
          </CardHeader>
          <BusinessEvalReport detailed evaluation={evaluation} datasetName={dataset?.name} {...(revision.submissionJustification !== undefined ? { submissionJustification: revision.submissionJustification } : {})} />
        </Card>
      </EvaluationLayerPageFrame>
    );
  }

  return <EvaluationLayerPageFrame title="Report detail" description="Review results, evidence, comparison, cost, and Reflection in AgentEval order."><EvaluationReportDetail reportId={reportId} /></EvaluationLayerPageFrame>;
}

function generatedDemoReport(
  completedAt: string,
  businessPurpose?: string,
  targetUsers?: string,
  datasetId?: string,
): DemoBusinessEvaluation {
  return {
    businessPurpose: businessPurpose?.trim() || "Not provided",
    targetUsers: targetUsers?.trim() || "Not provided",
    criticality: "Not provided",
    dataSensitivity: "Not provided",
    successThreshold: 85,
    datasetId: datasetId ?? "demo-dataset",
    guardrailTemplates: [{
      id: "guardrail-template:universal-safety:R1",
      sourceGuardrailId: "universal-safety",
      sourceGuardrailRevisionId: "universal-safety:R1",
      version: "1",
      name: "Universal Safety Baseline",
    }],
    approvalReason: "Generated demo evidence supports a controlled business rollout.",
    outcome: "PASSED",
    scenarioSuccess: 92,
    scenariosCovered: 8,
    residualRisk: "Low",
    estimatedCost: 0.04,
    completedAt,
    caseResults: buildBusinessEvalCaseResults("PASSED"),
  };
}
