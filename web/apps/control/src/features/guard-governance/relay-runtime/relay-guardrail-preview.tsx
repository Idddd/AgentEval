import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  RotateCcw,
  Save,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { InfoNotice, PageHeader, StateBadge } from "../guardrail-import/components/product-shell";
import { Button } from "../guardrail-import/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../guardrail-import/components/ui/card";
import { Input } from "../guardrail-import/components/ui/input";
import { Switch } from "../guardrail-import/components/ui/switch";

type FallbackMode = "fail_closed" | "fail_open";
type MessageChoice = "inherit" | "yes" | "no";

const defaults = {
  name: "TaskLattice Production Guard",
  apiBase:
    "https://guard.tasklattice.example/runtime/v1/integrations/2c891d88-45c4-4c7f-a7ea-9132a6414d22",
  secret: "tlgr_demo_relay_secret",
  beforeModel: true,
  afterModel: true,
  fallback: "fail_closed" as FallbackMode,
  timeout: 10,
  defaultOn: true,
  skipSystemMessages: "inherit" as MessageChoice,
  skipToolMessages: "inherit" as MessageChoice,
};

export function RelayGuardrailPreviewPage({ projectId }: { projectId: string }) {
  const [name, setName] = useState(defaults.name);
  const [apiBase, setApiBase] = useState(defaults.apiBase);
  const [secret, setSecret] = useState(defaults.secret);
  const [beforeModel, setBeforeModel] = useState(defaults.beforeModel);
  const [afterModel, setAfterModel] = useState(defaults.afterModel);
  const [fallback, setFallback] = useState<FallbackMode>(defaults.fallback);
  const [timeout, setTimeoutValue] = useState(defaults.timeout);
  const [defaultOn, setDefaultOn] = useState(defaults.defaultOn);
  const [skipSystemMessages, setSkipSystemMessages] =
    useState<MessageChoice>(defaults.skipSystemMessages);
  const [skipToolMessages, setSkipToolMessages] =
    useState<MessageChoice>(defaults.skipToolMessages);
  const [verified, setVerified] = useState(true);

  const reset = () => {
    setName(defaults.name);
    setApiBase(defaults.apiBase);
    setSecret(defaults.secret);
    setBeforeModel(defaults.beforeModel);
    setAfterModel(defaults.afterModel);
    setFallback(defaults.fallback);
    setTimeoutValue(defaults.timeout);
    setDefaultOn(defaults.defaultOn);
    setSkipSystemMessages(defaults.skipSystemMessages);
    setSkipToolMessages(defaults.skipToolMessages);
    setVerified(true);
  };

  const verifyAndSave = () => {
    if (!name.trim() || !apiBase.trim() || !secret.trim()) {
      setVerified(false);
      toast.error("Name, Integration URL, and Secret are required.");
      return;
    }
    if (!beforeModel && !afterModel) {
      setVerified(false);
      toast.error("Select at least one enforcement stage.");
      return;
    }
    setVerified(true);
    toast.success("Connection verified. Relay Guardrail configuration saved.");
  };

  return (
    <section className="py-6 sm:py-8">
      <PageHeader
        eyebrow="Guardrails / Relay reference"
        title="Relay Guardrail"
        description="A local copy of the TaskLattice Guard provider experience from the latest Relay implementation. Changes on this page are isolated from the current Guardrail workflow."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link
                to="/$projectId/governance/guardrails"
                params={{ projectId }}
              >
                <ArrowLeft />
                Current version
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a
                href="https://github.com/tasklattice/tasklattice-relay/tree/main/infra/litellm/v1.87.0"
                target="_blank"
                rel="noreferrer"
              >
                Source
                <ExternalLink />
              </a>
            </Button>
          </div>
        }
      />

      <div className="mt-5">
        <InfoNotice title="Comparison copy">
          Relay treats a Guardrail as a verified runtime connection. The business
          policy, testing, approval, and resource coverage remain in the current
          TaskLattice experience.
        </InfoNotice>
      </div>

      <section className="mt-5 overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">{name || "Unnamed Guardrail"}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                TaskLattice Guard · LiteLLM provider
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StateBadge state={verified ? "ready" : "waiting"} />
            <span className="text-xs text-muted-foreground">
              {beforeModel && afterModel
                ? "Before + after model"
                : beforeModel
                  ? "Before model"
                  : afterModel
                    ? "After model"
                    : "No stage selected"}
            </span>
          </div>
        </div>

        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.7fr)]">
          <div className="space-y-5">
            <Card className="shadow-none">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <ServerCog className="size-4 text-primary" />
                  Connection
                </CardTitle>
                <CardDescription>
                  Relay verifies this Integration before saving the provider.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 pt-5">
                <Field label="Guardrail name">
                  <Input value={name} onChange={(event) => setName(event.target.value)} />
                </Field>
                <Field label="Integration base URL">
                  <Input
                    value={apiBase}
                    onChange={(event) => setApiBase(event.target.value)}
                  />
                </Field>
                <Field label="Integration secret">
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      type="password"
                      value={secret}
                      onChange={(event) => setSecret(event.target.value)}
                    />
                  </div>
                </Field>
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader className="border-b">
                <CardTitle>Enforcement</CardTitle>
                <CardDescription>
                  Choose when Relay sends content to TaskLattice Guard.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 pt-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ToggleCard
                    checked={beforeModel}
                    onCheckedChange={setBeforeModel}
                    title="Before model"
                    description="Inspect the request before inference."
                  />
                  <ToggleCard
                    checked={afterModel}
                    onCheckedChange={setAfterModel}
                    title="After model"
                    description="Inspect the response before delivery."
                  />
                </div>

                <fieldset className="grid gap-3">
                  <legend className="text-sm font-medium">If Guard is unavailable</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ChoiceCard
                      checked={fallback === "fail_closed"}
                      name="fallback"
                      title="Block the request"
                      description="Safer default. Traffic stops until Guard recovers."
                      onChange={() => setFallback("fail_closed")}
                    />
                    <ChoiceCard
                      checked={fallback === "fail_open"}
                      name="fallback"
                      title="Allow the request"
                      description="Only transport and temporary upstream failures bypass Guard."
                      onChange={() => setFallback("fail_open")}
                    />
                  </div>
                </fieldset>
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader className="border-b">
                <CardTitle>Advanced</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
                <Field label="Timeout per stage (seconds)">
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={timeout}
                    onChange={(event) =>
                      setTimeoutValue(Number(event.target.value) || 1)
                    }
                  />
                </Field>
                <ToggleCard
                  checked={defaultOn}
                  onCheckedChange={setDefaultOn}
                  title="Default for all requests"
                  description="Apply unless a request explicitly opts out."
                  compact
                />
                <SelectField
                  label="Skip system messages"
                  value={skipSystemMessages}
                  onChange={setSkipSystemMessages}
                />
                <SelectField
                  label="Skip tool messages"
                  value={skipToolMessages}
                  onChange={setSkipToolMessages}
                />
              </CardContent>
            </Card>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                <RotateCcw />
                Reset demo
              </Button>
              <Button onClick={verifyAndSave}>
                <Save />
                Verify and save
              </Button>
            </div>
          </div>

          <aside className="space-y-4">
            <Card className="shadow-none">
              <CardHeader className="border-b">
                <CardTitle>Request path</CardTitle>
                <CardDescription>Effective runtime behavior</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pt-5">
                <FlowStep label="Application request" active />
                <FlowArrow />
                <FlowStep label="TaskLattice Guard" active={beforeModel} />
                <FlowArrow />
                <FlowStep label="Model inference" active />
                <FlowArrow />
                <FlowStep label="TaskLattice Guard" active={afterModel} />
                <FlowArrow />
                <FlowStep label="Application response" active />
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader className="border-b">
                <CardTitle>Runtime summary</CardTitle>
              </CardHeader>
              <CardContent className="divide-y p-0 text-sm">
                <SummaryRow label="Provider" value="tasklattice_guard" />
                <SummaryRow
                  label="Fallback"
                  value={fallback === "fail_closed" ? "Block" : "Allow"}
                />
                <SummaryRow label="Timeout" value={`${timeout}s / stage`} />
                <SummaryRow label="Default" value={defaultOn ? "On" : "Off"} />
                <SummaryRow label="Credential" value="Encrypted reference" />
              </CardContent>
            </Card>

            <div className={`rounded-xl border p-4 ${verified ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              <p className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4" />
                {verified ? "Demo connection verified" : "Connection needs attention"}
              </p>
              <p className={`mt-1 text-xs leading-5 ${verified ? "text-emerald-800" : "text-amber-800"}`}>
                {verified
                  ? "The preview does not send credentials or change live traffic."
                  : "Complete the required fields and select an enforcement stage."}
              </p>
            </div>
          </aside>
        </div>
      </section>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium">{label}{children}</label>;
}

function ToggleCard({
  checked,
  onCheckedChange,
  title,
  description,
  compact = false,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-start justify-between gap-4 rounded-lg border bg-background ${compact ? "p-3" : "p-4"}`}>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={title} />
    </label>
  );
}

function ChoiceCard({
  checked,
  name,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  name: string;
  title: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${checked ? "border-primary bg-primary/[0.04]" : "bg-background"}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MessageChoice;
  onChange: (value: MessageChoice) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <select
        className="h-10 rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value as MessageChoice)}
      >
        <option value="inherit">Inherit provider default</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

function FlowStep({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-sm ${active ? "border-primary/25 bg-primary/[0.04]" : "bg-muted/20 text-muted-foreground"}`}>
      {label}
      <span className="float-right text-xs">{active ? "On" : "Skipped"}</span>
    </div>
  );
}

function FlowArrow() {
  return <ArrowRight className="mx-auto size-4 rotate-90 text-muted-foreground" />;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 px-4 py-3"><span className="text-muted-foreground">{label}</span><strong className="text-right text-xs font-medium">{value}</strong></div>;
}
