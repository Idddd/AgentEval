import { getAuthToken } from "@/lib/auth-token";
import type {
  ProjectQuota,
  UpdateProjectQuotaInput,
} from "@tasklattice/contracts";
import type {
  HumanProjectMember,
  Project,
  ProjectRole,
} from "@/types/project";

async function projectRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as T | { error?: string; message?: string } : undefined;
  if (!response.ok) {
    const error = payload as { error?: string; message?: string } | undefined;
    throw new Error(error?.message ?? error?.error ?? `Request failed (${response.status}).`);
  }
  return payload as T;
}

export async function getProjects(): Promise<Project[]> {
  return projectRequest<Project[]>("/api/v1/projects");
}

export async function getProjectMembers(projectId: string): Promise<HumanProjectMember[]> {
  return projectRequest<HumanProjectMember[]>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/members`,
  );
}

export async function createProject(input: {
  confirmImmutableName: true;
  invitations: Array<{ email: string; role: ProjectRole }>;
  name: string;
}): Promise<Project> {
  return projectRequest<Project>("/api/v1/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function renameProject(projectId: string, name: string): Promise<Project> {
  return projectRequest<Project>(
    `/api/v1/projects/${encodeURIComponent(projectId)}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
  );
}

export async function deleteProject(projectId: string): Promise<void> {
  await projectRequest(
    `/api/v1/projects/${encodeURIComponent(projectId)}`,
    { method: "DELETE" },
  );
}

export async function inviteMember(
  projectId: string,
  input: { email: string; role: ProjectRole },
): Promise<HumanProjectMember> {
  return projectRequest<HumanProjectMember>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/members/invitations`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function removeMember(projectId: string, memberId: string): Promise<void> {
  await projectRequest(
    `/api/v1/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(memberId)}`,
    { method: "DELETE" },
  );
}

export async function getProjectQuota(projectId: string): Promise<ProjectQuota> {
  return projectRequest<ProjectQuota>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/quota`,
  );
}

export async function updateProjectQuota(
  projectId: string,
  input: UpdateProjectQuotaInput,
): Promise<ProjectQuota> {
  return projectRequest<ProjectQuota>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/quota`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}
