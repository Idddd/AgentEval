import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Gauge, LockKeyhole, ShieldCheck, Trash2, Users, Workflow } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectModelRoutingsSettings } from "@/components/project/project-model-routing-settings";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectAvatar } from "@/components/project/project-item";
import { ProjectMembers } from "@/components/project/project-members";
import { ProjectQuotaSettings } from "@/components/project/project-quota-settings";
import { useProject } from "@/hooks/use-project";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { deleteProject } from "@/services/project";
import type { Project } from "@/types/project";

export const Route = createFileRoute("/$projectId/setting/")({
  validateSearch: (search): { section?: ProjectSettingsSection } => {
    const section =
      search.section === "members" ||
      search.section === "model-routings" ||
      search.section === "quota" ||
      search.section === "settings"
        ? search.section
        : undefined;
    return section ? { section } : {};
  },
  component: ProjectSettingsPage,
});

type ProjectSettingsSection =
  | "settings"
  | "members"
  | "model-routings"
  | "quota";

function ProjectSettingsPage() {
  const navigate = Route.useNavigate();
  const { section = "settings" } = Route.useSearch();
  const {
    currentProject: project,
    refreshProjects,
    selectProject,
  } = useProject();
  const permissions = useProjectPermissions(project?.role);

  if (!project) {
    return (
      <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
        Loading Project settings…
      </div>
    );
  }

  if (!permissions.canManageProject) {
    return (
      <section
        className="mx-auto max-w-xl rounded-lg border bg-background p-6"
        aria-labelledby="project-settings-restricted"
      >
        <ShieldCheck className="size-8 text-muted-foreground" />
        <h1
          id="project-settings-restricted"
          className="mt-4 font-heading text-2xl"
        >
          Project settings are restricted
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Only Project administrators can manage Project identity, members,
          Model and Routing settings, and quota. Your personal details remain available
          from Personal profile in the account menu.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project settings"
        description="Manage Project identity, human membership, models, and quota."
      />

      <section className="overflow-hidden rounded-lg border bg-background">
        <div className="flex min-h-[72px] items-center gap-3 border-b px-4">
          <ProjectAvatar className="size-10" project={project} />
          <div className="min-w-0">
            <h2 className="truncate font-heading text-lg">{project.name}</h2>
            <p className="text-xs capitalize text-muted-foreground">
              {project.type === "personal" ? "Default project" : "Team project"} ·{" "}
              {project.role}
            </p>
          </div>
        </div>

        <Tabs
          value={section}
          onValueChange={(value) => {
            void navigate({
              replace: true,
              search: { section: value as ProjectSettingsSection },
            });
          }}
        >
          <TabsList
            variant="line"
            className="w-full justify-start overflow-x-auto overflow-y-hidden px-2"
          >
            <TabsTrigger value="settings" className="h-11">
              <ShieldCheck />
              General
            </TabsTrigger>
            <TabsTrigger value="members" className="h-11">
              <Users />
              Members
            </TabsTrigger>
            <TabsTrigger value="model-routings" className="h-11">
              <Workflow />
              Model and Routing
            </TabsTrigger>
            <TabsTrigger value="quota" className="h-11">
              <Gauge />
              Quota
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="mt-0">
            <ProjectGeneralSettings
              project={project}
              onDeleted={async () => {
                const remaining = await refreshProjects();
                const fallback = remaining.find(
                  (candidate) => candidate.id !== project.id,
                );
                if (fallback) await selectProject(fallback.id);
              }}
            />
          </TabsContent>
          <TabsContent value="members" className="mt-0">
            <ProjectMembers project={project} />
          </TabsContent>
          <TabsContent value="model-routings" className="mt-0">
            <ProjectModelRoutingsSettings
              project={project}
            />
          </TabsContent>
          <TabsContent value="quota" className="mt-0">
            <ProjectQuotaSettings project={project} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function ProjectGeneralSettings({
  onDeleted,
  project,
}: {
  onDeleted: () => void | Promise<void>;
  project: Project;
}) {
  const permissions = useProjectPermissions(project.role);
  const remove = useMutation({
    mutationFn: () => deleteProject(project.id),
    onSuccess: () => onDeleted(),
  });

  return (
    <div className="divide-y">
      <div className="space-y-3 p-5">
        <span className="text-sm font-medium">Project name</span>
        <div className="flex min-h-12 max-w-lg items-center gap-3 border bg-muted/20 px-4">
          <LockKeyhole className="size-4 shrink-0 text-muted-foreground" />
          <strong className="min-w-0 flex-1 truncate text-sm">{project.name}</strong>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Immutable</span>
        </div>
        <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
          Project names are unique across TaskLattice and are permanently fixed at creation. This protects stable URLs, audit records, and resource ownership.
        </p>
      </div>

      <div className="grid gap-1 p-5 text-sm">
        <span className="font-medium">Project ID</span>
        <code className="text-xs text-muted-foreground">{project.id}</code>
      </div>

      {permissions.canDeleteProject && project.type !== "personal" ? (
        <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-sm font-semibold text-destructive">
              Delete Project
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Permanently remove this Project and its isolated resources.
            </p>
          </div>
          <Button
            className="h-11"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Delete ${project.name}? This action cannot be undone.`,
                )
              ) {
                remove.mutate();
              }
            }}
          >
            {remove.isPending ? <Spinner /> : <Trash2 />}
            Delete Project
          </Button>
          {remove.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {remove.error.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
