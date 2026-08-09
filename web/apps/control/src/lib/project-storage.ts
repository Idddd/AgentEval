export const CURRENT_PROJECT_STORAGE_KEY = "currentProject";

export function projectIdFromPathname(pathname: string): string | null {
  const [projectId] = pathname.split("/").filter(Boolean);
  if (!projectId || projectId === "login" || projectId === "auth") return null;
  try {
    return decodeURIComponent(projectId);
  } catch {
    return null;
  }
}

export function projectPath(projectId: string, path = "/"): string {
  const suffix = path === "/" ? "" : `/${path.replace(/^\/+|\/+$/g, "")}`;
  return `/${encodeURIComponent(projectId)}${suffix}`;
}

export function replaceProjectInPath(pathname: string, projectId: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return projectPath(projectId, parts.length > 1 ? parts.slice(1).join("/") : "/");
}

export function getStoredProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CURRENT_PROJECT_STORAGE_KEY);
}

export function storeProjectId(projectId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, projectId);
}

export function clearStoredProjectId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CURRENT_PROJECT_STORAGE_KEY);
}
