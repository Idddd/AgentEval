import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
  getStoredProjectId,
  projectIdFromPathname,
  projectPath,
  replaceProjectInPath,
  storeProjectId,
} from "@/lib/project-storage";
import { getProjects } from "@/services/project";
import {
  selectInitialProject,
  PROJECT_CHANGED_EVENT,
  ProjectContext,
} from "@/components/project/project-context";
import type { Project } from "@/types/project";

function projectIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return projectIdFromPathname(window.location.pathname);
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingProjectId, setSwitchingProjectId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const replaceProjectInUrl = useCallback(
    (projectId: string) => {
      if (typeof window === "undefined") return;
      const nextUrl = new URL(window.location.href);
      nextUrl.pathname = projectIdFromPathname(nextUrl.pathname)
        ? replaceProjectInPath(nextUrl.pathname, projectId)
        : projectPath(projectId);
      router.history.replace(
        `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
      );
    },
    [router],
  );

  const refreshProjects = useCallback(async () => {
    const projects = await getProjects();
    const selected =
      projects.find((project) => project.id === currentProject?.id) ??
      projects.find((project) => project.type === "personal") ??
      projects[0] ??
      null;
    setAvailableProjects(projects);
    setCurrentProject(selected);
    setError(selected ? "" : "No project available.");
    if (selected) {
      storeProjectId(selected.id);
      replaceProjectInUrl(selected.id);
    }
    return projects;
  }, [currentProject?.id, replaceProjectInUrl]);

  useEffect(() => {
    let disposed = false;
    const initialize = async () => {
      setLoading(true);
      setError("");
      try {
        const loaded = await getProjects();
        if (disposed) return;
        if (!loaded.length) {
          setAvailableProjects([]);
          setCurrentProject(null);
          setError("No project available.");
          return;
        }
        const projects = loaded;
        const urlProjectId = projectIdFromUrl();
        const storedProjectId = getStoredProjectId();
        const selected = selectInitialProject(
          projects,
          urlProjectId,
          storedProjectId,
        );
        setAvailableProjects(projects);
        setCurrentProject(selected);
        storeProjectId(selected.id);
        replaceProjectInUrl(selected.id);
      } catch (reason) {
        if (disposed) return;
        setAvailableProjects([]);
        setCurrentProject(null);
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load projects.",
        );
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void initialize();
    return () => {
      disposed = true;
    };
  }, [replaceProjectInUrl]);

  const selectProject = useCallback(
    async (projectId: string) => {
      let projectList = availableProjects;
      let nextProject = projectList.find(
        (project) => project.id === projectId,
      );
      if (!nextProject) {
        projectList = await getProjects();
        setAvailableProjects(projectList);
        nextProject = projectList.find((project) => project.id === projectId);
      }
      if (
        switchingProjectId ||
        !nextProject ||
        nextProject.id === currentProject?.id
      ) return;

      setSwitchingProjectId(nextProject.id);
      setError("");
      try {
        if (currentProject) {
          await queryClient.cancelQueries({
            queryKey: ["project", currentProject.id],
          });
        }
        await queryClient.invalidateQueries({
          queryKey: ["project", nextProject.id],
          refetchType: "none",
        });
        setCurrentProject(nextProject);
        storeProjectId(nextProject.id);
        replaceProjectInUrl(nextProject.id);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(PROJECT_CHANGED_EVENT, {
              detail: {
                previousProjectId: currentProject?.id,
                projectId: nextProject.id,
              },
            }),
          );
        }
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to switch projects.",
        );
        throw reason;
      } finally {
        setSwitchingProjectId(null);
      }
    },
    [
      availableProjects,
      currentProject?.id,
      queryClient,
      replaceProjectInUrl,
      switchingProjectId,
    ],
  );

  useEffect(() => {
    const syncFromHistory = () => {
      const projectId = projectIdFromUrl();
      if (!currentProject) return;
      if (!projectId) {
        router.history.replace(projectPath(currentProject.id));
        return;
      }
      if (projectId === currentProject.id) return;
      if (availableProjects.some((project) => project.id === projectId)) {
        void selectProject(projectId);
      } else {
        replaceProjectInUrl(currentProject.id);
      }
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, [
    availableProjects,
    currentProject,
    replaceProjectInUrl,
    router,
    selectProject,
  ]);

  const value = useMemo(
    () => ({
      availableProjects,
      currentProject,
      error,
      isSwitching: switchingProjectId !== null,
      loading,
      refreshProjects,
      selectProject,
      switchingProjectId,
    }),
    [
      availableProjects,
      currentProject,
      error,
      loading,
      refreshProjects,
      selectProject,
      switchingProjectId,
    ],
  );

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}
