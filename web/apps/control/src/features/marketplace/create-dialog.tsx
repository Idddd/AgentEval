import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Layers2,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  businessAreas,
  createResourceSchema,
  protectionCatalog,
  type ApiResult,
  type CreateResourceInput,
  type MarketplaceResource,
  type ResourceKind,
} from "./contracts";
import { useMarketplace, useMarketplaceCollection } from "./provider";

const blankInput = (): CreateResourceInput => ({
  name: "",
  description: "",
  businessArea: "General",
  protections: ["personal-data", "harmful-content", "prompt-injection"],
  checkpoints: ["input", "output"],
  allowedTopics: [],
  restrictedTopics: [],
});
const fromTemplate = (template: MarketplaceResource): CreateResourceInput => ({
  name: `${template.name} guardrail`,
  description: template.description,
  businessArea: template.businessArea,
  protections: [...template.protections],
  checkpoints: [...template.checkpoints],
  allowedTopics: [...template.allowedTopics],
  restrictedTopics: [...template.restrictedTopics],
  templateId: template.id,
});

export function CreateResourceDialog({
  kind,
  template,
  onClose,
  onCreated,
}: {
  kind: ResourceKind;
  template?: MarketplaceResource;
  onClose: () => void;
  onCreated: (value: ApiResult<MarketplaceResource>) => void;
}) {
  const { api, source } = useMarketplace();
  const templates = useMarketplaceCollection("templates");
  const queryClient = useQueryClient();
  const [input, setInput] = useState<CreateResourceInput>(() =>
    template ? fromTemplate(template) : blankInput(),
  );
  const [error, setError] = useState("");
  const isTemplate = kind === "templates";
  const noun = isTemplate ? "template" : "guardrail";
  const mutation = useMutation({
    mutationFn: (body: CreateResourceInput) => api.create(kind, body),
    retry: false,
    onSuccess: async (result) => {
      queryClient.setQueryData(["marketplace", kind, result.data.id], result);
      await queryClient.invalidateQueries({
        queryKey: ["marketplace", kind],
        exact: true,
      });
      onCreated(result);
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    const parsed = createResourceSchema.safeParse({
      ...input,
      allowedTopics: input.allowedTopics.filter((topic) => topic.trim()),
      restrictedTopics: input.restrictedTopics.filter((topic) => topic.trim()),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your entries.");
      return;
    }
    setError("");
    mutation.mutate(parsed.data);
  }
  const update = <K extends keyof CreateResourceInput>(
    key: K,
    value: CreateResourceInput[K],
  ) => {
    setInput((current) => ({ ...current, [key]: value }));
    setError("");
    mutation.reset();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent
        className="mp-dialog marketplace"
        onEscapeKeyDown={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <header className="mp-dialog-heading">
          <span className="mp-dialog-icon">
            {isTemplate ? <Layers2 size={22} /> : <ShieldCheck size={22} />}
          </span>
          <div>
            <DialogTitle className="mp-dialog-title">Create {noun}</DialogTitle>
            <DialogDescription className="mp-dialog-description">
              {isTemplate
                ? "Turn a business use case into a reusable starting point."
                : "Tell us what your AI should do, and what it should protect."}
            </DialogDescription>
          </div>
        </header>
        <form onSubmit={submit} className="mp-create-form">
          <div className="mp-form-scroll">
            <fieldset disabled={mutation.isPending} className="mp-form-fields">
              {!isTemplate ? (
                <label className="mp-field mp-template-field">
                  <span>
                    <Layers2 size={15} />
                    Start with a template <em>Optional</em>
                  </span>
                  <select
                    aria-label="Start with a template"
                    value={input.templateId ?? ""}
                    onChange={(event) => {
                      const selected = templates.data?.data.items.find(
                        (item) => item.id === event.target.value,
                      );
                      setInput(
                        selected ? fromTemplate(selected) : blankInput(),
                      );
                      setError("");
                      mutation.reset();
                    }}
                  >
                    <option value="">Start from scratch</option>
                    {templates.data?.data.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="mp-form-section-heading">
                <span>01</span>
                <h3>The business need</h3>
              </div>
              <div className="mp-form-columns">
                <label className="mp-field">
                  <span>
                    {isTemplate ? "Template" : "Guardrail Profile"} name <b>*</b>
                  </span>
                  <input
                    required
                    autoFocus
                    maxLength={100}
                    value={input.name}
                    placeholder={
                      isTemplate
                        ? "e.g. Customer care essentials"
                        : "e.g. Customer support assistant"
                    }
                    onChange={(event) => update("name", event.target.value)}
                  />
                </label>
                <label className="mp-field">
                  <span>Business area</span>
                  <select
                    value={input.businessArea}
                    onChange={(event) =>
                      update(
                        "businessArea",
                        event.target
                          .value as CreateResourceInput["businessArea"],
                      )
                    }
                  >
                    {businessAreas.map((area) => (
                      <option key={area}>{area}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="mp-field">
                <span>
                  Business purpose <b>*</b>
                </span>
                <textarea
                  required
                  rows={3}
                  maxLength={2000}
                  value={input.description}
                  placeholder="Describe who this helps, what they need to do, and what matters most."
                  onChange={(event) =>
                    update("description", event.target.value)
                  }
                />
              </label>
              <div className="mp-form-section-heading">
                <span>02</span>
                <h3>What should it protect?</h3>
                <small>Choose at least one</small>
              </div>
              <div className="mp-protection-options">
                {protectionCatalog.map((protection) => {
                  const selected = input.protections.includes(protection.id);
                  return (
                    <label
                      key={protection.id}
                      className={`mp-checkbox-card ${selected ? "is-selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          update(
                            "protections",
                            selected
                              ? input.protections.filter(
                                  (id) => id !== protection.id,
                                )
                              : [...input.protections, protection.id],
                          )
                        }
                      />
                      <span>
                        <strong>{protection.name}</strong>
                        <small>{protection.description}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
              <fieldset className="mp-checkpoints">
                <legend>Where should these checks apply?</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={input.checkpoints.includes("input")}
                    onChange={(event) =>
                      update(
                        "checkpoints",
                        event.target.checked
                          ? [...input.checkpoints, "input"]
                          : input.checkpoints.filter(
                              (value) => value !== "input",
                            ),
                      )
                    }
                  />
                  <span>
                    <strong>User messages</strong>
                    <small>Before your AI responds</small>
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={input.checkpoints.includes("output")}
                    onChange={(event) =>
                      update(
                        "checkpoints",
                        event.target.checked
                          ? [...input.checkpoints, "output"]
                          : input.checkpoints.filter(
                              (value) => value !== "output",
                            ),
                      )
                    }
                  />
                  <span>
                    <strong>AI responses</strong>
                    <small>Before people see an answer</small>
                  </span>
                </label>
              </fieldset>
              <details
                className="mp-boundaries"
                open={
                  input.protections.includes("topic-boundaries") || undefined
                }
              >
                <summary>
                  Business boundaries <span>Optional</span>
                </summary>
                <div className="mp-form-columns">
                  <label className="mp-field">
                    <span>Topics your AI can help with</span>
                    <textarea
                      rows={3}
                      value={input.allowedTopics.join("\n")}
                      placeholder={"Product information\nOrder support"}
                      onChange={(event) =>
                        update("allowedTopics", event.target.value.split("\n"))
                      }
                    />
                    <small>One topic per line.</small>
                  </label>
                  <label className="mp-field">
                    <span>Topics to avoid</span>
                    <textarea
                      rows={3}
                      value={input.restrictedTopics.join("\n")}
                      placeholder={
                        "Personal account credentials\nUnapproved advice"
                      }
                      onChange={(event) =>
                        update(
                          "restrictedTopics",
                          event.target.value.split("\n"),
                        )
                      }
                    />
                    <small>One topic per line.</small>
                  </label>
                </div>
              </details>
            </fieldset>
            {error || mutation.error ? (
              <p className="mp-form-error" role="alert">
                {error || mutation.error?.message}
              </p>
            ) : null}
          </div>
          <footer className="mp-dialog-footer">
            <span>
              <Check size={14} />
              {source === "mock"
                ? "Saved locally in this sample workspace"
                : isTemplate
                  ? "Saved as a reusable template"
                  : "Created as a draft"}
            </span>
            <div>
              <button
                type="button"
                className="mp-button mp-secondary"
                disabled={mutation.isPending}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="mp-button mp-primary"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : null}
                {mutation.isPending ? "Creating…" : `Create ${noun}`}
                {!mutation.isPending ? <ArrowRight size={15} /> : null}
              </button>
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
