import { createContext } from "react";
import type { Project } from "@/types/project";

export const PROJECT_CHANGED_EVENT = "project.changed";

export interface ProjectContextValue {
  availableProjects: Project[];
  currentProject: Project | null;
  error: string;
  isSwitching: boolean;
  loading: boolean;
  refreshProjects: () => Promise<Project[]>;
  selectProject: (projectId: string) => Promise<void>;
  switchingProjectId: string | null;
}

export const ProjectContext = createContext<ProjectContextValue | null>(
  null,
);

export function selectInitialProject(
  projects: Project[],
  urlProjectId: string | null,
  storedProjectId: string | null,
): Project {
  const personalProject =
    projects.find((project) => project.type === "personal") ??
    projects[0];
  if (!personalProject) {
    throw new Error("No project available.");
  }
  if (urlProjectId) {
    return (
      projects.find((project) => project.id === urlProjectId) ??
      personalProject
    );
  }
  return (
    projects.find((project) => project.id === storedProjectId) ??
    personalProject
  );
}
