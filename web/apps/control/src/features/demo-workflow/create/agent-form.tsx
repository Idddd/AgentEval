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
import { MultiSelectCombobox } from "@/components/ui/multi-select-combobox";
import { Textarea } from "@/components/ui/textarea";
import type {
  DemoAgentInput,
  DemoKnowledgeBase,
  DemoMcpServer,
  DemoSkill,
} from "../model";

export const agentFormDefaults: Omit<
  DemoAgentInput,
  "mcpIds" | "skillIds" | "knowledgeBaseIds"
> = {
  name: "Customer Service Assistant",
  owner: "Customer Operations",
  description: "Helps service teams resolve customer cases consistently.",
  businessOutcome: "Faster, consistent customer case resolution",
  targetUsers: "Customer service representatives",
  typicalScenarios: ["Case triage", "Policy guidance", "Escalation recommendation"],
  runtimeType: "Managed interactive",
  model: "Demo reasoning model",
  endpoint: "https://demo.invalid/agents/customer-service",
};

export function AgentForm({
  open,
  mcpServers,
  skills,
  knowledgeBases,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mcpServers: DemoMcpServer[];
  skills: DemoSkill[];
  knowledgeBases: DemoKnowledgeBase[];
  onOpenChange(open: boolean): void;
  onSubmit(input: DemoAgentInput): void;
}) {
  const [value, setValue] = useState<DemoAgentInput>({
    ...agentFormDefaults,
    mcpIds: [],
    skillIds: [],
    knowledgeBaseIds: [],
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const preferred = <T extends DemoMcpServer | DemoSkill | DemoKnowledgeBase>(items: T[]) =>
      items.find((item) => item.source === "SESSION")?.id ?? items[0]?.id;
    const preferredMcpId = preferred(mcpServers);
    const preferredSkillId = preferred(skills);
    const preferredKnowledgeBaseId = preferred(knowledgeBases);
    setValue({
      ...agentFormDefaults,
      typicalScenarios: [...agentFormDefaults.typicalScenarios],
      mcpIds: preferredMcpId ? [preferredMcpId] : [],
      skillIds: preferredSkillId ? [preferredSkillId] : [],
      knowledgeBaseIds: preferredKnowledgeBaseId ? [preferredKnowledgeBaseId] : [],
    });
    setError("");
  }, [knowledgeBases, mcpServers, open, skills]);

  const submit = () => {
    try {
      onSubmit(value);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create Agent");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create Agent draft</DialogTitle>
          <DialogDescription>
            Assemble the technical build. Business approval happens later in Eval.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 px-6 py-5 md:grid-cols-2">
          {error ? <p role="alert" className="md:col-span-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <Field label="Name"><Input value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} /></Field>
          <Field label="Owner"><Input value={value.owner} onChange={(event) => setValue({ ...value, owner: event.target.value })} /></Field>
          <Field label="Runtime type"><Input value={value.runtimeType} onChange={(event) => setValue({ ...value, runtimeType: event.target.value })} /></Field>
          <Field label="Model"><Input value={value.model} onChange={(event) => setValue({ ...value, model: event.target.value })} /></Field>
          <Field label="Endpoint" className="md:col-span-2"><Input value={value.endpoint} onChange={(event) => setValue({ ...value, endpoint: event.target.value })} /></Field>
          <Field label="Description" className="md:col-span-2"><Textarea value={value.description} onChange={(event) => setValue({ ...value, description: event.target.value })} /></Field>
          <Field label="Business outcome" className="md:col-span-2"><Input value={value.businessOutcome} onChange={(event) => setValue({ ...value, businessOutcome: event.target.value })} /></Field>
          <Field label="Target users"><Input value={value.targetUsers} onChange={(event) => setValue({ ...value, targetUsers: event.target.value })} /></Field>
          <Field label="Typical scenarios"><Input value={value.typicalScenarios.join(", ")} onChange={(event) => setValue({ ...value, typicalScenarios: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Field>

          <Field label="MCP Servers">
            <MultiSelectCombobox ariaLabel="MCP Servers" value={value.mcpIds} onValueChange={(mcpIds) => setValue({ ...value, mcpIds })} options={mcpServers.map((item) => ({ value: item.id, label: item.name, description: item.endpoint }))} noOptionsMessage="Create an MCP Server first." />
          </Field>
          <Field label="Skills">
            <MultiSelectCombobox ariaLabel="Skills" value={value.skillIds} onValueChange={(skillIds) => setValue({ ...value, skillIds })} options={skills.map((item) => ({ value: item.id, label: item.name, description: item.description }))} noOptionsMessage="Create a Skill first." />
          </Field>
          <Field label="Knowledge Bases" className="md:col-span-2">
            <MultiSelectCombobox ariaLabel="Knowledge Bases" value={value.knowledgeBaseIds} onValueChange={(knowledgeBaseIds) => setValue({ ...value, knowledgeBaseIds })} options={knowledgeBases.map((item) => ({ value: item.id, label: item.name, description: item.description }))} noOptionsMessage="Create a Knowledge Base first." />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={submit}>Create Agent draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`space-y-2 ${className ?? ""}`}><span className="text-sm font-medium">{label}</span>{children}</label>;
}
