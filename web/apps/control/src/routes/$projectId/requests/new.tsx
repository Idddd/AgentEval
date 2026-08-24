import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Check, Send } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PreviewBadge } from "@/components/shared/preview-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/$projectId/requests/new")({
  component: RaiseRequest,
});

type RequestType = "instance" | "quota" | "skill";

const requestConfig: Record<
  RequestType,
  {
    owner: string;
    reviewStep: string;
    target: string;
    targetLabel: string;
  }
> = {
  quota: {
    owner: "Platform Quota Approvers",
    reviewStep: "Quota approval",
    target: "deepseek-chat · api.deepseek.internal",
    targetLabel: "Model quota",
  },
  instance: {
    owner: "Platform Operations",
    reviewStep: "Operations review",
    target: "Research Assistant",
    targetLabel: "Instance",
  },
  skill: {
    owner: "Security Review",
    reviewStep: "Security review",
    target: "SQL Query · v1.4.2",
    targetLabel: "Skill",
  },
};

function RaiseRequest() {
  const [requestType, setRequestType] = useState<RequestType>("quota");
  const [feedback, setFeedback] = useState<"draft" | "submitted" | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const config = requestConfig[requestType];
  const flow = [
    "Draft",
    "Submitted",
    config.reviewStep,
    "Decision",
    "Change applied",
    "Completed",
  ];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("submitted");
    setSubmitted(true);
  };

  const saveDraft = () => {
    setFeedback("draft");
    setSubmitted(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raise Request"
        badge={<PreviewBadge />}
        description="Submit a resource change for review, then follow its decision and application status."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Change to approve</CardTitle>
            <CardDescription>
              Choose the resource and explain why the change is needed.
              Submission does not apply the change.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Request type</Label>
                <Select
                  value={requestType}
                  onValueChange={(value) => {
                    setRequestType(value as RequestType);
                    setFeedback(null);
                    setSubmitted(false);
                  }}
                >
                  <SelectTrigger className="h-11" aria-label="Request type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quota">API quota change</SelectItem>
                    <SelectItem value="instance">Instance change</SelectItem>
                    <SelectItem value="skill">Skill binding change</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Environment</Label>
                <Select defaultValue="uat">
                  <SelectTrigger className="h-11" aria-label="Environment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uat">UAT</SelectItem>
                    <SelectItem value="prod">PROD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{config.targetLabel}</Label>
                <Select key={requestType} defaultValue={requestType}>
                  <SelectTrigger className="h-11" aria-label={config.targetLabel}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={requestType}>{config.target}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {requestType === "quota" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="requested-rpm">Requested RPM</Label>
                    <Input id="requested-rpm" defaultValue="800" className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="requested-tpm">Requested TPM</Label>
                    <Input
                      id="requested-tpm"
                      defaultValue="2500000"
                      className="h-11"
                    />
                  </div>
                </>
              ) : null}
              {requestType === "instance" ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="instance-change">Requested change</Label>
                  <Input
                    id="instance-change"
                    defaultValue="Update runtime profile to gpu-standard"
                    className="h-11"
                  />
                </div>
              ) : null}
              {requestType === "skill" ? (
                <>
                  <div className="space-y-2">
                    <Label>Target Instance</Label>
                    <Select defaultValue="research-assistant">
                      <SelectTrigger className="h-11" aria-label="Target Instance">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="research-assistant">Research Assistant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="skill-version">Requested version</Label>
                    <Input id="skill-version" defaultValue="1.4.2" className="h-11" />
                  </div>
                </>
              ) : null}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="request-reason">Business justification</Label>
                <Textarea
                  id="request-reason"
                  className="min-h-32"
                  defaultValue="Increase capacity for the research Project."
                />
              </div>
              {feedback ? (
                <p
                  role="status"
                  className="border-l-2 border-emerald-500 bg-emerald-500/5 px-3 py-2 text-sm sm:col-span-2"
                >
                  {feedback === "submitted"
                    ? `Preview request submitted for approval. The ${config.reviewStep.toLowerCase()} step is now assigned to ${config.owner}; the requested change has not been applied.`
                    : "Draft saved in this preview session. It has not been persisted to the server or submitted for approval."}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" className="h-11" onClick={saveDraft}>
                  Save Draft
                </Button>
                <Button type="submit" className="h-11">
                  <Send /> Submit for Approval
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="xl:sticky xl:top-24">
          <CardHeader className="border-b">
            <CardTitle>Approval path</CardTitle>
            <CardDescription>
              A decision and an applied change are separate steps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="relative ml-2 border-l">
              {flow.map((step, index) => {
                const current = submitted ? index === 2 : index === 0;
                const complete = submitted && index < 2;
                return (
                  <li key={step} className="relative min-h-12 pl-6 text-sm">
                    <span
                      className={`absolute -left-2 top-0 grid size-4 place-items-center rounded-full border bg-background ${current ? "border-foreground bg-foreground text-background" : ""}`}
                    >
                      {complete ? <Check className="size-3" /> : null}
                    </span>
                    <strong className={current ? "font-medium" : "font-normal text-muted-foreground"}>
                      {step}
                    </strong>
                    {current ? (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Current step
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <div className="border-t pt-3 text-xs">
              <div className="flex min-h-9 items-center justify-between gap-3 border-b">
                <span className="text-muted-foreground">Action owner</span>
                <strong>{submitted ? config.owner : "You"}</strong>
              </div>
              <div className="flex min-h-9 items-center justify-between gap-3 border-b">
                <span className="text-muted-foreground">Next step</span>
                <strong className="flex items-center gap-1">
                  {submitted ? "Decision" : "Submit for approval"}
                  <ArrowRight className="size-3" />
                </strong>
              </div>
              <div className="flex min-h-9 items-center justify-between gap-3">
                <span className="text-muted-foreground">Change status</span>
                <strong>{submitted ? "Not applied" : "Not submitted"}</strong>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
