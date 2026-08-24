import { describe, expect, it } from "vitest";
import { permissionsForRole } from "./use-project-permissions";

describe("permissionsForRole", () => {
  it("grants administrators all project management capabilities", () => {
    expect(permissionsForRole("admin")).toEqual({
      canCreateAgents: true,
      canCreateProject: true,
      canDeleteProject: true,
      canInviteMembers: true,
      canManageResources: true,
      canManageProject: true,
      canViewAuditLogs: true,
      canViewResources: true,
    });
  });

  it("keeps members as a strict subset of administrator capabilities", () => {
    expect(permissionsForRole("member")).toEqual({
      canCreateAgents: true,
      canCreateProject: false,
      canDeleteProject: false,
      canInviteMembers: false,
      canManageResources: false,
      canManageProject: false,
      canViewAuditLogs: false,
      canViewResources: true,
    });
  });

  it("grants compliance read-only audit access without management capabilities", () => {
    expect(permissionsForRole("compliance")).toEqual({
      canCreateAgents: false,
      canCreateProject: false,
      canDeleteProject: false,
      canInviteMembers: false,
      canManageResources: false,
      canManageProject: false,
      canViewAuditLogs: true,
      canViewResources: true,
    });
  });

  it("keeps ADA and ISS as read-only evaluators with audit access", () => {
    for (const role of ["ada", "iss"] as const) {
      expect(permissionsForRole(role)).toEqual({
        canCreateAgents: false,
        canCreateProject: false,
        canDeleteProject: false,
        canInviteMembers: false,
        canManageResources: false,
        canManageProject: false,
        canViewAuditLogs: true,
        canViewResources: true,
      });
    }
  });

  it("keeps end users away from build controls", () => {
    expect(permissionsForRole("frt")).toEqual({
      canCreateAgents: false,
      canCreateProject: false,
      canDeleteProject: false,
      canInviteMembers: false,
      canManageResources: false,
      canManageProject: false,
      canViewAuditLogs: true,
      canViewResources: true,
    });
  });
});
