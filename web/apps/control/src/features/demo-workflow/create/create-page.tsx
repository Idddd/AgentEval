import { useMemo, useState } from "react";
import { Bot, Database, Network, Plus, Puzzle, ShieldCheck, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEvaluationLayerState } from "@/features/evaluation-layer/mock-provider";
import { useDemoWorkflowState, useDemoWorkflowStore } from "../provider";
import type { DemoKnowledgeBase, DemoMcpServer, DemoSkill } from "../model";
import { AgentForm } from "./agent-form";
import { BuildsPage } from "../builds/builds-page";
import {
  ResourceFormDialog,
  type ResourceFormKind,
  type ResourceFormValue,
} from "./resource-form-dialog";

type Resource = DemoMcpServer | DemoSkill | DemoKnowledgeBase;

const tabs = [
  { value: "agent", label: "Agent", icon: Bot },
  { value: "mcp", label: "MCP Server", icon: Network },
  { value: "skill", label: "Skill", icon: Puzzle },
  { value: "knowledge-base", label: "Knowledge Base", icon: Database },
] as const;

function CreateWorkspaceContent() {
  const state = useDemoWorkflowState();
  const evaluationState = useEvaluationLayerState();
  const store = useDemoWorkflowStore();
  const [tab, setTab] = useState<(typeof tabs)[number]["value"]>("agent");
  const [resourceDialog, setResourceDialog] = useState<ResourceFormKind | null>(null);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const resources = useMemo(
    () => ({
      mcp: state.mcpServers,
      skill: state.skills,
      "knowledge-base": state.knowledgeBases,
    }),
    [state.knowledgeBases, state.mcpServers, state.skills],
  );
  const demoAgentCases = useMemo(
    () => evaluationState.targets
      .filter((target) => target.kind === "agent" && target.id.startsWith("demo-"))
      .map((target) => {
        const revision = evaluationState.targetRevisions.find(
          (item) => item.id === target.currentRevisionId,
        );
        const latestRun = [...evaluationState.runs]
          .filter((run) => run.targetRevisionId === target.currentRevisionId)
          .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
        return { target, revision, latestRun };
      }),
    [evaluationState.runs, evaluationState.targetRevisions, evaluationState.targets],
  );

  const saveResource = (kind: ResourceFormKind, value: ResourceFormValue) => {
    setError("");
    if (kind === "mcp") {
      const saved = editing
        ? store.updateMcpServer(editing.id, value as DemoMcpServer, "agent-wizard")
        : store.createMcpServer(value as DemoMcpServer, "agent-wizard");
      setNotice(`${saved.name} saved to this session.`);
    } else if (kind === "skill") {
      const saved = editing
        ? store.updateSkill(editing.id, value as DemoSkill, "agent-wizard")
        : store.createSkill(value as DemoSkill, "agent-wizard");
      setNotice(`${saved.name} saved to this session.`);
    } else {
      const saved = editing
        ? store.updateKnowledgeBase(editing.id, value as DemoKnowledgeBase, "agent-wizard")
        : store.createKnowledgeBase(value as DemoKnowledgeBase, "agent-wizard");
      setNotice(`${saved.name} saved to this session.`);
    }
    setEditing(null);
  };

  const remove = (kind: ResourceFormKind, id: string) => {
    try {
      setError("");
      if (kind === "mcp") store.deleteMcpServer(id, "agent-wizard");
      else if (kind === "skill") store.deleteSkill(id, "agent-wizard");
      else store.deleteKnowledgeBase(id, "agent-wizard");
      setNotice("Session resource removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove resource");
    }
  };

  return (
    <div className="space-y-7">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Session resources" value={state.mcpServers.filter((item) => item.source === "SESSION").length + state.skills.filter((item) => item.source === "SESSION").length + state.knowledgeBases.filter((item) => item.source === "SESSION").length} />
        <Metric label="Agent drafts" value={state.agentRevisions.filter((item) => item.source === "SESSION" && item.status === "DRAFT").length} />
        <Card className="border-primary/20 bg-primary/5"><CardContent className="flex min-h-24 items-center gap-3 p-5"><ShieldCheck className="size-8 text-primary" /><div><strong className="block text-sm">No backend writes</strong><span className="text-xs text-muted-foreground">Refresh clears this workspace.</span></div></CardContent></Card>
      </div>

      {notice ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-lg bg-muted/60 p-1">
          {tabs.map((item) => <TabsTrigger key={item.value} value={item.value} className="min-h-10 gap-2 px-4"><item.icon className="size-4" />{item.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="agent" className="mt-5">
          <SectionHeader title="Agents" description="Start from an existing demo Agent or create a new session draft to evaluate later." action={<Button onClick={() => setAgentOpen(true)}><Plus />Create Agent</Button>} />
          <div role="list" aria-label="Agents" className="mt-5 grid gap-4 lg:grid-cols-2">
            {demoAgentCases.map(({ target, revision, latestRun }) => (
              <Card role="listitem" key={target.id} className="bg-muted/15">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{target.name}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{target.description}</p>
                    </div>
                    <Badge variant="outline">DEMO</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                  <Detail label="Revision" value={`R${revision?.revision ?? 1}`} />
                  <Detail label="Evaluate status" value={formatEvaluationStatus(latestRun?.status)} />
                  <Detail label="Runtime" value={revision?.adapter ?? revision?.model ?? "Demo runtime"} />
                  <Detail label="Tools" value={`${revision?.tools.length ?? 0} configured`} />
                </CardContent>
              </Card>
            ))}
            {state.agents.filter((agent) => agent.source === "SESSION").map((agent) => {
              const revision = state.agentRevisions.find((item) => item.id === agent.activeDraftRevisionId);
              return <Card role="listitem" key={agent.id}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">{agent.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{agent.description}</p></div><Badge variant="outline" className="border-primary/30 text-primary">SESSION</Badge></div></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2"><Detail label="Owner" value={agent.owner} /><Detail label="Revision" value={`R${revision?.revision ?? 1} · ${revision?.status ?? "DRAFT"}`} /><Detail label="Runtime" value={revision?.runtimeType ?? "—"} /><Detail label="Dependencies" value={`${revision?.mcpIds.length ?? 0} MCP · ${revision?.skillIds.length ?? 0} Skills · ${revision?.knowledgeBaseIds.length ?? 0} KB`} /></CardContent></Card>;
            })}
            {!demoAgentCases.length && !state.agents.some((agent) => agent.source === "SESSION") ? <Empty title="No Agents yet" description="Create the supporting resources, then assemble your first Agent." /> : null}
          </div>
        </TabsContent>

        {(["mcp", "skill", "knowledge-base"] as const).map((kind) => {
          const item = tabs.find((candidate) => candidate.value === kind)!;
          return <TabsContent key={kind} value={kind} className="mt-5"><SectionHeader title={`${item.label}s`} description={kind === "mcp" ? "Describe tool connections and authentication shapes without contacting them." : kind === "skill" ? "Define reusable Agent capabilities." : "Register approved knowledge sources for build-time selection."} action={<Button onClick={() => { setEditing(null); setResourceDialog(kind); }}><Plus />Create {item.label}</Button>} /><div className="mt-4 grid gap-4 lg:grid-cols-2">{resources[kind].map((resource) => <ResourceCard key={resource.id} resource={resource} onEdit={() => { setEditing(resource); setResourceDialog(kind); }} onDelete={() => remove(kind, resource.id)} />)}{!resources[kind].length ? <Empty title={`No session ${item.label}s`} description={`Create a prefilled ${item.label} to use in an Agent build.`} /> : null}</div></TabsContent>;
        })}
      </Tabs>

      {resourceDialog ? <ResourceFormDialog kind={resourceDialog} open {...(editing ? { initialValue: editing } : {})} onOpenChange={(open) => { if (!open) { setResourceDialog(null); setEditing(null); } }} onSubmit={(value) => saveResource(resourceDialog, value)} /> : null}
      <AgentForm open={agentOpen} onOpenChange={setAgentOpen} mcpServers={state.mcpServers} skills={state.skills} knowledgeBases={state.knowledgeBases} onSubmit={(input) => { const created = store.createAgent(input, "agent-wizard"); setNotice(`${created.name} R1 draft created.`); }} />
    </div>
  );
}

export function CreatePage({
  initialTab = "create",
}: {
  initialTab?: "create" | "builds";
} = {}) {
  const [workspaceTab, setWorkspaceTab] = useState(initialTab);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Build"
        description="Create technical resources and manage immutable Agent revisions in one session-only workspace."
      />
      <Tabs
        value={workspaceTab}
        onValueChange={(value) => setWorkspaceTab(value as typeof workspaceTab)}
      >
        <TabsList className="h-auto w-full justify-start rounded-lg border bg-card p-1">
          <TabsTrigger value="create" className="min-h-10 px-5">Create</TabsTrigger>
          <TabsTrigger value="builds" className="min-h-10 px-5">My Builds</TabsTrigger>
        </TabsList>
        <TabsContent value="create" className="mt-6">
          <CreateWorkspaceContent />
        </TabsContent>
        <TabsContent value="builds" className="mt-6">
          <BuildsPage embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <Card><CardContent className="p-5"><span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span><strong className="mt-2 block text-3xl tabular-nums">{value}</strong></CardContent></Card>; }
function SectionHeader({ title, description, action }: { title: string; description: string; action: React.ReactNode }) { return <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p></div>{action}</div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block font-medium">{value}</strong></div>; }
function formatEvaluationStatus(status?: string) { return status ? status.charAt(0) + status.slice(1).toLowerCase() : "Not evaluated"; }
function Empty({ title, description }: { title: string; description: string }) { return <Card className="border-dashed lg:col-span-2"><CardContent className="grid min-h-40 place-items-center p-8 text-center"><div><strong>{title}</strong><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></CardContent></Card>; }
function ResourceCard({ resource, onEdit, onDelete }: { resource: Resource; onEdit(): void; onDelete(): void }) { const detail = "endpoint" in resource ? resource.endpoint : "sourceType" in resource ? resource.sourceType : resource.description; const isSession = resource.source === "SESSION"; return <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{resource.name}</CardTitle><p className="mt-1 break-all text-sm text-muted-foreground">{detail}</p></div><Badge variant="outline" className={isSession ? "border-primary/30 text-primary" : undefined}>{isSession ? "SESSION" : "DEMO"}</Badge></div></CardHeader><CardContent className={isSession ? "flex justify-end gap-2" : "text-xs text-muted-foreground"}>{isSession ? <><Button variant="outline" onClick={onEdit}>Edit</Button><Button variant="ghost" size="icon" aria-label={`Delete ${resource.name}`} onClick={onDelete}><Trash2 className="size-4" /></Button></> : "Ready to attach to Agent builds."}</CardContent></Card>; }
