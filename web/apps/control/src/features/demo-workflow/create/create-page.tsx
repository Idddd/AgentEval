import { useMemo, useState } from "react";
import { ArrowRight, Bot, Database, GitBranch, Network, Pencil, Plus, Puzzle, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEvaluationLayerState } from "@/features/evaluation-layer/mock-provider";
import { useDemoWorkflowProjectId, useDemoWorkflowState, useDemoWorkflowStore } from "../provider";
import type { DemoAgentInput, DemoKnowledgeBase, DemoMcpServer, DemoSkill } from "../model";
import { AgentForm, agentFormDefaults } from "./agent-form";
import {
  AgentBuildDetailSheet,
  type AgentBuildSelection,
} from "./agent-build-detail-sheet";
import {
  ResourceFormDialog,
  type ResourceFormKind,
  type ResourceFormValue,
} from "./resource-form-dialog";
import { ResourceDetailSheet, type BuildResource } from "./resource-detail-sheet";

type Resource = BuildResource;

const tabs = [
  { value: "agent", label: "Agent", icon: Bot },
  { value: "mcp", label: "MCP Server", icon: Network },
  { value: "skill", label: "Skill", icon: Puzzle },
  { value: "knowledge-base", label: "Knowledge Base", icon: Database },
] as const;

function CreateWorkspaceContent() {
  const projectId = useDemoWorkflowProjectId();
  const state = useDemoWorkflowState();
  const evaluationState = useEvaluationLayerState();
  const store = useDemoWorkflowStore();
  const [tab, setTab] = useState<(typeof tabs)[number]["value"]>("agent");
  const [resourceDialog, setResourceDialog] = useState<ResourceFormKind | null>(null);
  const [resourceDetail, setResourceDetail] = useState<{ kind: ResourceFormKind; id: string } | null>(null);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [buildSelection, setBuildSelection] = useState<AgentBuildSelection | null>(null);
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
      })
      .sort((left, right) => {
        if (left.target.id === "demo-onboarding-assistant") return -1;
        if (right.target.id === "demo-onboarding-assistant") return 1;
        return 0;
      }),
    [evaluationState.runs, evaluationState.targetRevisions, evaluationState.targets],
  );
  const editingAgent = editingAgentId
    ? state.agents.find((agent) => agent.id === editingAgentId)
    : undefined;
  const editingAgentRevision = editingAgent?.activeDraftRevisionId
    ? state.agentRevisions.find((revision) => revision.id === editingAgent.activeDraftRevisionId)
    : undefined;
  const editingAgentValue: DemoAgentInput | undefined = editingAgent && editingAgentRevision
    ? {
        name: editingAgent.name,
        owner: editingAgent.owner === "Unassigned" ? "" : editingAgent.owner,
        description: editingAgent.description,
        businessOutcome: editingAgent.businessOutcome,
        targetUsers: editingAgent.targetUsers,
        typicalScenarios: [...editingAgent.typicalScenarios],
        runtimeType: editingAgentRevision.runtimeType,
        model: editingAgentRevision.model,
        endpoint: editingAgentRevision.endpoint,
        mcpIds: [...editingAgentRevision.mcpIds],
        skillIds: [...editingAgentRevision.skillIds],
        knowledgeBaseIds: [...editingAgentRevision.knowledgeBaseIds],
      }
    : undefined;
  const selectedResource = resourceDetail
    ? resources[resourceDetail.kind].find((resource) => resource.id === resourceDetail.id) ?? null
    : null;

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

  const duplicateResource = (kind: ResourceFormKind, resource: Resource) => {
    try {
      setError("");
      const name = nextCopyName(resource.name, resources[kind].map((item) => item.name));
      let created: Resource | undefined;
      if (kind === "mcp" && "endpoint" in resource) {
        created = store.createMcpServer({ name, endpoint: resource.endpoint, authType: resource.authType }, "agent-wizard");
      } else if (kind === "skill" && "description" in resource && !("sourceType" in resource)) {
        created = store.createSkill({ name, description: resource.description }, "agent-wizard");
      } else if (kind === "knowledge-base" && "sourceType" in resource) {
        created = store.createKnowledgeBase({ name, sourceType: resource.sourceType, description: resource.description }, "agent-wizard");
      }
      setNotice(`${name} copied to this session and is ready to edit.`);
      return created;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to clone resource");
      return undefined;
    }
  };

  const duplicateDemoAgent = (targetId: string) => {
    const target = evaluationState.targets.find((item) => item.id === targetId);
    const revision = evaluationState.targetRevisions.find((item) => item.id === target?.currentRevisionId);
    if (!target) return;
    try {
      const created = store.createAgent({
        ...agentFormDefaults,
        name: nextCopyName(target.name, state.agents.map((item) => item.name)),
        owner: "",
        description: target.description,
        runtimeType: "Managed cloud",
        model: "GPT-5",
        endpoint: revision?.endpoint ?? `https://demo.invalid/agents/${target.id}`,
        mcpIds: [],
        skillIds: [],
        knowledgeBaseIds: [],
      }, "agent-wizard");
      setNotice(`${created.name} created as an editable draft.`);
      return created;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to clone Agent");
      return undefined;
    }
  };

  const editDemoAgent = (targetId: string) => {
    const created = duplicateDemoAgent(targetId);
    if (!created) return;
    setBuildSelection(null);
    setEditingAgentId(created.id);
    setAgentOpen(true);
  };

  const createNewVersion = (agentId: string) => {
    try {
      const revision = store.createAgentRevision(agentId, "agent-wizard");
      setBuildSelection({ kind: "workflow", agentId });
      setNotice(`R${revision.revision} created and ready to edit.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create a new version");
    }
  };

  return (
    <div className="space-y-7">
      {notice ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-lg bg-muted/60 p-1">
          {tabs.map((item) => <TabsTrigger key={item.value} value={item.value} className="min-h-10 gap-2 px-4"><item.icon className="size-4" />{item.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="agent" className="mt-5">
          <SectionHeader
            title="Agents"
            description="Build an Agent here, then continue to Evaluate when it is ready."
            action={(
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => { setEditingAgentId(null); setAgentOpen(true); }}>
                  <Plus />Create Agent
                </Button>
                <Button asChild>
                  <a href={`/${projectId}/evaluation/catalog`}>
                    Continue to Evaluate <ArrowRight />
                  </a>
                </Button>
              </div>
            )}
          />
          <div role="list" aria-label="Agents" className="mt-5 grid gap-4 lg:grid-cols-2">
            {demoAgentCases.map(({ target, revision, latestRun }) => (
              <div role="listitem" key={target.id} className="h-full">
                  <Card className="h-full overflow-hidden bg-white transition-colors hover:border-primary/35 dark:bg-card">
                    <button type="button" aria-label={`View ${target.name} build details`} className="block w-full text-left outline-none hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40" onClick={() => setBuildSelection({ kind: "evaluation", targetId: target.id })}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">{target.name}</CardTitle>
                          <p className="mt-1 text-sm text-muted-foreground">{target.description}</p>
                        </div>
                        <BuildStateBadge status={latestRun?.status ?? "NOT_EVALUATED"} />
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                      <Detail label="Revision" value={`R${revision?.revision ?? 1}`} />
                      <Detail label="Runtime" value={revision?.adapter ?? revision?.model ?? "Demo runtime"} />
                      <Detail label="Tools" value={`${revision?.tools.length ?? 0} configured`} />
                    </CardContent>
                    </button>
                  </Card>
              </div>
            ))}
            {state.agents.filter((agent) => agent.source === "SESSION").map((agent) => {
              const revision = state.agentRevisions.find((item) => item.id === agent.activeDraftRevisionId) ?? state.agentRevisions.find((item) => item.id === agent.currentApprovedRevisionId);
              return (
                <div role="listitem" key={agent.id} className="h-full">
                    <Card className="h-full overflow-hidden bg-white transition-colors hover:border-primary/35 dark:bg-card">
                      <button type="button" aria-label={`View ${agent.name} build details`} className="block w-full text-left outline-none hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40" onClick={() => setBuildSelection({ kind: "workflow", agentId: agent.id })}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div><CardTitle className="text-lg">{agent.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{agent.description}</p></div>
                          <BuildStateBadge status={revision?.status ?? "DRAFT"} />
                        </div>
                      </CardHeader>
                      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                        <Detail label="Owner" value={agent.owner} />
                        <Detail label="Revision" value={`R${revision?.revision ?? 1} · ${revision?.status ?? "DRAFT"}`} />
                        <Detail label="Runtime" value={revision?.runtimeType ?? "—"} />
                        <Detail label="Dependencies" value={`${revision?.mcpIds.length ?? 0} MCP · ${revision?.skillIds.length ?? 0} Skills · ${revision?.knowledgeBaseIds.length ?? 0} KB`} />
                      </CardContent>
                      </button>
                      <CardContent className="flex flex-wrap justify-end gap-2 border-t px-4 py-3">
                        {agent.activeDraftRevisionId && revision && !["PUBLISHED", "APPROVED", "REJECTED"].includes(revision.status) ? <Button size="sm" variant="outline" aria-label={`Edit ${agent.name} draft`} onClick={() => { setEditingAgentId(agent.id); setAgentOpen(true); }}><Pencil />Edit draft</Button> : null}
                        {!agent.activeDraftRevisionId && agent.currentApprovedRevisionId ? <Button size="sm" variant="outline" aria-label={`Create new ${agent.name} version`} onClick={() => createNewVersion(agent.id)}><GitBranch />New version</Button> : null}
                        {revision?.status === "DRAFT" ? <Button size="icon-sm" variant="ghost" aria-label={`Delete ${agent.name} draft`} onClick={() => store.deleteAgentDraft(revision.id, "agent-wizard")}><Trash2 /></Button> : null}
                      </CardContent>
                    </Card>
                </div>
              );
            })}
            {!demoAgentCases.length && !state.agents.some((agent) => agent.source === "SESSION") ? <Empty title="No Agents yet" description="Create the supporting resources, then assemble your first Agent." /> : null}
          </div>
        </TabsContent>

        {(["mcp", "skill", "knowledge-base"] as const).map((kind) => {
          const item = tabs.find((candidate) => candidate.value === kind)!;
          return <TabsContent key={kind} value={kind} className="mt-5"><SectionHeader title={`${item.label}s`} description={kind === "mcp" ? "Describe tool connections and authentication shapes without contacting them." : kind === "skill" ? "Define reusable Agent capabilities." : "Register approved knowledge sources for build-time selection."} action={<Button onClick={() => { setEditing(null); setResourceDialog(kind); }}><Plus />Create {item.label}</Button>} /><div className="mt-4 grid gap-4 lg:grid-cols-2">{resources[kind].map((resource) => <ResourceCard key={resource.id} resource={resource} onOpen={() => setResourceDetail({ kind, id: resource.id })} />)}{!resources[kind].length ? <Empty title={`No session ${item.label}s`} description={`Create a prefilled ${item.label} to use in an Agent build.`} /> : null}</div></TabsContent>;
        })}
      </Tabs>

      {resourceDialog ? <ResourceFormDialog kind={resourceDialog} open {...(editing ? { initialValue: editing } : {})} onOpenChange={(open) => { if (!open) { setResourceDialog(null); setEditing(null); } }} onSubmit={(value) => saveResource(resourceDialog, value)} /> : null}
      <ResourceDetailSheet kind={resourceDetail?.kind ?? null} resource={selectedResource} onOpenChange={(open) => { if (!open) setResourceDetail(null); }} onEdit={() => { if (!resourceDetail || !selectedResource) return; const editable = selectedResource.source === "SESSION" ? selectedResource : duplicateResource(resourceDetail.kind, selectedResource); if (!editable) return; setResourceDetail(null); setEditing(editable); setResourceDialog(resourceDetail.kind); }} onDelete={() => { if (!resourceDetail || !selectedResource) return; remove(resourceDetail.kind, selectedResource.id); setResourceDetail(null); }} onDuplicate={() => { if (!resourceDetail || !selectedResource) return; duplicateResource(resourceDetail.kind, selectedResource); }} />
      <AgentForm open={agentOpen} {...(editingAgentValue ? { initialValue: editingAgentValue, title: `Edit ${editingAgent?.name ?? "Agent"}`, submitLabel: "Save Agent draft" } : {})} onOpenChange={(open) => { setAgentOpen(open); if (!open) setEditingAgentId(null); }} mcpServers={state.mcpServers} skills={state.skills} knowledgeBases={state.knowledgeBases} onSubmit={(input) => { if (editingAgentId) { const updated = store.updateAgentDraftDetails(editingAgentId, input, "agent-wizard"); setNotice(`${updated.name} draft updated.`); setEditingAgentId(null); } else { const created = store.createAgent(input, "agent-wizard"); setNotice(`${created.name} R1 draft created.`); } }} />
      <AgentBuildDetailSheet selection={buildSelection} onDuplicateDemoAgent={duplicateDemoAgent} onEditDemoAgent={editDemoAgent} onOpenChange={(open) => { if (!open) setBuildSelection(null); }} />
    </div>
  );
}

export function CreatePage() {
  return (
    <div className="space-y-7">
      <PageHeader
        title="Build"
        description="Create technical resources and manage immutable Agent revisions in one session-only workspace."
      />
      <CreateWorkspaceContent />
    </div>
  );
}

function SectionHeader({ title, description, action }: { title: string; description: string; action: React.ReactNode }) { return <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p></div>{action}</div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block font-medium">{value}</strong></div>; }
function formatEvaluationStatus(status?: string) { return status ? status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ") : "Not evaluated"; }
function BuildStateBadge({ status }: { status: string }) { const attention = ["FAILED", "PARTIAL", "VALIDATION_FAILED", "REJECTED"].includes(status); const active = ["RUNNING", "QUEUED", "VALIDATING", "BUSINESS_EVALUATING"].includes(status); const complete = ["COMPLETED", "VALIDATED", "APPROVED", "PUBLISHED"].includes(status); return <Badge variant="outline" className={attention ? "border-destructive/30 bg-destructive/5 text-destructive" : active ? "border-primary/30 bg-primary/5 text-primary" : complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : undefined}>{formatEvaluationStatus(status)}</Badge>; }
function Empty({ title, description }: { title: string; description: string }) { return <Card className="border-dashed lg:col-span-2"><CardContent className="grid min-h-40 place-items-center p-8 text-center"><div><strong>{title}</strong><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></CardContent></Card>; }
function ResourceCard({ resource, onOpen }: { resource: Resource; onOpen(): void }) { const detail = "endpoint" in resource ? resource.endpoint : "sourceType" in resource ? resource.sourceType : resource.description; const isSession = resource.source === "SESSION"; return <Card className="overflow-hidden bg-white transition-colors hover:border-primary/35 dark:bg-card"><button type="button" aria-label={`View ${resource.name} details`} className="block w-full text-left outline-none hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40" onClick={onOpen}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{resource.name}</CardTitle><p className="mt-1 break-all text-sm text-muted-foreground">{detail}</p></div><Badge variant="outline" className={isSession ? "border-primary/30 bg-primary/5 text-primary" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{isSession ? "Editable" : "Ready"}</Badge></div></CardHeader><CardContent><span className="text-xs text-muted-foreground">{isSession ? "Editable session resource" : "Read-only starter resource"}</span></CardContent></button></Card>; }
function nextCopyName(name: string, existingNames: string[]): string { const names = new Set(existingNames.map((item) => item.toLowerCase())); let candidate = `${name} Copy`; let suffix = 2; while (names.has(candidate.toLowerCase())) candidate = `${name} Copy ${suffix++}`; return candidate; }
