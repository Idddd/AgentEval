import {
  createHash,
  createHmac,
  createPublicKey,
  createVerify,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import bcrypt from "bcryptjs";
import { getControlConfig } from "../config/control-config";
import { prisma } from "../db/prisma";
import { jsonResponse } from "../http/responses";

export type AuthMode = "local" | "local-sso";
export type SystemRole = "user" | "super_administrator";

export interface AuthUser {
  displayName: string;
  email: string;
  id: string;
  provider: "local" | "sso";
  systemRole: SystemRole;
  username: string;
}

interface AuthConfig {
  developmentDefaults: boolean;
  jwtSecret: string;
  local: {
    enabled: boolean;
    initialSuperAdminPasswordHash?: string;
    initialSuperAdminUsername?: string;
  };
  mode: AuthMode;
  oidc?: {
    clientId: string;
    clientSecret: string;
    issuer: string;
    providerName: string;
    redirectUri: string;
    scopes: string[];
  };
}

export interface AuthPayload {
  exp: number;
  iat: number;
  iss: string;
  sso?: { idToken: string };
  sub: string;
  user: AuthUser;
}

interface OidcDiscovery {
  authorization_endpoint: string;
  end_session_endpoint?: string;
  jwks_uri: string;
  token_endpoint: string;
}

interface OidcState {
  exp: number;
  nonce: string;
  redirect: string;
  state: string;
  verifier: string;
}

type OidcJwk = import("node:crypto").JsonWebKey & { kid?: string };

const issuer = "tasklattice";
const oidcCookie = "tasklattice_oidc";

export function getAuthConfig(): AuthConfig {
  const source = getControlConfig();
  const mode: AuthMode = source.auth.oidc.enabled ? "local-sso" : "local";

  const config: AuthConfig = {
    developmentDefaults:
      !process.env.TASKLATTICE_CONFIG && process.env.NODE_ENV !== "production",
    jwtSecret: source.auth.session_signing_key,
    local: {
      enabled: source.auth.local.enabled,
      ...(source.auth.local.initial_super_admin_username
        ? {
            initialSuperAdminUsername:
              source.auth.local.initial_super_admin_username,
          }
        : {}),
      ...(source.auth.local.initial_super_admin_password_hash
        ? {
            initialSuperAdminPasswordHash:
              source.auth.local.initial_super_admin_password_hash,
          }
        : {}),
    },
    mode,
  };

  if (source.auth.oidc.enabled) {
    const publicUrl = source.server.public_url;
    if (!publicUrl) {
      throw new Error(
        "server.public_url must be configured when OIDC authentication is enabled.",
      );
    }
    config.oidc = {
      clientId: source.auth.oidc.client_id,
      clientSecret: source.auth.oidc.client_secret,
      issuer: source.auth.oidc.issuer.replace(/\/$/, ""),
      providerName: source.auth.oidc.display_name,
      redirectUri: `${publicUrl.replace(/\/$/, "")}/auth/sso/callback`,
      scopes: ["openid", "profile", "email"],
    };
  }

  return config;
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function decodeBase64Url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function signature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function signAuthToken(
  authUser: AuthUser,
  remember = false,
  idToken = "",
): { expiresAt: string; token: string; user: AuthUser } {
  const config = getAuthConfig();
  const now = Math.floor(Date.now() / 1_000);
  const user: AuthUser = {
    displayName: authUser.displayName,
    email: authUser.email,
    id: authUser.id,
    provider: authUser.provider,
    systemRole: authUser.systemRole,
    username: authUser.username,
  };
  const payload: AuthPayload = {
    exp: now + (remember ? 30 * 86_400 : 8 * 3_600),
    iat: now,
    iss: issuer,
    ...(idToken ? { sso: { idToken } } : {}),
    sub: user.id,
    user,
  };
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  return {
    expiresAt: new Date(payload.exp * 1_000).toISOString(),
    token: `${unsigned}.${signature(unsigned, config.jwtSecret)}`,
    user,
  };
}

export function verifyAuthToken(token: string): AuthPayload {
  const [header, body, suppliedSignature] = token.split(".");
  if (!header || !body || !suppliedSignature) {
    throw new Error("Missing or invalid authentication token.");
  }
  const unsigned = `${header}.${body}`;
  if (!safeEqual(suppliedSignature, signature(unsigned, getAuthConfig().jwtSecret))) {
    throw new Error("Invalid authentication token signature.");
  }
  const payload = JSON.parse(decodeBase64Url(body).toString("utf8")) as AuthPayload;
  if (payload.iss !== issuer) throw new Error("Invalid authentication token issuer.");
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1_000)) {
    throw new Error("Authentication token expired.");
  }
  return payload;
}

export function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
}

export function requireAuth(request: Request): AuthPayload {
  const token = bearerToken(request);
  if (!token) throw new Error("Authentication required.");
  return verifyAuthToken(token);
}

export function unauthorizedResponse(error: unknown): Response {
  return jsonResponse(
    {
      error: "Unauthorized",
      message: error instanceof Error ? error.message : "Authentication required.",
    },
    { status: 401 },
  );
}

export function publicAuthConfig() {
  const config = getAuthConfig();
  return {
    authRequired: true,
    developmentDefaults: config.developmentDefaults,
    localEnabled: config.local.enabled,
    mode: config.mode,
    providerName: config.oidc?.providerName ?? "Company SSO",
    ssoEnabled: config.mode === "local-sso",
  };
}

export async function verifyLocalPassword(
  password: string,
  storedPasswordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, storedPasswordHash);
}

async function bootstrapLocalPasswordHash(
  identity: {
    credential: { passwordHash: string } | null;
    id: string;
    username: string | null;
  },
): Promise<string | null> {
  if (identity.credential) return identity.credential.passwordHash;
  const config = getAuthConfig();
  if (
    identity.username !== config.local.initialSuperAdminUsername ||
    !config.local.initialSuperAdminPasswordHash
  ) {
    return null;
  }
  const passwordHash = config.local.initialSuperAdminPasswordHash;
  if (!passwordHash) {
    throw new Error("The initial local account password is not configured.");
  }
  await prisma().localCredential.create({
    data: { identityId: identity.id, passwordHash },
  });
  return passwordHash;
}

export async function ensureInitialSuperAdministrator(): Promise<void> {
  const config = getAuthConfig();
  if (!config.local.enabled) return;
  const username = config.local.initialSuperAdminUsername;
  const passwordHash = config.local.initialSuperAdminPasswordHash;
  const existingAdministrator = await prisma().user.findFirst({
    where: { systemRole: "super_administrator" },
    include: {
      identities: {
        where: { type: "local" },
        include: { credential: true },
      },
    },
  });
  if (existingAdministrator) {
    const localIdentity = existingAdministrator.identities[0];
    if (localIdentity?.credential) return;
    if (!username || !passwordHash) {
      throw new Error(
        "The database Super Administrator has no Local credential and no initial credential is configured.",
      );
    }
    if (localIdentity) {
      await prisma().$transaction([
        prisma().user.update({
          where: { id: existingAdministrator.id },
          data: { username },
        }),
        prisma().userIdentity.update({
          where: { id: localIdentity.id },
          data: { subject: username, username },
        }),
        prisma().localCredential.create({
          data: { identityId: localIdentity.id, passwordHash },
        }),
      ]);
      return;
    }
    await prisma().userIdentity.create({
      data: {
        id: randomUUID(),
        userId: existingAdministrator.id,
        type: "local",
        issuer: "tasklattice:local",
        subject: username,
        username,
        email: existingAdministrator.email,
        credential: { create: { passwordHash } },
      },
    });
    return;
  }
  if (!username || !passwordHash) {
    throw new Error(
      "Local authentication requires initial Super Administrator credentials when the database has no Super Administrator.",
    );
  }
  const existingIdentity = await prisma().userIdentity.findUnique({
    where: { type_username: { type: "local", username } },
    include: { credential: true, user: true },
  });
  if (existingIdentity) {
    await prisma().$transaction([
      prisma().user.update({
        where: { id: existingIdentity.userId },
        data: { systemRole: "super_administrator", status: "active" },
      }),
      ...(existingIdentity.credential
        ? []
        : [
            prisma().localCredential.create({
              data: { identityId: existingIdentity.id, passwordHash },
            }),
          ]),
    ]);
    return;
  }
  const existingUsername = await prisma().user.findUnique({
    where: { username },
  });
  if (existingUsername) {
    throw new Error(
      `Cannot initialize the Super Administrator because username ${username} is already assigned to another identity.`,
    );
  }
  await prisma().user.create({
    data: {
      id: "local-admin",
      username,
      email: "admin@tasklattice.local",
      displayName: "Super Administrator",
      systemRole: "super_administrator",
      status: "active",
      identities: {
        create: {
          id: "identity-local-admin",
          type: "local",
          issuer: "tasklattice:local",
          subject: username,
          username,
          email: "admin@tasklattice.local",
          credential: { create: { passwordHash } },
        },
      },
    },
  });
}

export async function handleLocalLogin(request: Request): Promise<Response> {
  try {
    const config = getAuthConfig();
    if (!config.local.enabled) {
      return jsonResponse({ error: "Local login disabled" }, { status: 404 });
    }
    await ensureInitialSuperAdministrator();
    const body = (await request.json()) as {
      password?: string;
      remember?: boolean;
      username?: string;
    };
    const username = body.username ?? "";
    const identity = await prisma().userIdentity.findUnique({
      where: { type_username: { type: "local", username } },
      include: { credential: true, user: true },
    });
    if (!identity || identity.user.status !== "active") {
      return jsonResponse(
        { error: "Login failed", message: "Invalid username or password." },
        { status: 401 },
      );
    }
    const passwordHash = await bootstrapLocalPasswordHash(identity);
    const passwordMatches =
      passwordHash &&
      (await verifyLocalPassword(body.password ?? "", passwordHash));
    if (!passwordMatches) {
      return jsonResponse(
        { error: "Login failed", message: "Invalid username or password." },
        { status: 401 },
      );
    }
    return jsonResponse(
      signAuthToken(
        {
          displayName: identity.user.displayName,
          email: identity.user.email,
          id: identity.user.id,
          provider: "local",
          systemRole: identity.user.systemRole,
          username: identity.user.username,
        },
        Boolean(body.remember),
      ),
    );
  } catch (error) {
    return jsonResponse(
      {
        error: "Login failed",
        message: error instanceof Error ? error.message : "Unable to sign in.",
      },
      { status: 500 },
    );
  }
}

async function oidcDiscovery(config: AuthConfig): Promise<OidcDiscovery> {
  if (!config.oidc) throw new Error("SSO is not configured.");
  const discoveryUrl = `${config.oidc.issuer}/.well-known/openid-configuration`;
  let response: Response;
  try {
    response = await fetch(discoveryUrl);
  } catch (error) {
    throw new Error(
      `Unable to reach the OIDC discovery document at ${discoveryUrl}: ${
        error instanceof Error ? error.message : "network error"
      }`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `OIDC discovery failed at ${discoveryUrl}: HTTP ${response.status} ${response.statusText}`.trim(),
    );
  }
  return (await response.json()) as OidcDiscovery;
}

function callbackUrl(request: Request, config: AuthConfig): string {
  if (config.oidc?.redirectUri) return config.oidc.redirectUri;
  return `${new URL(request.url).origin}/auth/sso/callback`;
}

function signOidcState(state: OidcState, secret: string): string {
  const body = base64Url(JSON.stringify(state));
  return `${body}.${signature(body, secret)}`;
}

function verifyOidcState(value: string, secret: string): OidcState {
  const [body, suppliedSignature] = value.split(".");
  if (!body || !suppliedSignature || !safeEqual(suppliedSignature, signature(body, secret))) {
    throw new Error("Invalid SSO state cookie.");
  }
  const state = JSON.parse(decodeBase64Url(body).toString("utf8")) as OidcState;
  if (state.exp <= Math.floor(Date.now() / 1_000)) throw new Error("SSO state expired.");
  return state;
}

function cookieValue(request: Request, name: string): string {
  const cookies = request.headers.get("cookie") ?? "";
  for (const entry of cookies.split(";")) {
    const [key, ...parts] = entry.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}

function oidcCookieHeader(value: string, request: Request, maxAge = 600): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${oidcCookie}=${encodeURIComponent(value)}; Path=/auth/sso; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function safeRedirect(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function handleSsoStart(request: Request): Promise<Response> {
  try {
    const config = getAuthConfig();
    if (config.mode !== "local-sso" || !config.oidc) {
      return jsonResponse({ error: "SSO disabled" }, { status: 404 });
    }
    const discovery = await oidcDiscovery(config);
    const state = randomBytes(24).toString("base64url");
    const nonce = randomBytes(24).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const returnPath = safeRedirect(new URL(request.url).searchParams.get("redirect"));
    const stateCookie = signOidcState(
      {
        exp: Math.floor(Date.now() / 1_000) + 600,
        nonce,
        redirect: returnPath,
        state,
        verifier,
      },
      config.jwtSecret,
    );
    const redirect = new URL(discovery.authorization_endpoint);
    redirect.searchParams.set("client_id", config.oidc.clientId);
    redirect.searchParams.set("code_challenge", challenge);
    redirect.searchParams.set("code_challenge_method", "S256");
    redirect.searchParams.set("nonce", nonce);
    redirect.searchParams.set("redirect_uri", callbackUrl(request, config));
    redirect.searchParams.set("response_type", "code");
    redirect.searchParams.set("scope", config.oidc.scopes.join(" "));
    redirect.searchParams.set("state", state);
    return new Response(null, {
      headers: {
        location: redirect.toString(),
        "set-cookie": oidcCookieHeader(stateCookie, request),
      },
      status: 302,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "SSO start failed",
        message: error instanceof Error ? error.message : "Unable to start SSO.",
      },
      { status: 500 },
    );
  }
}

async function verifyOidcToken(
  idToken: string,
  expectedNonce: string,
  config: AuthConfig,
  discovery: OidcDiscovery,
): Promise<Record<string, unknown>> {
  if (!config.oidc) throw new Error("SSO is not configured.");
  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("OIDC provider returned an invalid ID token.");
  }
  const header = JSON.parse(decodeBase64Url(encodedHeader).toString("utf8")) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== "RS256") throw new Error(`Unsupported OIDC signing algorithm: ${header.alg ?? "unknown"}.`);
  const payload = JSON.parse(decodeBase64Url(encodedPayload).toString("utf8")) as Record<string, unknown>;
  const jwksResponse = await fetch(discovery.jwks_uri);
  if (!jwksResponse.ok) throw new Error("Unable to load OIDC signing keys.");
  const jwks = (await jwksResponse.json()) as { keys?: OidcJwk[] };
  const key = jwks.keys?.find((candidate) => candidate.kid === header.kid);
  if (!key) throw new Error("OIDC signing key was not found.");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  if (!verifier.verify(createPublicKey({ format: "jwk", key }), decodeBase64Url(encodedSignature))) {
    throw new Error("OIDC token signature verification failed.");
  }
  const audience = payload.aud;
  const audienceMatches =
    audience === config.oidc.clientId ||
    (Array.isArray(audience) && audience.includes(config.oidc.clientId));
  if (payload.iss !== config.oidc.issuer) throw new Error("OIDC token issuer mismatch.");
  if (!audienceMatches) throw new Error("OIDC token audience mismatch.");
  if (payload.nonce !== expectedNonce) throw new Error("OIDC token nonce mismatch.");
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1_000)) {
    throw new Error("OIDC token expired.");
  }
  return payload;
}

function claimString(
  claims: Record<string, unknown>,
  name: string,
): string {
  const value = claims[name];
  return typeof value === "string" ? value.trim() : "";
}

function oidcUsernameBase(claims: Record<string, unknown>): string {
  const preferred =
    claimString(claims, "preferred_username") ||
    claimString(claims, "email").split("@")[0] ||
    "sso-user";
  return (
    preferred
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "sso-user"
  );
}

async function availableUsername(
  base: string,
  issuerValue: string,
  subject: string,
): Promise<string> {
  const existing = await prisma().user.findUnique({ where: { username: base } });
  if (!existing) return base;
  const suffix = createHash("sha256")
    .update(`${issuerValue}\0${subject}`)
    .digest("hex")
    .slice(0, 8);
  return `${base.slice(0, 39)}-${suffix}`;
}

export async function provisionOidcUser(
  claims: Record<string, unknown>,
): Promise<AuthUser> {
  const config = getAuthConfig();
  if (!config.oidc) throw new Error("SSO is not configured.");
  const subject = claimString(claims, "sub");
  if (!subject) throw new Error("OIDC token does not contain a subject.");
  const existing = await prisma().userIdentity.findUnique({
    where: {
      issuer_subject: {
        issuer: config.oidc.issuer,
        subject,
      },
    },
    include: { user: true },
  });
  const claimUsername =
    claimString(claims, "preferred_username") ||
    claimString(claims, "email") ||
    subject;
  const claimEmail = claimString(claims, "email").toLowerCase();
  const displayName =
    claimString(claims, "name") || claimUsername;
  if (existing) {
    if (existing.type !== "oidc" || existing.user.status !== "active") {
      throw new Error("The mapped TaskLattice account is disabled.");
    }
    await prisma().userIdentity.update({
      where: { id: existing.id },
      data: {
        username: claimUsername,
        email: claimEmail || null,
      },
    });
    return {
      displayName: existing.user.displayName,
      email: existing.user.email,
      id: existing.user.id,
      provider: "sso",
      systemRole: existing.user.systemRole,
      username: existing.user.username,
    };
  }
  if (claimEmail) {
    const emailOwner = await prisma().user.findUnique({
      where: { email: claimEmail },
    });
    if (emailOwner) {
      throw new Error(
        "An existing TaskLattice account uses this email. Sign in to that account and link SSO before continuing.",
      );
    }
  }
  const username = await availableUsername(
    oidcUsernameBase(claims),
    config.oidc.issuer,
    subject,
  );
  const id = randomUUID();
  const email =
    claimEmail ||
    `sso-${createHash("sha256")
      .update(`${config.oidc.issuer}\0${subject}`)
      .digest("hex")
      .slice(0, 16)}@tasklattice.invalid`;
  const user = await prisma().user.create({
    data: {
      id,
      username,
      email,
      displayName,
      systemRole: "user",
      status: "active",
      identities: {
        create: {
          id: randomUUID(),
          type: "oidc",
          issuer: config.oidc.issuer,
          subject,
          username: claimUsername,
          email: claimEmail || null,
        },
      },
    },
  });
  return {
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    provider: "sso",
    systemRole: user.systemRole,
    username: user.username,
  };
}

export async function handleSsoCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    const config = getAuthConfig();
    if (config.mode !== "local-sso" || !config.oidc) throw new Error("SSO is disabled.");
    const stateCookie = verifyOidcState(
      cookieValue(request, oidcCookie),
      config.jwtSecret,
    );
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    if (!code || !safeEqual(state, stateCookie.state)) throw new Error("Invalid SSO callback state.");
    const discovery = await oidcDiscovery(config);
    const tokenResponse = await fetch(discovery.token_endpoint, {
      body: new URLSearchParams({
        client_id: config.oidc.clientId,
        ...(config.oidc.clientSecret
          ? { client_secret: config.oidc.clientSecret }
          : {}),
        code,
        code_verifier: stateCookie.verifier,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl(request, config),
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    if (!tokenResponse.ok) throw new Error(`OIDC token exchange failed with HTTP ${tokenResponse.status}.`);
    const tokenSet = (await tokenResponse.json()) as { id_token?: string };
    if (!tokenSet.id_token) throw new Error("OIDC provider did not return an ID token.");
    const claims = await verifyOidcToken(
      tokenSet.id_token,
      stateCookie.nonce,
      config,
      discovery,
    );
    const user = await provisionOidcUser(claims);
    const signed = signAuthToken(
      user,
      false,
      tokenSet.id_token,
    );
    const redirect = new URL("/auth/sso-complete", url.origin);
    redirect.hash = new URLSearchParams({
      redirect: stateCookie.redirect,
      token: signed.token,
    }).toString();
    return new Response(null, {
      headers: {
        location: redirect.toString(),
        "set-cookie": oidcCookieHeader("", request, 0),
      },
      status: 302,
    });
  } catch (error) {
    const redirect = new URL("/login", url.origin);
    redirect.searchParams.set(
      "error",
      error instanceof Error ? error.message : "SSO login failed.",
    );
    return new Response(null, {
      headers: {
        location: redirect.toString(),
        "set-cookie": oidcCookieHeader("", request, 0),
      },
      status: 302,
    });
  }
}

export async function handleAuthMe(request: Request): Promise<Response> {
  try {
    const payload = requireAuth(request);
    const user = await prisma().user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.status !== "active") {
      throw new Error("The TaskLattice account is disabled or unavailable.");
    }
    const currentUser: AuthUser = {
      displayName: user.displayName,
      email: user.email,
      id: user.id,
      provider: payload.user.provider,
      systemRole: user.systemRole,
      username: user.username,
    };
    return jsonResponse({
      identity: {
        type: "authenticated",
        userId: payload.sub,
        username: currentUser.username,
      },
      user: currentUser,
    });
  } catch (error) {
    return unauthorizedResponse(error);
  }
}

export async function handleLogout(request: Request): Promise<Response> {
  try {
    const payload = requireAuth(request);
    if (payload.user.provider === "sso" && payload.sso?.idToken) {
      const config = getAuthConfig();
      const discovery = await oidcDiscovery(config);
      if (discovery.end_session_endpoint) {
        const redirect = new URL(discovery.end_session_endpoint);
        redirect.searchParams.set("id_token_hint", payload.sso.idToken);
        redirect.searchParams.set("post_logout_redirect_uri", `${new URL(request.url).origin}/login`);
        return jsonResponse({ message: "Logged out", redirectUrl: redirect.toString() });
      }
    }
  } catch {
    // Client-side token removal remains the logout source of truth.
  }
  return jsonResponse({ message: "Logged out" });
}
