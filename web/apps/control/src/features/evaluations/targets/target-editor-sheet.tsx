import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useEvaluationState, useEvaluationStore } from "../mock-provider";

const models = [
  { id: "deepseek-chat", name: "DeepSeek Chat" },
  { id: "gpt-5", name: "GPT-5" },
  { id: "claude-sonnet", name: "Claude Sonnet" },
];

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function TargetEditorSheet({
  onOpenChange,
  open,
  targetId,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  targetId?: string;
}) {
  const store = useEvaluationStore();
  const state = useEvaluationState();
  const target = state.targets.find((item) => item.id === targetId);
  const revision = state.targetRevisions.find(
    (item) => item.id === target?.currentRevisionId,
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [modelId, setModelId] = useState(models[0]!.id);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tools, setTools] = useState("");
  const [mcpServers, setMcpServers] = useState("");
  const [knowledgeBases, setKnowledgeBases] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(target?.name ?? "");
    setDescription(target?.description ?? "");
    setModelId(revision?.model.id ?? models[0]!.id);
    setSystemPrompt(revision?.systemPrompt ?? "");
    setTools(revision?.tools.join(", ") ?? "");
    setMcpServers(revision?.mcpServers.join(", ") ?? "");
    setKnowledgeBases(revision?.knowledgeBases.join(", ") ?? "");
    setError("");
  }, [open, revision, target]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const model = models.find((item) => item.id === modelId)!;
    const result = target
      ? store.createTargetRevision(target.id, {
          model,
          systemPrompt,
          tools: splitList(tools),
          mcpServers: splitList(mcpServers),
          knowledgeBases: splitList(knowledgeBases),
        })
      : store.createTarget({ name, description, model, systemPrompt });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{target ? "Create Target revision" : "New Target"}</SheetTitle>
          <SheetDescription>
            {target
              ? "Create an immutable configuration revision. Existing reports keep their original snapshot."
              : "Define the Agent configuration that Evaluations will execute."}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="flex flex-1 flex-col">
          <div className="space-y-5 px-4">
            {!target ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="target-name">Name</Label>
                  <Input
                    id="target-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Permission Compliance Agent"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target-description">Description</Label>
                  <Textarea
                    id="target-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                  />
                </div>
              </>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="target-model">Model</Label>
              <select
                id="target-model"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {models.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-prompt">System prompt</Label>
              <Textarea
                id="target-prompt"
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                rows={8}
                className="font-mono text-xs"
              />
            </div>
            {target ? (
              <>
                <ListField id="target-tools" label="Tools" value={tools} onChange={setTools} />
                <ListField id="target-mcp" label="MCP Servers" value={mcpServers} onChange={setMcpServers} />
                <ListField id="target-knowledge" label="Knowledge Bases" value={knowledgeBases} onChange={setKnowledgeBases} />
              </>
            ) : null}
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
          <SheetFooter className="mt-auto flex-row justify-end border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{target ? "Create revision" : "Create Target"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ListField({ id, label, onChange, value }: { id: string; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Comma-separated values" />
    </div>
  );
}
