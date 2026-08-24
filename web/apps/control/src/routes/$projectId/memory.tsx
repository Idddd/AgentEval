import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BrainCircuit,
  Database,
  FileText,
  History,
  Search,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusDot } from "@/components/shared/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCurrentProjectId } from "@/hooks/use-project";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { api } from "@/lib/api";

export const Route = createFileRoute("/$projectId/memory")({
  component: Memory,
});

const memoryStages = [
  {
    icon: FileText,
    label: "Curated memory",
    description: "Stable preferences and decisions live in MEMORY.md.",
  },
  {
    icon: History,
    label: "Daily notes",
    description: "Dated notes preserve useful context without rewriting history.",
  },
  {
    icon: Search,
    label: "Semantic recall",
    description: "Hybrid mode recalls relevant context through an approved embedding model.",
  },
] as const;

function Memory() {
  const projectId = useCurrentProjectId();
  const scope = useProjectQueryScope();
  const agents = useQuery({
    queryKey: scope.key("agents"),
    queryFn: api.listAgents,
    refetchInterval: 5_000,
  });
  const modelDeployments = useQuery({
    queryKey: scope.key("model-deployments"),
    queryFn: api.listModelDeployments,
  });
  const openClawAgents = (agents.data ?? []).filter(
    (agent) => agent.agentPlatform === "openclaw",
  );
  const embeddingModels = (modelDeployments.data ?? []).filter(
    (model) => model.status === "VALIDATED" && model.modelType === "text-embedding",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Memory"
        description="Durable, Instance-isolated context for OpenClaw Agents. Keep native notes or add semantic recall through a validated embedding model."
        badge={<Badge variant="outline">OpenClaw</Badge>}
        actions={(
          <Button asChild className="h-11">
            <Link
              to="/$projectId/instances"
              params={{ projectId }}
              search={{ create: "instance", platform: "openclaw" }}
            >
              Configure an Instance <ArrowRight />
            </Link>
          </Button>
        )}
      />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>How OpenClaw remembers</CardTitle>
          <CardDescription>
            Memory follows a deliberate path inside each OpenShell sandbox; it is not shared across Instances.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-0 p-0 md:grid-cols-3">
          {memoryStages.map((stage, index) => (
            <div
              key={stage.label}
              className="relative min-h-36 border-b p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
            >
              <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
                <stage.icon className="size-4" />
              </span>
              <strong className="mt-4 block text-sm">{stage.label}</strong>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{stage.description}</p>
              <span className="absolute right-4 top-4 font-mono text-[10px] text-muted-foreground">
                0{index + 1}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <BrainCircuit className="size-5 text-primary" /> Memory modes
            </CardTitle>
            <CardDescription>Choose the least complex mode that matches the work.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            <div className="p-5">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm">Native memory</strong>
                <Badge>Recommended</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                OpenClaw maintains curated memory and daily notes without an embedding dependency or additional model cost.
              </p>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm">Hybrid memory</strong>
                <Badge variant="outline">Optional</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Adds semantic recall through LiteLLM. TaskLattice binds one validated text-embedding deployment inside the same compliance boundary.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" /> Security boundary
            </CardTitle>
            <CardDescription>Remembering context never expands Agent authority.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5 text-xs leading-5 text-muted-foreground">
            <p><strong className="text-foreground">Instance isolated.</strong> Memory files remain inside the Instance OpenShell sandbox.</p>
            <p><strong className="text-foreground">Policy governed.</strong> Access and Runtime Policies continue to decide which tools, files, and endpoints the Agent may use.</p>
            <p><strong className="text-foreground">Credential safe.</strong> Instructions explicitly prohibit writing secrets, tokens, or credentials into memory.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>OpenClaw Instances</CardTitle>
              <CardDescription className="mt-1">Memory state currently assigned during Instance creation.</CardDescription>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {openClawAgents.length} Instance{openClawAgents.length === 1 ? "" : "s"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {agents.isPending ? (
            <p className="p-5 text-sm text-muted-foreground">Loading OpenClaw Instances…</p>
          ) : agents.error ? (
            <p role="alert" className="m-5 border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive">
              {agents.error.message}
            </p>
          ) : openClawAgents.length ? (
            <div>
              <div className="hidden grid-cols-[minmax(0,1fr)_10rem_10rem_auto] gap-4 border-b bg-muted/20 px-5 py-3 text-xs text-muted-foreground md:grid">
                <span>Instance</span><span>Memory</span><span>Scope</span><span>Status</span>
              </div>
              {openClawAgents.map((agent) => (
                <Link
                  key={agent.id}
                  to="/$projectId/instances/$instanceId"
                  params={{ projectId, instanceId: agent.id }}
                  className="grid min-h-20 gap-3 border-b px-5 py-4 transition-colors last:border-b-0 hover:bg-muted/35 focus-visible:outline-2 focus-visible:outline-offset-[-2px] md:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] md:items-center"
                >
                  <span className="min-w-0">
                    <strong className="block truncate text-sm">{agent.name}</strong>
                    <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">{agent.id}</span>
                  </span>
                  <span className="text-xs font-medium">
                    {agent.memory ? (agent.memory.mode === "hybrid" ? "Hybrid recall" : "Native notes") : "Not enabled"}
                  </span>
                  <span className="text-xs text-muted-foreground">Instance sandbox</span>
                  <StatusDot
                    label={agent.status === "READY" ? "Ready" : agent.status.toLowerCase()}
                    tone={agent.status === "READY" ? "success" : agent.status === "FAILED" ? "danger" : "neutral"}
                  />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BrainCircuit}
              title="No OpenClaw Instances"
              description="Create an OpenClaw Instance and enable Memory in Define Work."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Database className="size-5" /> Embedding readiness</CardTitle>
              <CardDescription className="mt-1">Validated deployments available for Hybrid memory.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/$projectId/setting" params={{ projectId }} search={{ section: "model-routings" }}>
                Manage Model and Routing
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {modelDeployments.isPending ? (
            <p className="p-5 text-sm text-muted-foreground">Checking registered models…</p>
          ) : embeddingModels.length ? (
            embeddingModels.map((model) => (
              <div key={model.id} className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b px-5 py-3 last:border-b-0">
                <span className="min-w-0">
                  <strong className="block truncate text-sm">{model.displayName}</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">{model.providerName} · {model.complianceDomain}</span>
                </span>
                <StatusDot label="Validated" tone="success" />
              </div>
            ))
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              No validated text-embedding deployment is registered. Native memory remains available without one.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
