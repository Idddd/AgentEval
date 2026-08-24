import { useContext } from "react";
import { ProjectContext } from "@/components/project/project-context";

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used inside ProjectProvider.");
  }
  return context;
}

export function useCurrentProjectId() {
  return useProject().currentProject?.id ?? "individual";
}
