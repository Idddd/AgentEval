import { createHash, randomUUID } from "node:crypto";
import { ensureDefaultAccessPolicy } from "../access-policies/default-access-policy";
import type { AuthPayload, AuthUser } from "../auth/auth";
import { requireAuth } from "../auth/auth";
import { getControlConfig } from "../config/control-config";
import { prisma } from "../db/prisma";
import {
  SmtpInvitationMailer,
  type InvitationMailer,
} from "../email/smtp-invitation-mailer";
import type { PrismaClient } from "../generated/prisma/client";
import { LiteLLMClient, type LiteLLMAdminClient } from "../providers/litellm-client";
import { ProjectQuotaService } from "../quotas/project-quota-service";
import { ProjectStore } from "./project-store";

export type ProjectRole = "admin" | "member";
export type ProjectType = "personal" | "team";

export interface ProjectView {
  id: string;
  name: string;
  type: ProjectType;
  avatar?: string;
  memberCount: number;
  role: ProjectRole;
}

export interface HumanProjectMemberView {
  id: string;
  kind: "human";
  name: string;
  email: string;
  role: ProjectRole;
  status: "active" | "invited";
}

export type ProjectMemberView = HumanProjectMemberView;

export interface InitialProjectInvitation {
  email: string;
  role: ProjectRole;
}

function personalProjectId(userId: string): string {
  if (userId === "local-admin") return "individual";
  return `individual-${createHash("sha256").update(userId).digest("hex").slice(0, 12)}`;
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "project";
}

export class ProjectService {
  constructor(
    private readonly db: PrismaClient = prisma(),
    private readonly litellm: LiteLLMAdminClient = new LiteLLMClient(),
    private readonly invitationMailer: InvitationMailer =
      new SmtpInvitationMailer(),
  ) {}

  async ensureUser(auth: AuthPayload): Promise<string> {
    const user = await this.db.user.findUnique({
      where: { id: auth.sub },
    });
    if (!user || user.status !== "active") {
      throw new Error("The authenticated TaskLattice user is unavailable.");
    }
    const id = user.id;
    const email = user.email.trim().toLowerCase();
    const projectId = personalProjectId(id);
    const personalProjectName = user.username;
    await this.db.project.upsert({
      where: { id: projectId },
      create: {
        id: projectId,
        name: personalProjectName,
        type: "personal",
        createdBy: id,
        humanMembers: { create: { userId: id, role: "admin" } },
      },
      update: { name: personalProjectName },
    });
    await this.db.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: id } },
      create: { projectId, userId: id, role: "admin" },
      update: { role: "admin" },
    });
    await this.db.projectQuotaRecord.createMany({
      data: [{ projectId }],
      skipDuplicates: true,
    });
    await ensureDefaultAccessPolicy(this.db, projectId);
    const invitations = await this.db.projectInvitation.findMany({
      where: {
        email,
        status: "pending",
        project: { deletedAt: null },
      },
    });
    for (const invitation of invitations) {
      await this.db.$transaction([
        this.db.projectMember.upsert({
          where: {
            projectId_userId: {
              projectId: invitation.projectId,
              userId: id,
            },
          },
          create: {
            projectId: invitation.projectId,
            userId: id,
            role: invitation.role,
          },
          update: { role: invitation.role },
        }),
        this.db.projectInvitation.update({
          where: { id: invitation.id },
          data: { status: "accepted" },
        }),
      ]);
      await this.syncProjectTeam(invitation.projectId);
    }
    if (projectId !== "individual") {
      const seeded = await this.db.skillRecord.count({ where: { projectId } });
      if (!seeded) await this.seedProject(projectId);
    }
    return id;
  }

  async requireUser(auth: AuthPayload): Promise<string> {
    const user = await this.db.user.findUnique({
      where: { id: auth.sub },
      select: { id: true, status: true },
    });
    if (!user || user.status !== "active") {
      throw new Error("The authenticated TaskLattice user is unavailable.");
    }
    return user.id;
  }

  async authenticate(request: Request): Promise<{ auth: AuthPayload; userId: string }> {
    const auth = requireAuth(request);
    return { auth, userId: await this.requireUser(auth) };
  }

  async list(auth: AuthPayload): Promise<ProjectView[]> {
    const currentUserId = await this.ensureUser(auth);
    const memberships = await this.db.projectMember.findMany({
      where: {
        userId: currentUserId,
        project: { deletedAt: null },
      },
      include: {
        project: {
          include: {
            _count: {
              select: { humanMembers: true },
            },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
    return memberships.map(({ project, role }) => ({
      id: project.id,
      name: project.name,
      type: project.type as ProjectType,
      ...(project.avatar ? { avatar: project.avatar } : {}),
      memberCount: project._count.humanMembers,
      role: role as ProjectRole,
    }));
  }

  async resolve(request: Request): Promise<{ auth: AuthPayload; userId: string; projectId: string; role: ProjectRole }> {
    const { auth, userId: currentUserId } = await this.authenticate(request);
    const match = new URL(request.url).pathname.match(
      /^\/api\/v1\/projects\/([^/]+)(?:\/|$)/,
    );
    if (!match) throw new Error("Project scope is required in the request path.");
    const projectId = decodeURIComponent(match[1]!);
    const membership = await this.db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: currentUserId } },
      include: { project: { select: { deletedAt: true } } },
    });
    if (!membership || membership.project.deletedAt) {
      throw new Error("Project not found or access denied.");
    }
    return { auth, userId: currentUserId, projectId, role: membership.role as ProjectRole };
  }

  async create(
    auth: AuthPayload,
    name: string,
    invitations: InitialProjectInvitation[],
  ): Promise<ProjectView> {
    const currentUserId = await this.ensureUser(auth);
    const projectName = name.trim();
    const duplicate = await this.db.project.findFirst({
      where: { name: { equals: projectName, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) throw new Error(`A Project named "${projectName}" already exists.`);
    const creator = await this.db.user.findUniqueOrThrow({
      where: { id: currentUserId },
      select: { email: true },
    });
    const normalizedInvitations = invitations.map((invitation) => ({
      email: invitation.email.trim().toLowerCase(),
      role: invitation.role,
    }));
    const invitationEmails = normalizedInvitations.map(({ email }) => email);
    if (new Set(invitationEmails).size !== invitationEmails.length) {
      throw new Error("Each invited email address must be unique.");
    }
    if (invitationEmails.includes(creator.email)) {
      throw new Error("The Project creator is already included as an administrator.");
    }

    const existingUsers = invitationEmails.length
      ? await this.db.user.findMany({
          where: { email: { in: invitationEmails } },
          select: { email: true, id: true },
        })
      : [];
    const existingUserByEmail = new Map(
      existingUsers.map((user) => [user.email, user]),
    );
    const id = `${slug(projectName)}-${randomUUID().slice(0, 8)}`;
    const project = await this.db.project.create({
      data: {
        id,
        name: projectName,
        type: "team",
        createdBy: currentUserId,
        humanMembers: {
          create: [
            { userId: currentUserId, role: "admin" },
            ...normalizedInvitations.flatMap((invitation) => {
              const user = existingUserByEmail.get(invitation.email);
              return user
                ? [{ userId: user.id, role: invitation.role }]
                : [];
            }),
          ],
        },
        invitations: {
          create: normalizedInvitations.flatMap((invitation) =>
            existingUserByEmail.has(invitation.email)
              ? []
              : [{
                  id: `invite-${randomUUID()}`,
                  email: invitation.email,
                  role: invitation.role,
                  invitedBy: currentUserId,
                }],
          ),
        },
      },
    });
    await this.db.projectQuotaRecord.create({ data: { projectId: project.id } });
    await ensureDefaultAccessPolicy(this.db, project.id);
    await this.seedProject(project.id);
    await this.syncProjectTeam(project.id);
    return {
      id: project.id,
      name: project.name,
      type: "team",
      memberCount: existingUsers.length + 1,
      role: "admin",
    };
  }

  private async seedProject(projectId: string): Promise<void> {
    const sourceProjectId = "individual";
    const delegates = [
      this.db.skillRecord,
      this.db.knowledgeSourceRecord,
      this.db.agentSpecializationRecord,
    ] as const;
    for (const delegate of delegates) {
      const records = await (delegate.findMany as Function)({
        where: { projectId: sourceProjectId },
      }) as Array<{ id: string; payload: unknown; sortOrder: number }>;
      if (records.length) {
        await (delegate.createMany as Function)({
          data: records.map((record) => ({
            projectId,
            id: record.id,
            payload: record.payload,
            sortOrder: record.sortOrder,
          })),
          skipDuplicates: true,
        });
      }
    }
    const policies = await this.db.sandboxPolicyRecord.findMany({
      where: { projectId: sourceProjectId },
    });
    if (policies.length) {
      await this.db.sandboxPolicyRecord.createMany({
        data: policies.map((policy) => ({
          projectId,
          id: policy.id,
          payload: JSON.parse(JSON.stringify(policy.payload)),
          createdAt: policy.createdAt,
        })),
        skipDuplicates: true,
      });
    }
  }

  async requireRole(projectId: string, currentUserId: string, roles: ProjectRole[]): Promise<ProjectRole> {
    const membership = await this.db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: currentUserId } },
      include: { project: { select: { deletedAt: true } } },
    });
    if (
      !membership
      || membership.project.deletedAt
      || !roles.includes(membership.role as ProjectRole)
    ) {
      throw new Error("You do not have permission to manage this project.");
    }
    return membership.role as ProjectRole;
  }

  async rename(projectId: string, currentUserId: string, name: string): Promise<ProjectView> {
    await this.requireRole(projectId, currentUserId, ["admin"]);
    const existing = await this.db.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!existing) throw new Error("Project not found.");
    void name;
    throw new Error("Project names are immutable after creation.");
  }

  async delete(projectId: string, currentUserId: string): Promise<void> {
    await this.requireRole(projectId, currentUserId, ["admin"]);
    const project = await this.db.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error("Project not found.");
    if (project.type === "personal") throw new Error("The default project cannot be deleted.");
    const quota = await this.db.projectQuotaRecord.findUnique({ where: { projectId } });
    if (quota?.litellmTeamId && getControlConfig().litellm.master_key) {
      await this.litellm.deleteProjectTeam?.(quota.litellmTeamId).catch(() => undefined);
    }
    await this.db.project.update({
      where: { id: projectId },
      data: {
        deletedAt: new Date(),
        deletedBy: currentUserId,
      },
    });
  }

  async members(projectId: string, currentUserId: string): Promise<ProjectMemberView[]> {
    await this.requireRole(projectId, currentUserId, ["admin", "member"]);
    const [members, invitations] = await Promise.all([
      this.db.projectMember.findMany({
        where: { projectId },
        include: { user: true },
        orderBy: { joinedAt: "asc" },
      }),
      this.db.projectInvitation.findMany({
        where: { projectId, status: "pending" },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return [
      ...members.map(({ user, role }) => ({
        id: user.id,
        kind: "human" as const,
        name: user.displayName,
        email: user.email,
        role: role as ProjectRole,
        status: "active" as const,
      })),
      ...invitations.map((invite) => ({
        id: invite.id,
        kind: "human" as const,
        name: invite.email.split("@")[0] || invite.email,
        email: invite.email,
        role: invite.role as ProjectRole,
        status: "invited" as const,
      })),
    ];
  }

  async invite(
    projectId: string,
    currentUserId: string,
    email: string,
    role: ProjectRole,
  ): Promise<HumanProjectMemberView> {
    await this.requireRole(projectId, currentUserId, ["admin"]);
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      const membership = await this.db.projectMember.upsert({
        where: { projectId_userId: { projectId, userId: existing.id } },
        create: { projectId, userId: existing.id, role },
        update: { role },
      });
      await this.syncProjectTeam(projectId);
      return {
        id: existing.id,
        kind: "human",
        name: existing.displayName,
        email: existing.email,
        role: membership.role as ProjectRole,
        status: "active",
      };
    }
    this.invitationMailer.assertConfigured();
    const [project, inviter] = await Promise.all([
      this.db.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      }),
      this.db.user.findUnique({
        where: { id: currentUserId },
        select: { displayName: true, email: true },
      }),
    ]);
    if (!project) throw new Error("Project not found.");
    if (!inviter) throw new Error("Inviting user not found.");
    const invite = await this.db.projectInvitation.upsert({
      where: { projectId_email: { projectId, email: normalizedEmail } },
      create: {
        id: `invite-${randomUUID()}`,
        projectId,
        email: normalizedEmail,
        role,
        invitedBy: currentUserId,
      },
      update: { role, status: "pending", invitedBy: currentUserId },
    });
    try {
      await this.invitationMailer.sendProjectInvitation({
        email: normalizedEmail,
        inviterEmail: inviter.email,
        inviterName: inviter.displayName,
        projectName: project.name,
        role,
      });
    } catch (error) {
      throw new Error(
        `Invitation saved, but ${
          error instanceof Error
            ? error.message
            : "SMTP delivery failed with an unknown error."
        }`,
      );
    }
    return {
      id: invite.id,
      kind: "human",
      name: normalizedEmail.split("@")[0] || normalizedEmail,
      email: normalizedEmail,
      role,
      status: "invited",
    };
  }

  async removeMember(projectId: string, currentUserId: string, memberId: string): Promise<void> {
    await this.requireRole(projectId, currentUserId, ["admin"]);
    const invitation = await this.db.projectInvitation.deleteMany({
      where: { projectId, id: memberId },
    });
    if (invitation.count) return;
    const target = await this.db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: memberId } },
    });
    if (!target) throw new Error("Project member not found.");
    if (target.role === "admin") {
      const adminCount = await this.db.projectMember.count({
        where: { projectId, role: "admin" },
      });
      if (adminCount <= 1) {
        throw new Error("A project must retain at least one administrator.");
      }
    }
    await this.db.projectMember.delete({
      where: { projectId_userId: { projectId, userId: memberId } },
    });
    const quota = await this.db.projectQuotaRecord.findUnique({ where: { projectId } });
    if (quota?.litellmTeamId && getControlConfig().litellm.master_key) {
      await this.litellm.removeProjectTeamMember?.(quota.litellmTeamId, memberId).catch(() => undefined);
    }
  }

  private async syncProjectTeam(projectId: string): Promise<void> {
    if (!getControlConfig().litellm.master_key) return;
    await new ProjectQuotaService(new ProjectStore(projectId, this.db), this.litellm)
      .sync()
      .catch(() => undefined);
  }

  async syncAuthUser(user: AuthUser): Promise<string> {
    await this.db.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        systemRole: user.systemRole,
        status: "active",
        identities: {
          create: {
            id: `identity-${user.id}`,
            type: user.provider === "local" ? "local" : "oidc",
            issuer:
              user.provider === "local" ? "tasklattice:local" : "test:sso",
            subject: user.username,
            username: user.username,
            email: user.email,
          },
        },
      },
      update: {
        displayName: user.displayName,
        email: user.email,
        systemRole: user.systemRole,
      },
    });
    return this.ensureUser({
      exp: Number.MAX_SAFE_INTEGER,
      iat: 0,
      iss: "tasklattice",
      sub: user.id,
      user,
    });
  }
}
