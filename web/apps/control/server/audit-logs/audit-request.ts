import type { PlatformAuditLogEvent } from "@tasklattice/contracts";
import type { AuthPayload } from "../auth/auth";
import { requireAuth, verifyAuthToken } from "../auth/auth";
import { prisma } from "../db/prisma";
import type { PrismaClient } from "../generated/prisma/client";
import { AuditLogService } from "./audit-log-service";

const maxBodyBytes = 64 * 1024;
const sensitiveKey =
  /(?:authorization|cookie|password|passphrase|secret|token|credential|api[-_]?key|private[-_]?key|client[-_]?secret|code[-_]?verifier)/i;
const operationSegments = new Set([
  "activate",
  "discover",
  "provision",
  "refresh",
  "rotate-model-credential",
  "suspend",
  "sync",
  "validate",
  "verify",
]);

interface AuditDescriptor {
  action: string;
  objectId?: string;
  objectType: string;
  operation: string;
  projectId?: string;
}

export interface CapturedAuditRequest {
  auth?: AuthPayload;
  body?: unknown;
  descriptor: AuditDescriptor;
  ipAddress: string;
  method: string;
  parameters?: Record<string, unknown>;
  path: string;
  requestId: string;
  startedAt: number;
  trace?: PlatformAuditLogEvent["trace"];
  userAgent: string;
}

const resources: Array<{
  segment: string;
  prefix: string;
  type: string;
}> = [
  { segment: "terminal-sessions", prefix: "terminal_session", type: "Terminal Session" },
  { segment: "access-policies", prefix: "access_policy", type: "Access Policy" },
  { segment: "model-routings", prefix: "model_routing", type: "Routing" },
  { segment: "mcp-servers", prefix: "mcp_server", type: "MCP Server" },
  { segment: "knowledge-sources", prefix: "knowledge_source", type: "Knowledge Source" },
  { segment: "connections", prefix: "agent_connection", type: "Agent Connection" },
  { segment: "invitations", prefix: "project_member", type: "Project Member" },
  { segment: "providers", prefix: "provider", type: "Provider" },
  { segment: "instances", prefix: "instance", type: "Instance" },
  { segment: "policies", prefix: "runtime_policy", type: "Runtime Policy" },
  { segment: "members", prefix: "project_member", type: "Project Member" },
  { segment: "models", prefix: "model", type: "Model" },
  { segment: "skills", prefix: "skill", type: "Skill" },
  { segment: "agents", prefix: "agent_garden_agent", type: "Agent Garden Agent" },
  { segment: "quota", prefix: "project_quota", type: "Project Quota" },
];

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return value.length > 4096 ? `${value.slice(0, 4096)}…` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  }
  if (typeof value !== "object") return String(value);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : sanitize(item, depth + 1),
    ]),
  );
}

async function captureBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/application\/(?:[^;]+\+)?json/i.test(contentType)) {
    return contentType
      ? { contentType, retained: false }
      : undefined;
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBodyBytes) {
    return { byteLength: contentLength, retained: false, reason: "body_too_large" };
  }
  try {
    const text = await request.clone().text();
    if (!text) return undefined;
    if (Buffer.byteLength(text, "utf8") > maxBodyBytes) {
      return {
        byteLength: Buffer.byteLength(text, "utf8"),
        retained: false,
        reason: "body_too_large",
      };
    }
    return sanitize(JSON.parse(text));
  } catch {
    return { retained: false, reason: "unparseable_json" };
  }
}

function descriptor(method: string, path: string): AuditDescriptor | undefined {
  if (method === "GET" && path === "/api/v1/projects") {
    return {
      action: "user.project_context_sync",
      objectType: "Project Membership",
      operation: "sync",
    };
  }
  if (method === "POST" && path === "/api/v1/projects") {
    return { action: "project.create", objectType: "Project", operation: "create" };
  }
  if (path === "/api/v1/auth/local" && method === "POST") {
    return { action: "auth.login", objectType: "Session", operation: "login" };
  }
  if (path === "/api/v1/auth/logout" && method === "POST") {
    return { action: "auth.logout", objectType: "Session", operation: "logout" };
  }
  if (path === "/auth/sso/callback" && method === "GET") {
    return { action: "auth.sso_callback", objectType: "Session", operation: "login" };
  }
  if (path === "/api/v1/profile" && method === "PATCH") {
    return { action: "profile.update", objectType: "User Profile", operation: "update" };
  }
  if (path === "/api/v1/profile/password" && method === "POST") {
    return { action: "credential.rotate", objectType: "Credential", operation: "rotate" };
  }
  if (/^\/api\/v1\/demo-agents\/[^/]+$/.test(path) && method === "POST") {
    return {
      action: "demo_agent.execute",
      objectId: decodeURIComponent(path.split("/").at(-1) ?? ""),
      objectType: "Demo Agent",
      operation: "execute",
    };
  }

  const projectMatch = path.match(/^\/api\/v1\/projects\/([^/]+)(?:\/(.*))?$/);
  if (!projectMatch) return undefined;
  const projectId = decodeURIComponent(projectMatch[1]!);
  const tail = (projectMatch[2] ?? "").split("/").filter(Boolean).map(decodeURIComponent);
  if (!tail.length) {
    const operation = method === "DELETE" ? "delete" : "update";
    return {
      action: `project.${operation}`,
      ...(projectId ? { objectId: projectId } : {}),
      objectType: "Project",
      operation,
      projectId,
    };
  }

  const unsafe = method === "POST" || method === "PUT"
    || method === "PATCH" || method === "DELETE";
  if (!unsafe) return undefined;

  if (
    tail[0] === "instances"
    && tail[2] === "access-policies"
  ) {
    return {
      action: "instance.access_policies_update",
      ...(tail[1] ? { objectId: tail[1] } : {}),
      objectType: "Instance",
      operation: "update",
      projectId,
    };
  }

  const resource = resources.find((candidate) => tail.includes(candidate.segment));
  if (!resource) {
    return {
      action: `project.${method.toLowerCase()}`,
      objectId: projectId,
      objectType: "Project",
      operation: method.toLowerCase(),
      projectId,
    };
  }
  const resourceIndex = tail.lastIndexOf(resource.segment);
  const possibleId = tail[resourceIndex + 1];
  const customOperation = tail.find((segment) => operationSegments.has(segment));
  const operation = method === "DELETE"
    ? "delete"
    : customOperation
      ? customOperation.replaceAll("-", "_")
      : resource.segment === "invitations"
        ? "invite"
        : method === "POST"
          ? "create"
          : "update";

  return {
    action: `${resource.prefix}.${operation}`,
    ...(
      possibleId
      && !operationSegments.has(possibleId)
      && possibleId !== "discover"
        ? { objectId: possibleId }
        : {}
    ),
    objectType: resource.type,
    operation,
    projectId,
  };
}

function traceContext(request: Request): PlatformAuditLogEvent["trace"] | undefined {
  const traceparent = request.headers.get("traceparent");
  const match = traceparent?.match(
    /^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-[\da-f]{2}$/i,
  );
  return match ? { traceId: match[1]!.toLowerCase(), spanId: match[2]!.toLowerCase() } : undefined;
}

export async function captureAuditRequest(
  request: Request,
): Promise<CapturedAuditRequest | undefined> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const requestDescriptor = descriptor(method, url.pathname);
  if (!requestDescriptor) return undefined;
  let auth: AuthPayload | undefined;
  try {
    auth = requireAuth(request);
  } catch {
    auth = undefined;
  }
  const parameters = Object.fromEntries(url.searchParams.entries());
  if (requestDescriptor.projectId) parameters.projectId = requestDescriptor.projectId;
  return {
    ...(auth ? { auth } : {}),
    ...(request.body ? { body: await captureBody(request) } : {}),
    descriptor: requestDescriptor,
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown",
    method,
    ...(Object.keys(parameters).length
      ? { parameters: sanitize(parameters) as Record<string, unknown> }
      : {}),
    path: url.pathname,
    requestId: request.headers.get("x-request-id")?.slice(0, 200) || crypto.randomUUID(),
    startedAt: Date.now(),
    ...(traceContext(request) ? { trace: traceContext(request) } : {}),
    userAgent: (request.headers.get("user-agent") || "unknown").slice(0, 1000),
  };
}

async function responseJson(response: Response): Promise<Record<string, unknown> | undefined> {
  if (!response.headers.get("content-type")?.includes("application/json")) return undefined;
  try {
    const text = await response.clone().text();
    if (!text || Buffer.byteLength(text, "utf8") > maxBodyBytes) return undefined;
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function authFromResponse(
  captured: CapturedAuditRequest,
  response: Response,
  result?: Record<string, unknown>,
): AuthPayload | undefined {
  if (captured.auth) return captured.auth;
  const token = typeof result?.token === "string" ? result.token : undefined;
  if (token) {
    try {
      return verifyAuthToken(token);
    } catch {
      return undefined;
    }
  }
  if (captured.descriptor.action === "auth.sso_callback") {
    try {
      const location = response.headers.get("location");
      const signed = location
        ? new URL(location).hash.slice(1)
        : "";
      const callbackToken = new URLSearchParams(signed).get("token");
      return callbackToken ? verifyAuthToken(callbackToken) : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function resultSubject(result?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!result) return undefined;
  const nested = result.account;
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : result;
}

function operationVerb(operation: string, outcome: PlatformAuditLogEvent["outcome"]): string {
  if (outcome !== "success") return "attempted";
  return ({
    activate: "activated",
    bind: "bound",
    create: "created",
    delete: "deleted",
    discover: "discovered",
    execute: "executed",
    invite: "invited",
    login: "signed in",
    logout: "signed out",
    provision: "provisioned",
    refresh: "refreshed",
    rotate: "rotated",
    rotate_model_credential: "rotated",
    suspend: "suspended",
    sync: "synchronized",
    unbind: "unbound",
    update: "updated",
    validate: "validated",
    verify: "verified",
  } as Record<string, string>)[operation] ?? operation;
}

export async function writeAuditResponse(
  captured: CapturedAuditRequest,
  response: Response,
  database: PrismaClient = prisma(),
): Promise<void> {
  const result = await responseJson(response);
  const auth = authFromResponse(captured, response, result);
  const subject = resultSubject(result);
  let projectId = captured.descriptor.projectId;
  if (!projectId && captured.descriptor.action === "project.create") {
    projectId = typeof subject?.id === "string" ? subject.id : undefined;
  }
  if (!projectId && auth) {
    const personalMembership = await database.projectMember.findFirst({
      where: {
        userId: auth.sub,
        project: { type: "personal" },
      },
      select: { projectId: true },
    });
    projectId = personalMembership?.projectId;
  }
  const membership = projectId && auth
    ? await database.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: auth.sub } },
        select: { role: true },
      })
    : undefined;
  const outcome: PlatformAuditLogEvent["outcome"] =
    response.status === 401 || response.status === 403
      ? "denied"
      : response.status < 400
        ? "success"
        : "failed";
  const actor = auth?.user;
  const body = captured.body && typeof captured.body === "object"
    ? captured.body as Record<string, unknown>
    : undefined;
  const objectId =
    (typeof subject?.id === "string" ? subject.id : undefined)
    || (typeof subject?.email === "string" ? subject.email : undefined)
    || captured.descriptor.objectId
    || (typeof body?.id === "string" ? body.id : undefined)
    || projectId
    || "platform";
  const objectName =
    (typeof subject?.name === "string" ? subject.name : undefined)
    || (typeof subject?.displayName === "string" ? subject.displayName : undefined)
    || (typeof subject?.email === "string" ? subject.email : undefined)
    || (typeof body?.name === "string" ? body.name : undefined)
    || (typeof body?.displayName === "string" ? body.displayName : undefined)
    || (typeof body?.email === "string" ? body.email : undefined)
    || objectId;
  const verb = operationVerb(captured.descriptor.operation, outcome);
  const actorName = actor?.displayName
    || (typeof body?.username === "string" ? body.username : "Anonymous");

  await new AuditLogService(projectId ?? "platform", database).record({
    ...(projectId ? { projectId } : {}),
    actor: {
      type: "user",
      id: actor?.id || (typeof body?.username === "string" ? body.username : "anonymous"),
      name: actorName,
      ...(actor?.email ? { email: actor.email } : {}),
    },
    authorization: {
      role: membership?.role || actor?.systemRole || "none",
      decision: outcome === "denied" ? "denied" : "allowed",
    },
    action: captured.descriptor.action,
    verb,
    object: {
      type: captured.descriptor.objectType,
      id: objectId,
      name: objectName,
    },
    outcome,
    summary: `${actorName} ${verb} ${objectName}.`,
    request: {
      id: captured.requestId,
      method: captured.method,
      route: captured.path,
      ipAddress: captured.ipAddress,
      userAgent: captured.userAgent,
      ...(captured.parameters ? { parameters: captured.parameters } : {}),
      ...(captured.body !== undefined ? { body: captured.body } : {}),
    },
    ...(captured.trace ? { trace: captured.trace } : {}),
    metadata: {
      durationMs: Date.now() - captured.startedAt,
      httpStatus: response.status,
      retentionDays: 90,
    },
  });
}

export async function purgeExpiredAuditLogs(
  database: PrismaClient = prisma(),
  now = new Date(),
): Promise<number> {
  return new AuditLogService("platform", database).purgeExpired(90, now);
}
