import { Copy, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DemoKnowledgeBase, DemoMcpServer, DemoSkill } from "../model";
import type { ResourceFormKind } from "./resource-form-dialog";

export type BuildResource = DemoMcpServer | DemoSkill | DemoKnowledgeBase;

export function ResourceDetailSheet({
  kind,
  resource,
  onOpenChange,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  kind: ResourceFormKind | null;
  resource: BuildResource | null;
  onOpenChange(open: boolean): void;
  onEdit(): void;
  onDelete(): void;
  onDuplicate(): void;
}) {
  const isSession = resource?.source === "SESSION";
  return (
    <Sheet open={resource !== null} onOpenChange={onOpenChange}>
      <SheetContent className="!w-[min(96vw,36rem)] overflow-y-auto p-0 sm:!max-w-[36rem]">
        {resource ? (
          <>
            <SheetHeader className="border-b bg-muted/20 px-6 py-5 pr-14">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-xl">{resource.name}</SheetTitle>
                <Badge variant="outline" className={isSession ? "border-primary/30 bg-primary/5 text-primary" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                  {isSession ? "Editable" : "Ready"}
                </Badge>
              </div>
              <SheetDescription>{resourceDescription(resource)}</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-6 py-6">
              <section className="rounded-lg border bg-card p-4">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resource type</span>
                <strong className="mt-2 block">{kindLabel(kind)}</strong>
                {"endpoint" in resource ? <Detail label="Endpoint" value={resource.endpoint} /> : null}
                {"authType" in resource ? <Detail label="Authentication" value={resource.authType.replaceAll("_", " ")} /> : null}
                {"sourceType" in resource ? <Detail label="Source" value={resource.sourceType} /> : null}
              </section>
              <div className="flex flex-wrap justify-end gap-2">
                {isSession ? (
                  <>
                    <Button variant="outline" onClick={onEdit}><Pencil />Edit</Button>
                    <Button variant="ghost" className="text-destructive" onClick={onDelete}><Trash2 />Delete</Button>
                  </>
                ) : (
                  <>
                    <Button aria-label={`Edit ${resource.name}`} onClick={onEdit}><Pencil />Edit</Button>
                    <Button variant="outline" aria-label={`Clone ${resource.name}`} onClick={onDuplicate}><Copy />Clone</Button>
                  </>
                )}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function resourceDescription(resource: BuildResource): string {
  if ("description" in resource) return resource.description;
  return "Reusable connection available to Agent builds.";
}

function kindLabel(kind: ResourceFormKind | null): string {
  if (kind === "mcp") return "MCP Server";
  if (kind === "skill") return "Skill";
  return "Knowledge Base";
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="mt-4 border-t pt-4"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block break-all text-sm capitalize">{value}</strong></div>;
}
