import { describe, expect, it } from "vitest";
import { DEFAULT_ACCESS_POLICY_ID } from "../access-policies/default-access-policy";
import { AuditLogService } from "../audit-logs/audit-log-service";
import type { AuthPayload, AuthUser } from "../auth/auth";
import type {
  InvitationMailer,
  ProjectInvitationEmail,
} from "../email/smtp-invitation-mailer";
import { createTestPrisma } from "../test/prisma";
import { ProjectService } from "./project-service";

class RecordingInvitationMailer implements InvitationMailer {
  readonly invitations: ProjectInvitationEmail[] = [];

  constructor(
    private readonly configured = true,
    private readonly deliveryError?: Error,
  ) {}

  assertConfigured(): void {
    if (!this.configured) throw new Error("SMTP invitation delivery is not configured.");
  }

  async sendProjectInvitation(invitation: ProjectInvitationEmail): Promise<void> {
    if (this.deliveryError) throw this.deliveryError;
    this.invitations.push(invitation);
  }
}

function auth(
  input: Omit<AuthUser, "id" | "systemRole"> &
    Partial<Pick<AuthUser, "id" | "systemRole">>,
): AuthPayload {
  const user: AuthUser = {
    ...input,
    id:
      input.id ??
      (input.provider === "local" ? "local-admin" : `test-${input.username}`),
    systemRole:
      input.systemRole ??
      (input.provider === "local" ? "super_administrator" : "user"),
  };
  return {
    exp: Number.MAX_SAFE_INTEGER,
    iat: 0,
    iss: "tasklattice",
    sub: user.id,
    user,
  };
}

describe("ProjectService", () => {
  it("creates the default project and copies SQL-seeded metadata into teams", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const local = auth({
      displayName: "Local Administrator",
      email: "admin@tasklattice.local",
      provider: "local",
      username: "admin",
    });

    expect(await service.list(local)).toEqual([
      expect.objectContaining({
        id: "individual",
        name: "admin",
        role: "admin",
        type: "personal",
      }),
    ]);

    const team = await service.create(local, "AI Platform", []);
    expect(team).toMatchObject({
      name: "AI Platform",
      role: "admin",
      type: "team",
    });
    expect(
      await db.skillRecord.count({
        where: { projectId: team.id },
      }),
    ).toBe(
      await db.skillRecord.count({
        where: { projectId: "individual" },
      }),
    );
    for (const projectId of ["individual", team.id]) {
      const policy = await db.accessPolicyRecord.findUnique({
        where: {
          projectId_id: { projectId, id: DEFAULT_ACCESS_POLICY_ID },
        },
      });
      expect(policy?.payload).toMatchObject({
        id: DEFAULT_ACCESS_POLICY_ID,
        name: "Default",
        status: "ACTIVE",
        serverRules: [],
        revision: 1,
        createdBy: "system:setup",
      });
      expect(
        await db.accessPolicyVersionRecord.count({
          where: { projectId, policyId: DEFAULT_ACCESS_POLICY_ID },
        }),
      ).toBe(1);
    }
  });

  it("initializes the personal Project quota idempotently under concurrent requests", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const local = auth({
      displayName: "Local Administrator",
      email: "admin@tasklattice.local",
      provider: "local",
      username: "admin",
    });
    await db.projectQuotaRecord.deleteMany({
      where: { projectId: "individual" },
    });

    await Promise.all(
      Array.from({ length: 4 }, () => service.ensureUser(local)),
    );

    expect(
      await db.projectQuotaRecord.count({
        where: { projectId: "individual" },
      }),
    ).toBe(1);
  });

  it("initializes the default deny-all Access Policy idempotently", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const local = auth({
      displayName: "Local Administrator",
      email: "admin@tasklattice.local",
      provider: "local",
      username: "admin",
    });
    await db.accessPolicyRecord.delete({
      where: {
        projectId_id: {
          projectId: "individual",
          id: DEFAULT_ACCESS_POLICY_ID,
        },
      },
    });

    await Promise.all(
      Array.from({ length: 4 }, () => service.ensureUser(local)),
    );

    const policies = await db.accessPolicyRecord.findMany({
      where: { projectId: "individual", id: DEFAULT_ACCESS_POLICY_ID },
    });
    expect(policies).toHaveLength(1);
    expect(policies[0]?.payload).toMatchObject({
      name: "Default",
      status: "ACTIVE",
      serverRules: [],
      createdBy: "system:setup",
    });
    expect(
      await db.accessPolicyVersionRecord.count({
        where: {
          projectId: "individual",
          policyId: DEFAULT_ACCESS_POLICY_ID,
        },
      }),
    ).toBe(1);
  });

  it("seeds a personal Project idempotently under concurrent requests", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const user = auth({
      displayName: "Concurrent SSO User",
      email: "concurrent-sso@example.com",
      provider: "sso",
      username: "concurrent-sso",
    });
    await service.syncAuthUser(user.user);
    const personalProject = (await service.list(user)).find(
      ({ type }) => type === "personal",
    )!;
    await Promise.all([
      db.skillRecord.deleteMany({
        where: { projectId: personalProject.id },
      }),
      db.mcpServerRecord.deleteMany({
        where: { projectId: personalProject.id },
      }),
      db.knowledgeSourceRecord.deleteMany({
        where: { projectId: personalProject.id },
      }),
      db.agentSpecializationRecord.deleteMany({
        where: { projectId: personalProject.id },
      }),
      db.sandboxPolicyRecord.deleteMany({
        where: { projectId: personalProject.id },
      }),
    ]);

    await Promise.all(
      Array.from({ length: 4 }, () => service.ensureUser(user)),
    );

    const [
      sourceSkills,
      personalSkills,
      sourceMcpServers,
      personalMcpServers,
      sourceKnowledgeSources,
      personalKnowledgeSources,
      sourceSpecializations,
      personalSpecializations,
      sourcePolicies,
      personalPolicies,
    ] = await Promise.all([
      db.skillRecord.count({ where: { projectId: "individual" } }),
      db.skillRecord.count({ where: { projectId: personalProject.id } }),
      db.mcpServerRecord.count({ where: { projectId: "individual" } }),
      db.mcpServerRecord.count({ where: { projectId: personalProject.id } }),
      db.knowledgeSourceRecord.count({ where: { projectId: "individual" } }),
      db.knowledgeSourceRecord.count({
        where: { projectId: personalProject.id },
      }),
      db.agentSpecializationRecord.count({
        where: { projectId: "individual" },
      }),
      db.agentSpecializationRecord.count({
        where: { projectId: personalProject.id },
      }),
      db.sandboxPolicyRecord.count({ where: { projectId: "individual" } }),
      db.sandboxPolicyRecord.count({
        where: { projectId: personalProject.id },
      }),
    ]);
    expect([
      personalSkills,
      personalMcpServers,
      personalKnowledgeSources,
      personalSpecializations,
      personalPolicies,
    ]).toEqual([
      sourceSkills,
      sourceMcpServers,
      sourceKnowledgeSources,
      sourceSpecializations,
      sourcePolicies,
    ]);
  });

  it("creates the initial member set and pending invitations with assigned roles", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tasklattice.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    await service.syncAuthUser({
      displayName: "Existing Member",
      email: "member@example.com",
      id: "test-existing-member",
      provider: "sso",
      systemRole: "user",
      username: "existing-member",
    });

    const team = await service.create(administrator, "Agent Operations", [
      { email: "member@example.com", role: "member" },
      { email: "future-admin@example.com", role: "admin" },
    ]);
    const administratorId = await service.ensureUser(administrator);

    expect(team).toMatchObject({
      memberCount: 2,
      name: "Agent Operations",
      role: "admin",
    });
    expect(await service.members(team.id, administratorId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "administrator@tasklattice.local",
          kind: "human",
          role: "admin",
          status: "active",
        }),
        expect.objectContaining({
          email: "member@example.com",
          role: "member",
          status: "active",
        }),
        expect.objectContaining({
          email: "future-admin@example.com",
          kind: "human",
          role: "admin",
          status: "invited",
        }),
      ]),
    );
    expect(await service.list(administrator)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: team.id,
          memberCount: 2,
        }),
      ]),
    );
  });

  it("rejects duplicate invitations and inviting the creator", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tasklattice.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);

    await expect(
      service.create(administrator, "Duplicate Team", [
        { email: "member@example.com", role: "member" },
        { email: "MEMBER@example.com", role: "admin" },
      ]),
    ).rejects.toThrow(/unique/i);
    await expect(
      service.create(administrator, "Creator Team", [
        { email: "administrator@tasklattice.local", role: "member" },
      ]),
    ).rejects.toThrow(/already included/i);
  });

  it("requires Project names to be unique and immutable", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tasklattice.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);

    const project = await service.create(
      administrator,
      "Security Research",
      [],
    );
    const administratorId = await service.ensureUser(administrator);

    await expect(
      service.create(administrator, "security research", []),
    ).rejects.toThrow(/already exists/i);
    await expect(
      service.rename(project.id, administratorId, "Renamed Security Research"),
    ).rejects.toThrow(/immutable/i);
  });

  it("soft deletes Projects while retaining their unique name and audit history", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tasklattice.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    const project = await service.create(administrator, "Retained Project", []);
    const administratorId = await service.ensureUser(administrator);
    await new AuditLogService(project.id, db).record({
      projectId: project.id,
      actor: {
        type: "user",
        id: administratorId,
        name: administrator.user.displayName,
      },
      authorization: { role: "admin", decision: "allowed" },
      action: "project.test",
      verb: "tested",
      object: { type: "Project", id: project.id, name: project.name },
      outcome: "success",
      summary: "Project audit retention test.",
      request: {
        id: "project-retention-test",
        method: "POST",
        route: "/project-retention-test",
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
      },
    });

    await service.delete(project.id, administratorId);

    expect(
      await db.project.findUnique({ where: { id: project.id } }),
    ).toMatchObject({
      deletedAt: expect.any(Date),
      deletedBy: administratorId,
      name: "Retained Project",
    });
    expect(
      (await service.list(administrator)).map(({ id }) => id),
    ).not.toContain(project.id);
    expect(
      await db.auditLogRecord.count({ where: { projectId: project.id } }),
    ).toBe(1);
    await expect(
      service.create(administrator, "Retained Project", []),
    ).rejects.toThrow(/already exists/i);
    await expect(
      service.requireRole(project.id, administratorId, ["admin"]),
    ).rejects.toThrow(/permission/i);
  });

  it("creates one personal project named after each username", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const alex = auth({
      displayName: "Alex Chen",
      email: "alex@example.com",
      provider: "sso",
      username: "alex",
    });
    await service.syncAuthUser(alex.user);

    expect(await service.list(alex)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "alex",
          role: "admin",
          type: "personal",
        }),
      ]),
    );

    const alexId = await service.ensureUser(alex);
    const [personalProject] = await service.list(alex);
    await expect(
      service.rename(personalProject!.id, alexId, "Renamed"),
    ).rejects.toThrow(/immutable/i);
  });

  it("enforces project roles and keeps records isolated by project", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tasklattice.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    const member = {
      displayName: "Member",
      email: "member@example.com",
      id: "test-member",
      provider: "sso" as const,
      systemRole: "user" as const,
      username: "member",
    };
    const administratorId = await service.ensureUser(administrator);
    const memberId = await service.syncAuthUser(member);
    const team = await service.create(administrator, "DevOps", []);

    await service.invite(team.id, administratorId, member.email, "member");
    await expect(
      service.requireRole(team.id, memberId, ["admin"]),
    ).rejects.toThrow(/permission/i);

    await db.skillRecord.delete({
      where: {
        projectId_id: {
          projectId: team.id,
          id: "kubernetes-expert",
        },
      },
    });
    expect(
      await db.skillRecord.findUnique({
        where: {
          projectId_id: {
            projectId: "individual",
            id: "kubernetes-expert",
          },
        },
      }),
    ).not.toBeNull();
  });

  it("accepts a pending invitation when the invited user first signs in", async () => {
    const db = createTestPrisma();
    const mailer = new RecordingInvitationMailer();
    const service = new ProjectService(db, undefined, mailer);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tasklattice.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    const administratorId = await service.ensureUser(administrator);
    const team = await service.create(administrator, "SRE", []);
    await service.invite(
      team.id,
      administratorId,
      "new-user@example.com",
      "admin",
    );

    const invitedUser = auth({
      displayName: "New User",
      email: "new-user@example.com",
      provider: "sso",
      username: "new-user",
    });
    await service.syncAuthUser(invitedUser.user);
    expect(await service.list(invitedUser)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: team.id, role: "admin" }),
      ]),
    );
    expect(
      await db.projectInvitation.findFirst({
        where: { projectId: team.id, email: "new-user@example.com" },
      }),
    ).toMatchObject({ status: "accepted" });
    expect(mailer.invitations).toEqual([
      expect.objectContaining({
        email: "new-user@example.com",
        projectName: "SRE",
        role: "admin",
      }),
    ]);
  });

  it("rejects an unknown-user invitation before persisting when SMTP is disabled", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(
      db,
      undefined,
      new RecordingInvitationMailer(false),
    );
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tasklattice.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    const administratorId = await service.ensureUser(administrator);
    const team = await service.create(administrator, "Email disabled", []);

    await expect(
      service.invite(team.id, administratorId, "new-user@example.com", "member"),
    ).rejects.toThrow(/SMTP invitation delivery is not configured/i);
    expect(
      await db.projectInvitation.count({ where: { projectId: team.id } }),
    ).toBe(0);
  });

  it("keeps a pending invitation when SMTP delivery fails so it can be retried", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(
      db,
      undefined,
      new RecordingInvitationMailer(
        true,
        new Error("SMTP delivery failed: connection refused"),
      ),
    );
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tasklattice.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    const administratorId = await service.ensureUser(administrator);
    const team = await service.create(administrator, "Retry delivery", []);

    await expect(
      service.invite(team.id, administratorId, "retry@example.com", "member"),
    ).rejects.toThrow(/Invitation saved.*SMTP delivery failed/i);
    expect(
      await db.projectInvitation.findUnique({
        where: {
          projectId_email: {
            projectId: team.id,
            email: "retry@example.com",
          },
        },
      }),
    ).toMatchObject({ status: "pending" });
  });

  it("prevents removing the last project administrator", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const administrator = auth({
      displayName: "Administrator",
      email: "administrator@tasklattice.local",
      provider: "sso",
      username: "administrator",
    });
    await service.syncAuthUser(administrator.user);
    const administratorId = await service.ensureUser(administrator);
    const team = await service.create(administrator, "Security", []);

    await expect(
      service.removeMember(team.id, administratorId, administratorId),
    ).rejects.toThrow(/at least one administrator/i);
  });

  it("does not let the system Super Administrator bypass Project membership", async () => {
    const db = createTestPrisma();
    const service = new ProjectService(db);
    const owner = auth({
      displayName: "Project Owner",
      email: "owner@example.com",
      provider: "sso",
      username: "owner",
    });
    await service.syncAuthUser(owner.user);
    const team = await service.create(owner, "Restricted Project", []);
    const local = auth({
      displayName: "Local Administrator",
      email: "admin@tasklattice.local",
      provider: "local",
      username: "admin",
    });

    expect(
      await db.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: team.id,
            userId: "local-admin",
          },
        },
      }),
    ).toBeNull();
    expect(await service.list(local)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: team.id })]),
    );
    await expect(
      service.rename(team.id, "local-admin", "Managed Globally"),
    ).rejects.toThrow(/permission/i);
  });
});
