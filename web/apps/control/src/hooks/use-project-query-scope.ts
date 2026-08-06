import { useMemo } from "react";
import { useProject } from "@/hooks/use-project";

export function projectQueryKey<const Parts extends readonly unknown[]>(
  projectId: string,
  ...parts: Parts
) {
  return ["project", projectId, ...parts] as const;
}

export function useProjectQueryScope() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id ?? "unavailable";

  return useMemo(
    () => ({
      key: <const Parts extends readonly unknown[]>(...parts: Parts) =>
        projectQueryKey(projectId, ...parts),
      projectId,
    }),
    [projectId],
  );
}
