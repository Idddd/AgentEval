import type { EvaluationLayerGuardrailTemplate } from "@/features/evaluation-layer/model";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DemoDataset } from "../model";

export interface BusinessEvalDraft {
  businessPurpose: string;
  targetUsers: string;
  criticality: string;
  dataSensitivity: string;
  successThreshold: number;
  datasetId: string;
  selectedTemplateIds: string[];
  approvalReason: string;
}

export function BusinessEvalForm({
  value,
  onChange,
  datasets,
  templates,
  disabled,
}: {
  value: BusinessEvalDraft;
  onChange: (next: BusinessEvalDraft) => void;
  datasets: DemoDataset[];
  templates: EvaluationLayerGuardrailTemplate[];
  disabled: boolean;
}) {
  const patch = (next: Partial<BusinessEvalDraft>) => onChange({ ...value, ...next });
  const toggleTemplate = (template: EvaluationLayerGuardrailTemplate) => {
    if (template.required) return;
    patch({
      selectedTemplateIds: value.selectedTemplateIds.includes(template.id)
        ? value.selectedTemplateIds.filter((id) => id !== template.id)
        : [...value.selectedTemplateIds, template.id],
    });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Business context</CardTitle>
          <p className="text-sm text-muted-foreground">
            Describe the outcome, audience, and review posture in business terms.
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 p-5">
          <Field label="Business purpose">
            <Textarea
              aria-label="Business purpose"
              rows={4}
              disabled={disabled}
              value={value.businessPurpose}
              onChange={(event) => patch({ businessPurpose: event.target.value })}
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Target users">
              <Input
                aria-label="Target users"
                disabled={disabled}
                value={value.targetUsers}
                onChange={(event) => patch({ targetUsers: event.target.value })}
              />
            </Field>
            <Field label="Business criticality">
              <Select disabled={disabled} value={value.criticality} onValueChange={(criticality) => patch({ criticality })}>
                <SelectTrigger aria-label="Business criticality"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data sensitivity">
              <Select disabled={disabled} value={value.dataSensitivity} onValueChange={(dataSensitivity) => patch({ dataSensitivity })}>
                <SelectTrigger aria-label="Data sensitivity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Public data">Public data</SelectItem>
                  <SelectItem value="Internal business data">Internal business data</SelectItem>
                  <SelectItem value="Confidential customer data">Confidential customer data</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Success threshold">
              <div className="relative">
                <Input
                  aria-label="Success threshold"
                  className="pr-9"
                  type="number"
                  min={1}
                  max={100}
                  disabled={disabled}
                  value={value.successThreshold}
                  onChange={(event) => patch({ successThreshold: Number(event.target.value) })}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Business scenarios & safety coverage</CardTitle>
          <p className="text-sm text-muted-foreground">
            Combine the business dataset with immutable Guardrail Eval Template revisions.
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 p-5">
          <Field label="Business dataset">
            <Select disabled={disabled} value={value.datasetId} onValueChange={(datasetId) => patch({ datasetId })}>
              <SelectTrigger aria-label="Business dataset"><SelectValue /></SelectTrigger>
              <SelectContent>
                {datasets.map((dataset) => (
                  <SelectItem key={dataset.id} value={dataset.id}>
                    {dataset.name} · {dataset.scenarioCount} scenarios
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">Guardrail Eval Templates</h3>
                <p className="mt-1 text-xs text-muted-foreground">Pinned revisions keep this approval reproducible.</p>
              </div>
              <Badge variant="outline">{value.selectedTemplateIds.length} selected</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {templates.map((template) => {
                const selected = value.selectedTemplateIds.includes(template.id);
                return (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled || template.required}
                    onClick={() => toggleTemplate(template)}
                    className={`rounded-lg border p-4 text-left transition-colors ${selected ? "border-primary bg-primary/5" : "hover:bg-muted/40"} disabled:cursor-default disabled:opacity-100`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <strong className="text-sm">{template.name} · R{template.version}</strong>
                      {template.required ? <Badge>Required</Badge> : selected ? <Badge variant="outline">Included</Badge> : null}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-muted-foreground">{template.description}</span>
                    <span className="mt-3 block text-xs font-medium">{template.cases.length} safety scenarios</span>
                  </button>
                );
              })}
            </div>
          </div>
          <Field label="Evaluation recommendation">
            <Textarea
              aria-label="Evaluation recommendation"
              rows={3}
              disabled={disabled}
              value={value.approvalReason}
              onChange={(event) => patch({ approvalReason: event.target.value })}
            />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium">{label}{children}</label>;
}
