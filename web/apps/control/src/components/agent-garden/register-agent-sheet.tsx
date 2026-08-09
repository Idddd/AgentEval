import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  createAgentGardenEntrySchema,
  type AgentGardenEntry,
  type AgentGardenRegisterableType,
  type AgentGardenUsageMode,
  type CreateAgentGardenEntryInput,
} from "@tasklattice/contracts";
import {
  ArrowLeft,
  ArrowRight,
  LockKeyhole,
  Network,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import {
  CreateInstanceLayout,
  type CreateInstanceStep,
} from "@/components/agents/create-instance-layout";
import { EntityDetailList, EntitySheet } from "@/components/shared/entity-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AgentGardenIcon } from "./agent-garden-icon";
import {
  agentTypePresentations,
  registerableAgentTypes,
  usageModeLabel,
} from "./agent-garden-presentation";

const steps: readonly CreateInstanceStep[] = [
  {
    label: "Choose type",
    description: "Select protocol or adapter",
  },
  {
    label: "Configure",
    description: "Define identity and connection",
  },
  {
    label: "Review",
    description: "Confirm and discover",
  },
];

function emptyDraft(): CreateAgentGardenEntryInput {
  return {
    name: "",
    description: "",
    integrationType: "a2a",
    endpoint: "",
    category: "Developer Tools",
    owner: "",
    tags: [],
    usageMode: "CALLABLE",
    authType: "none",
    authReference: "",
    internalNetworkOnly: false,
    configuration: {},
  };
}

const usageModes: Array<{
  description: string;
  label: string;
  value: AgentGardenUsageMode;
}> = [
  {
    value: "CALLABLE",
    label: "Receive delegated tasks",
    description: "Can be connected to OpenClaw or Hermes as a specialist.",
  },
  {
    value: "INTERACTIVE",
    label: "Run independently",
    description: "Opens as its own remote workbench and cannot be connected.",
  },
  {
    value: "HYBRID",
    label: "Both",
    description: "Supports its own workbench and delegated task requests.",
  },
];

export function RegisterAgentSheet({
  onOpenChange,
  onRegistered,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  onRegistered: (agent: AgentGardenEntry) => void;
  open: boolean;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<CreateAgentGardenEntryInput>(
    emptyDraft,
  );
  const [formError, setFormError] = useState("");
  const presentation = agentTypePresentations[draft.integrationType];
  const mutation = useMutation({
    mutationFn: api.registerGardenAgent,
    onSuccess: (agent) => {
      onRegistered(agent);
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDraft(emptyDraft());
    setFormError("");
    mutation.reset();
  }, [open]);

  const normalized = useMemo(
    () => ({
      ...draft,
      ...(draft.agentCardUrl
        ? { agentCardUrl: draft.agentCardUrl }
        : { agentCardUrl: undefined }),
      configuration: Object.fromEntries(
        Object.entries(draft.configuration).filter(
          ([, value]) => value.trim().length,
        ),
      ),
    }),
    [draft],
  );
  const parsed = createAgentGardenEntrySchema.safeParse(normalized);

  const chooseType = (type: AgentGardenRegisterableType) => {
    setDraft({
      ...draft,
      integrationType: type,
      configuration: {},
      agentCardUrl:
        type === "a2a" || type === "pydantic-ai" ? "" : undefined,
    });
  };

  const submit = () => {
    const result = createAgentGardenEntrySchema.safeParse(normalized);
    if (!result.success) {
      setFormError(
        result.error.issues[0]?.message ??
          "Review the Agent registration.",
      );
      setStep(1);
      return;
    }
    setFormError("");
    mutation.mutate(result.data);
  };

  return (
    <EntitySheet
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) onOpenChange(next);
      }}
      eyebrow="Agent Garden"
      title="Register Agent"
      description="Connect an Agent built outside TaskLattice and define how it may participate in this Project."
      width="xl"
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {step === 0 ? (
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setStep((current) => current - 1)}
            >
              <ArrowLeft /> Back
            </Button>
          )}
          {step < 2 ? (
            <Button
              type="button"
              disabled={step === 1 && !parsed.success}
              onClick={() => setStep((current) => current + 1)}
            >
              {step === 0 ? "Configure connection" : "Review registration"}
              <ArrowRight />
            </Button>
          ) : (
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={submit}
            >
              <ShieldCheck />
              {mutation.isPending
                ? "Registering…"
                : "Register & discover"}
            </Button>
          )}
        </div>
      )}
    >
      <CreateInstanceLayout
        steps={steps}
        currentStep={step}
        onStepChange={setStep}
        progressLabel="Register Agent progress"
      >
        <div className="space-y-6">
        {step === 0 ? (
          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Agent type</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Choose the protocol or platform adapter exposed by the remote
                Agent.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {registerableAgentTypes.map((type) => {
                const option = agentTypePresentations[type];
                const selected = draft.integrationType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => chooseType(type)}
                    className={cn(
                      "flex min-h-20 items-start gap-3 rounded-md border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                      selected
                        ? "border-primary bg-primary/5"
                        : "bg-background hover:border-foreground/20 hover:bg-muted/35",
                    )}
                  >
                    <AgentGardenIcon
                      type={type}
                      className="size-10"
                    />
                    <span className="min-w-0">
                      <strong className="flex items-center gap-2 text-sm">
                        {option.label}
                        {type === "custom" ? (
                          <Badge variant="outline">Generic</Badge>
                        ) : null}
                      </strong>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <form
            className="space-y-7"
            onSubmit={(event) => event.preventDefault()}
          >
            <FormSection
              icon={ServerCog}
              title="Identity"
              description="How operators and Coordinators recognize this Agent."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="garden-agent-name" label="Display name">
                  <Input
                    id="garden-agent-name"
                    className="h-11"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                    placeholder="GitHub Operations Agent"
                    autoFocus
                  />
                </Field>
                <Field id="garden-agent-owner" label="Owner">
                  <Input
                    id="garden-agent-owner"
                    className="h-11"
                    value={draft.owner}
                    onChange={(event) =>
                      setDraft({ ...draft, owner: event.target.value })
                    }
                    placeholder="Developer Experience"
                  />
                </Field>
              </div>
              <Field id="garden-agent-description" label="Description">
                <Textarea
                  id="garden-agent-description"
                  value={draft.description}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      description: event.target.value,
                    })
                  }
                  placeholder="Handles repository triage, pull request review, and issue maintenance."
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="garden-agent-category" label="Category">
                  <Input
                    id="garden-agent-category"
                    className="h-11"
                    value={draft.category}
                    onChange={(event) =>
                      setDraft({ ...draft, category: event.target.value })
                    }
                  />
                </Field>
                <Field id="garden-agent-tags" label="Capability tags">
                  <Input
                    id="garden-agent-tags"
                    className="h-11"
                    value={draft.tags.join(", ")}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        tags: commaList(event.target.value),
                      })
                    }
                    placeholder="GitHub, Pull requests, Automation"
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection
              icon={Network}
              title="Connection"
              description={`${presentation.label} connection and discovery metadata.`}
            >
              <Field id="garden-agent-endpoint" label="Agent endpoint">
                <Input
                  id="garden-agent-endpoint"
                  className="h-11 font-mono"
                  value={draft.endpoint}
                  onChange={(event) =>
                    setDraft({ ...draft, endpoint: event.target.value })
                  }
                  placeholder="https://agents.example.com/github"
                />
              </Field>
              {draft.integrationType === "a2a" ||
              draft.integrationType === "pydantic-ai" ? (
                <Field
                  id="garden-agent-card"
                  label="Agent Card URL (optional)"
                >
                  <Input
                    id="garden-agent-card"
                    className="h-11 font-mono"
                    value={draft.agentCardUrl ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        agentCardUrl: event.target.value,
                      })
                    }
                    placeholder="Defaults to /.well-known/agent-card.json"
                  />
                </Field>
              ) : null}
              {draft.integrationType === "langgraph" ? (
                <Field
                  id="garden-agent-assistant-id"
                  label="LangGraph Assistant ID"
                >
                  <Input
                    id="garden-agent-assistant-id"
                    className="h-11 font-mono"
                    value={draft.configuration.assistantId ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        configuration: {
                          ...draft.configuration,
                          assistantId: event.target.value,
                        },
                      })
                    }
                    placeholder="assistant-id"
                  />
                </Field>
              ) : null}
              <label className="flex min-h-12 items-start gap-3 border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={draft.internalNetworkOnly}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      internalNetworkOnly: event.target.checked,
                    })
                  }
                />
                <span>
                  <strong className="block">Internal network only</strong>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    Allows approved private endpoints that are not reachable
                    from the public internet.
                  </span>
                </span>
              </label>
            </FormSection>

            <FormSection
              icon={LockKeyhole}
              title="Authentication"
              description="Only Secret references are persisted. Credential values never return to the browser."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="garden-agent-auth-type"
                  label="Authentication type"
                >
                  <select
                    id="garden-agent-auth-type"
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={draft.authType}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        authType: event.target
                          .value as CreateAgentGardenEntryInput["authType"],
                      })
                    }
                  >
                    <option value="none">None</option>
                    <option value="bearer_token">Bearer token</option>
                    <option value="api_key">API key</option>
                  </select>
                </Field>
                {draft.authType !== "none" ? (
                  <Field
                    id="garden-agent-auth-reference"
                    label="Credential Secret reference"
                  >
                    <Input
                      id="garden-agent-auth-reference"
                      className="h-11 font-mono"
                      value={draft.authReference}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          authReference: event.target.value,
                        })
                      }
                      placeholder="k8s://namespace/secret#A2A_TOKEN"
                    />
                  </Field>
                ) : null}
              </div>
            </FormSection>

            <FormSection
              icon={ShieldCheck}
              title="Usage"
              description="Declares whether this Agent can be opened directly, connected to a Coordinator, or both."
            >
              <div className="grid gap-2 sm:grid-cols-3">
                {usageModes.map((mode) => (
                  <label
                    key={mode.value}
                    className={cn(
                      "flex min-h-28 cursor-pointer items-start gap-3 rounded-md border p-3",
                      draft.usageMode === mode.value
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/35",
                    )}
                  >
                    <input
                      type="radio"
                      name="agent-usage-mode"
                      className="mt-1 size-4 accent-primary"
                      checked={draft.usageMode === mode.value}
                      onChange={() =>
                        setDraft({
                          ...draft,
                          usageMode: mode.value,
                        })
                      }
                    />
                    <span>
                      <strong className="block text-sm">{mode.label}</strong>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {mode.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </FormSection>

            {formError || mutation.error ? (
              <p
                role="alert"
                className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {formError || mutation.error?.message}
              </p>
            ) : null}
          </form>
        ) : null}

        {step === 2 ? (
          <section className="space-y-6">
            <div className="flex items-start gap-4 border bg-muted/20 p-4">
              <AgentGardenIcon
                type={draft.integrationType}
                className="size-12"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{draft.name}</h3>
                  <Badge variant="secondary">{presentation.label}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {draft.description}
                </p>
              </div>
            </div>
            <EntityDetailList
              items={[
                {
                  label: "Connection",
                  value: draft.endpoint,
                  mono: true,
                },
                {
                  label: "Usage",
                  value: usageModeLabel(draft.usageMode),
                },
                {
                  label: "Owner",
                  value: draft.owner,
                },
                {
                  label: "Authentication",
                  value:
                    draft.authType === "none"
                      ? "None"
                      : `${draft.authType} via Secret reference`,
                },
                {
                  label: "Discovery",
                  value:
                    draft.integrationType === "a2a" ||
                    draft.integrationType === "pydantic-ai" ||
                    Boolean(draft.agentCardUrl)
                      ? "Agent Card"
                      : "Endpoint health probe",
                },
              ]}
            />
            <div className="border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm leading-6">
              Registration saves the Project-owned desired state first, then
              performs discovery. A failed connection remains visible with a
              recoverable “Needs attention” status.
            </div>
            {formError || mutation.error ? (
              <p
                role="alert"
                className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {formError || mutation.error?.message}
              </p>
            ) : null}
          </section>
        ) : null}
        </div>
      </CreateInstanceLayout>
    </EntitySheet>
  );
}

function FormSection({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: typeof ServerCog;
  title: string;
}) {
  return (
    <section className="space-y-4 border-t pt-6 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center border bg-muted/30">
          <Icon className="size-4 text-primary" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  children,
  id,
  label,
}: {
  children: React.ReactNode;
  id: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function commaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
