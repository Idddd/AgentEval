import { afterEach, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { AuthPayload } from "../auth/auth";
import { createTestPrisma } from "../test/prisma";
import { PersonalProfileService } from "./personal-profile-service";

function auth(): AuthPayload {
  return {
    exp: Number.MAX_SAFE_INTEGER,
    iat: 0,
    iss: "tasklattice",
    sub: "local-admin",
    user: {
      displayName: "Local Administrator",
      email: "admin@tasklattice.local",
      id: "local-admin",
      provider: "local",
      systemRole: "super_administrator",
      username: "admin",
    },
  };
}

describe("PersonalProfileService", () => {
  const db = createTestPrisma();
  const service = new PersonalProfileService(db);

  beforeEach(async () => {
    await db.localCredential.upsert({
      where: { identityId: "identity-local-admin" },
      create: {
        identityId: "identity-local-admin",
        passwordHash: await bcrypt.hash("current-password", 4),
      },
      update: {
        passwordHash: await bcrypt.hash("current-password", 4),
      },
    });
    await db.user.update({
      where: { id: "local-admin" },
      data: { city: null, theme: "system", timezone: "UTC" },
    });
  });

  afterEach(async () => {
    await db.localCredential.deleteMany({
      where: { identityId: "identity-local-admin" },
    });
    await db.user.update({
      where: { id: "local-admin" },
      data: { city: null, theme: "system", timezone: "UTC" },
    });
  });

  it("stores city on the user instead of the Project", async () => {
    await expect(
      service.update(auth(), {
        city: "Shanghai",
        theme: "dark",
        timezone: "Asia/Shanghai",
      }),
    ).resolves.toMatchObject({
      city: "Shanghai",
      displayName: "Local Administrator",
      theme: "dark",
      timezone: "Asia/Shanghai",
      username: "admin",
    });
    await expect(service.get(auth())).resolves.toMatchObject({
      city: "Shanghai",
    });
    await expect(
      db.project.findUnique({ where: { id: "individual" } }),
    ).resolves.not.toHaveProperty("city");
  });

  it("resets a local password using only the database hash", async () => {
    await service.resetPassword(auth(), {
      currentPassword: "current-password",
      newPassword: "new-password-value",
    });
    const credential = await db.localCredential.findUniqueOrThrow({
      where: { identityId: "identity-local-admin" },
    });
    await expect(
      bcrypt.compare("new-password-value", credential.passwordHash),
    ).resolves.toBe(true);
    await expect(
      bcrypt.compare("current-password", credential.passwordHash),
    ).resolves.toBe(false);
  });

  it("rejects an incorrect current password", async () => {
    await expect(
      service.resetPassword(auth(), {
        currentPassword: "incorrect-password",
        newPassword: "new-password-value",
      }),
    ).rejects.toThrow("Invalid current password.");
  });
});
