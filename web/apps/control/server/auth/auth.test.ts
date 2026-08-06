import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import {
  developmentControlConfig,
  setControlConfigForTests,
} from "../config/control-config";
import { createTestPrisma } from "../test/prisma";
import {
  handleAuthMe,
  handleLocalLogin,
  handleSsoStart,
  provisionOidcUser,
  publicAuthConfig,
  verifyAuthToken,
} from "./auth";

function localRequest(password: string) {
  return new Request("http://tasklattice.local/api/v1/auth/local", {
    body: JSON.stringify({ password, username: "admin" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("TaskLattice authentication", () => {
  const db = createTestPrisma();

  beforeEach(async () => {
    globalThis.tasklatticePrisma = db;
    vi.restoreAllMocks();
    vi.stubEnv("TASKLATTICE_CONFIG", "/test/control.toml");
    const config = developmentControlConfig();
    config.server.public_url = "http://tasklattice.local";
    config.auth.local.initial_super_admin_password_hash =
      await bcrypt.hash("bootstrap-password", 4);
    setControlConfigForTests(config);
    await db.localCredential.upsert({
      where: { identityId: "identity-local-admin" },
      create: {
        identityId: "identity-local-admin",
        passwordHash: await bcrypt.hash("correct-horse", 4),
      },
      update: {
        passwordHash: await bcrypt.hash("correct-horse", 4),
      },
    });
  });

  afterEach(async () => {
    await db.localCredential.deleteMany({
      where: { identityId: "identity-local-admin" },
    });
    await db.user.deleteMany({
      where: { id: { not: "local-admin" } },
    });
    setControlConfigForTests(undefined);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("authenticates a configured local user and resolves the bearer identity", async () => {
    const response = await handleLocalLogin(localRequest("correct-horse"));
    const body = (await response.json()) as {
      token: string;
      user: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(body.user).toEqual({
      displayName: "Local Administrator",
      email: "admin@tasklattice.local",
      id: "local-admin",
      provider: "local",
      systemRole: "super_administrator",
      username: "admin",
    });
    expect(body.user).not.toHaveProperty("password");
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(verifyAuthToken(body.token).sub).toBe("local-admin");
    expect(verifyAuthToken(body.token).user).toEqual(body.user);

    const me = await handleAuthMe(
      new Request("http://tasklattice.local/api/v1/auth/me", {
        headers: { authorization: `Bearer ${body.token}` },
      }),
    );
    await expect(me.json()).resolves.toMatchObject({
      identity: { type: "authenticated", username: "admin" },
      user: { provider: "local", username: "admin" },
    });
  });

  it("rejects invalid local credentials", async () => {
    const response = await handleLocalLogin(localRequest("wrong"));
    await expect(response.json()).resolves.toMatchObject({
      error: "Login failed",
      message: "Invalid username or password.",
    });
    expect(response.status).toBe(401);
  });

  it("does not accept the bootstrap password after a database hash exists", async () => {
    const response = await handleLocalLogin(localRequest("bootstrap-password"));
    expect(response.status).toBe(401);
  });

  it("does not require a public URL for local authentication", async () => {
    const config = developmentControlConfig();
    delete config.server.public_url;
    config.auth.local.initial_super_admin_password_hash =
      await bcrypt.hash("bootstrap-password", 4);
    setControlConfigForTests(config);

    const response = await handleLocalLogin(localRequest("correct-horse"));
    expect(response.status).toBe(200);
  });

  it("publishes local and SSO capabilities without leaking secrets", () => {
    const config = developmentControlConfig();
    config.auth.oidc = {
      enabled: true,
      display_name: "Example ID",
      issuer: "https://identity.example/realms/agents",
      client_id: "tasklattice",
      client_secret: "",
    };
    setControlConfigForTests(config);

    expect(publicAuthConfig()).toEqual({
      authRequired: true,
      developmentDefaults: false,
      localEnabled: true,
      mode: "local-sso",
      providerName: "Example ID",
      ssoEnabled: true,
    });
  });

  it("requires a canonical public URL when OIDC is enabled", () => {
    const config = developmentControlConfig();
    delete config.server.public_url;
    config.auth.oidc = {
      enabled: true,
      display_name: "Example ID",
      issuer: "https://identity.example/realms/agents",
      client_id: "tasklattice",
      client_secret: "",
    };
    setControlConfigForTests(config);

    expect(() => publicAuthConfig()).toThrow(
      "server.public_url must be configured when OIDC authentication is enabled.",
    );
  });

  it("starts OIDC authorization with PKCE, nonce, and a protected state cookie", async () => {
    const config = developmentControlConfig();
    config.server.public_url = "http://tasklattice.local";
    config.auth.oidc = {
      enabled: true,
      display_name: "Example ID",
      issuer: "https://identity.example/realms/agents",
      client_id: "tasklattice",
      client_secret: "",
    };
    setControlConfigForTests(config);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          authorization_endpoint: "https://identity.example/authorize",
          jwks_uri: "https://identity.example/jwks",
          token_endpoint: "https://identity.example/token",
        }),
      ),
    );

    const response = await handleSsoStart(
      new Request("http://tasklattice.local/api/v1/auth/sso/start"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(302);
    expect(location.searchParams.get("client_id")).toBe("tasklattice");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    expect(location.searchParams.get("nonce")).toBeTruthy();
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://tasklattice.local/auth/sso/callback",
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
  });

  it("JIT-provisions one local user for a stable OIDC issuer and subject", async () => {
    const config = developmentControlConfig();
    config.auth.oidc = {
      enabled: true,
      display_name: "Example ID",
      issuer: "https://identity.example/realms/agents",
      client_id: "tasklattice",
      client_secret: "",
    };
    setControlConfigForTests(config);

    const first = await provisionOidcUser({
      sub: "external-user-42",
      preferred_username: "alice",
      email: "alice@example.com",
      name: "Alice Chen",
    });
    const second = await provisionOidcUser({
      sub: "external-user-42",
      preferred_username: "alice-renamed",
      email: "alice@example.com",
      name: "Alice Renamed",
    });

    expect(first.id).toBe(second.id);
    expect(first).toMatchObject({
      provider: "sso",
      systemRole: "user",
      username: "alice",
    });
    await expect(
      db.userIdentity.findUnique({
        where: {
          issuer_subject: {
            issuer: "https://identity.example/realms/agents",
            subject: "external-user-42",
          },
        },
      }),
    ).resolves.toMatchObject({
      type: "oidc",
      username: "alice-renamed",
      userId: first.id,
    });
  });
});
