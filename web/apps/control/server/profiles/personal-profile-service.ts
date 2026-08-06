import bcrypt from "bcryptjs";
import type { PrismaClient } from "../generated/prisma/client";
import type { SystemRole } from "../auth/auth";
import { verifyLocalPassword, type AuthPayload } from "../auth/auth";
import { prisma } from "../db/prisma";
import { ProjectService } from "../projects/project-service";

export interface PersonalProfile {
  city: string;
  displayName: string;
  email: string;
  provider: "local" | "sso";
  systemRole: SystemRole;
  theme: "system" | "light" | "dark";
  timezone: string;
  username: string;
}

export class PersonalProfileService {
  constructor(private readonly db: PrismaClient = prisma()) {}

  async get(auth: AuthPayload): Promise<PersonalProfile> {
    await new ProjectService(this.db).requireUser(auth);
    const user = await this.db.user.findUnique({
      where: { id: auth.sub },
    });
    if (!user) throw new Error("Personal profile not found.");
    return {
      city: user.city ?? "",
      displayName: user.displayName,
      email: user.email,
      provider: auth.user.provider,
      systemRole: user.systemRole,
      theme:
        user.theme === "light" || user.theme === "dark"
          ? user.theme
          : "system",
      timezone: user.timezone || "UTC",
      username: user.username,
    };
  }

  async update(
    auth: AuthPayload,
    input: {
      city: string;
      theme: "system" | "light" | "dark";
      timezone: string;
    },
  ): Promise<PersonalProfile> {
    await new ProjectService(this.db).requireUser(auth);
    await this.db.user.update({
      where: { id: auth.sub },
      data: {
        city: input.city || null,
        theme: input.theme,
        timezone: input.timezone,
      },
    });
    return this.get(auth);
  }

  async resetPassword(
    auth: AuthPayload,
    input: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    await new ProjectService(this.db).requireUser(auth);
    const user = await this.db.user.findUnique({
      where: { id: auth.sub },
      include: {
        identities: {
          where: { type: "local" },
          include: { credential: true },
        },
      },
    });
    if (!user) throw new Error("Personal profile not found.");
    const identity = user.identities[0];
    if (!identity || auth.user.provider !== "local") {
      throw new Error("You do not have permission to reset an SSO password.");
    }
    if (!identity.credential) {
      throw new Error("Local account password is not initialized.");
    }
    const valid = await verifyLocalPassword(
      input.currentPassword,
      identity.credential.passwordHash,
    );
    if (!valid) throw new Error("Invalid current password.");
    if (input.currentPassword === input.newPassword) {
      throw new Error("New password must be different from the current password.");
    }
    await this.db.localCredential.update({
      where: { identityId: identity.id },
      data: {
        passwordHash: await bcrypt.hash(input.newPassword, 12),
        changedAt: new Date(),
      },
    });
  }
}
