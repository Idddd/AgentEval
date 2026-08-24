import type { EvaluationLayerGuardrailTemplate } from "@/features/evaluation-layer/model";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DemoDataset } from "../model";

export interface BusinessEvalDraft {
  datasetId: string;
  selectedTemplateIds: string[];
}

export function BusinessEvalForm({
  value,
  datasets,
  templates,
}: {
  value: BusinessEvalDraft;
  datasets: DemoDataset[];
  templates: EvaluationLayerGuardrailTemplate[];
}) {
  const selectedDataset = datasets.find((dataset) => dataset.id === value.datasetId);
  const selectedTemplates = templates.filter((template) =>
    value.selectedTemplateIds.includes(template.id),
  );

  return (
    <div>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Evaluation coverage</CardTitle>
          <p className="text-sm text-muted-foreground">
            Review the Dataset and required safety checks selected for this submitted Agent revision.
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 p-5">
          <div>
            <h3 className="text-sm font-medium">Business dataset</h3>
            <div className="rounded-lg border bg-muted/20 px-4 py-3">
              <p className="font-medium">{selectedDataset?.name ?? "No dataset selected"}</p>
              {selectedDataset ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedDataset.scenarioCount} business scenarios
                </p>
              ) : null}
            </div>
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">Guardrail Eval Templates</h3>
                <p className="mt-1 text-xs text-muted-foreground">Pinned revisions keep this approval reproducible.</p>
              </div>
              <Badge variant="outline">{selectedTemplates.length} included</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {selectedTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="rounded-lg border border-primary bg-primary/5 p-4"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <strong className="text-sm">{template.name} · R{template.version}</strong>
                      {template.required ? <Badge>Required</Badge> : <Badge variant="outline">Included</Badge>}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-muted-foreground">{template.description}</span>
                    <span className="mt-3 block text-xs font-medium">{template.cases.length} safety scenarios</span>
                    {template.sourcePolicies?.length ? (
                      <div className="mt-3 border-t pt-3">
                        <p className="text-xs font-medium">
                          {template.sourcePolicies.length} pinned Policies · {template.sourcePolicies.reduce((total, policy) => total + policy.testCaseCount, 0)} Policy tests
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {template.sourcePolicies.map((policy) => (
                            <Badge key={`${policy.id}:${policy.version}`} variant="secondary" className="font-normal">
                              {policy.name} · v{policy.version}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {template.runtimePosture ? (
                      <span className="mt-3 block text-xs text-muted-foreground">
                        {template.runtimePosture.safetyLevel.replaceAll("_", " ")} · {template.runtimePosture.outputDelivery.replaceAll("_", " ")}
                      </span>
                    ) : null}
                  </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
