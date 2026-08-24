import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type {
  DemoKnowledgeBaseInput,
  DemoMcpInput,
  DemoSkillInput,
} from "../model";

export type ResourceFormKind = "mcp" | "skill" | "knowledge-base";
export type ResourceFormValue =
  | DemoMcpInput
  | DemoSkillInput
  | DemoKnowledgeBaseInput;

const defaults: Record<ResourceFormKind, ResourceFormValue> = {
  mcp: {
    name: "Customer Records MCP",
    endpoint: "https://demo.invalid/mcp/customer-records",
    authType: "bearer_token",
  },
  skill: {
    name: "Case Resolution",
    description:
      "Summarize a case and recommend the next approved action.",
  },
  "knowledge-base": {
    name: "Support Policy Library",
    sourceType: "Document collection",
    description: "Approved support policies and escalation guidance.",
  },
};

const presentation = {
  mcp: {
    title: "MCP Server",
    description: "Describe the demo connection and authentication shape.",
  },
  skill: {
    title: "Skill",
    description: "Define a focused capability the Agent can use.",
  },
  "knowledge-base": {
    title: "Knowledge Base",
    description: "Describe the approved knowledge source available to the Agent.",
  },
} as const;

export function ResourceFormDialog({
  kind,
  open,
  initialValue,
  onOpenChange,
  onSubmit,
}: {
  kind: ResourceFormKind;
  open: boolean;
  initialValue?: ResourceFormValue;
  onOpenChange(open: boolean): void;
  onSubmit(value: ResourceFormValue): void;
}) {
  const [value, setValue] = useState<ResourceFormValue>(defaults[kind]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValue(structuredClone(initialValue ?? defaults[kind]));
    setError("");
  }, [initialValue, kind, open]);

  const submit = () => {
    try {
      onSubmit(value);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save resource");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {initialValue ? "Edit" : "Create"} {presentation[kind].title}
          </DialogTitle>
          <DialogDescription>{presentation[kind].description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 py-5">
          {error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={`${kind}-name`}>Name</Label>
            <Input
              id={`${kind}-name`}
              value={value.name}
              onChange={(event) => setValue({ ...value, name: event.target.value })}
            />
          </div>
          {"endpoint" in value ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="mcp-endpoint">Endpoint</Label>
                <Input
                  id="mcp-endpoint"
                  value={value.endpoint}
                  onChange={(event) =>
                    setValue({ ...value, endpoint: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mcp-auth">Authentication</Label>
                <Select
                  value={value.authType}
                  onValueChange={(authType) =>
                    setValue({
                      ...value,
                      authType: authType as DemoMcpInput["authType"],
                    })
                  }
                >
                  <SelectTrigger id="mcp-auth"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="bearer_token">Bearer token</SelectItem>
                    <SelectItem value="api_key">API key</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}
          {"sourceType" in value ? (
            <div className="space-y-2">
              <Label htmlFor="knowledge-source">Source type</Label>
              <Input
                id="knowledge-source"
                value={value.sourceType}
                onChange={(event) =>
                  setValue({ ...value, sourceType: event.target.value })
                }
              />
            </div>
          ) : null}
          {"description" in value ? (
            <div className="space-y-2">
              <Label htmlFor={`${kind}-description`}>Description</Label>
              <Textarea
                id={`${kind}-description`}
                value={value.description}
                onChange={(event) =>
                  setValue({ ...value, description: event.target.value })
                }
              />
            </div>
          ) : null}
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
            Demo only · values stay in this browser tab and are never contacted.
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit}>
            {initialValue ? "Save changes" : "Create session resource"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
