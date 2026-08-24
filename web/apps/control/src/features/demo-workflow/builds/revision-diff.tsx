import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { DemoAgentRevision } from "../model";

const fields: Array<{
  key: keyof Pick<
    DemoAgentRevision,
    | "runtimeType"
    | "model"
    | "endpoint"
    | "mcpIds"
    | "skillIds"
    | "knowledgeBaseIds"
  >;
  label: string;
}> = [
  { key: "runtimeType", label: "Runtime" },
  { key: "model", label: "Model" },
  { key: "endpoint", label: "Endpoint" },
  { key: "mcpIds", label: "MCP bindings" },
  { key: "skillIds", label: "Skill bindings" },
  { key: "knowledgeBaseIds", label: "Knowledge bindings" },
];

function display(value: string | string[]) {
  return Array.isArray(value) ? (value.length ? value.join(", ") : "None") : value;
}

export function RevisionDiff({
  base,
  revision,
}: {
  base: DemoAgentRevision | undefined;
  revision: DemoAgentRevision;
}) {
  if (!base) {
    return (
      <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
        R1 establishes the initial technical configuration.
      </div>
    );
  }
  const changes = fields.filter(
    (field) =>
      JSON.stringify(base[field.key]) !== JSON.stringify(revision[field.key]),
  );
  if (!changes.length) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <CheckCircle2 className="size-5" /> No technical changes from R{base.revision}.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="border-b bg-muted/30 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Configuration changes
      </div>
      {changes.map((field) => (
        <div key={field.key} className="grid gap-2 border-b px-4 py-3 last:border-b-0 md:grid-cols-[10rem_1fr_auto_1fr] md:items-center">
          <strong className="text-sm">{field.label} changed</strong>
          <code className="break-all rounded bg-muted px-2 py-1 text-xs">{display(base[field.key])}</code>
          <ArrowRight className="hidden size-4 text-muted-foreground md:block" />
          <code className="break-all rounded bg-primary/10 px-2 py-1 text-xs text-primary">{display(revision[field.key])}</code>
        </div>
      ))}
    </div>
  );
}
