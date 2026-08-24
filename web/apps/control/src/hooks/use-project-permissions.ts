import { useDemoRole } from "@/hooks/use-demo-role";
import { useProject } from "@/hooks/use-project";
import type {
  ProjectPermissions,
  ProjectRole,
} from "@/types/project";

export function permissionsForRole(role: ProjectRole): ProjectPermissions {
  const isManager = role === "admin";
  const isCompliance = role === "compliance";
  // Security-evaluation roles (ADA/ISS) are read-only; FRT also operates agents.
  const isReadOnlyEvaluator = role === "ada" || role === "iss";
  const isFirstResponse = role === "frt";
  return {
    canCreateAgents: role === "admin" || role === "member",
    canCreateProject: isManager,
    canDeleteProject: role === "admin",
    canInviteMembers: isManager,
    canManageResources: isManager,
    canManageProject: isManager,
    // Traceability: every security role can inspect audit logs.
    canViewAuditLogs: isManager || isCompliance || isReadOnlyEvaluator || isFirstResponse,
    canViewResources: true,
  };
}

/**
 * Resolves the role used for all permission checks. A frontend-only demo
 * override ("view as") wins over the real project role so access control can
 * be demonstrated without backend support.
 */
export function useEffectiveProjectRole(role?: ProjectRole): ProjectRole {
  const { roleOverride } = useDemoRole();
  const { currentProject } = useProject();
  return roleOverride ?? role ?? currentProject?.role ?? "member";
}

export function useProjectPermissions(
  role?: ProjectRole,
): ProjectPermissions {
  return permissionsForRole(useEffectiveProjectRole(role));
}
