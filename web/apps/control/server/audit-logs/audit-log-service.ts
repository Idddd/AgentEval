import type {
  PlatformAuditActorType,
  PlatformAuditLogEvent,
  PlatformAuditLogFacets,
  PlatformAuditLogListResponse,
  PlatformAuditLogQuery,
  PlatformAuditOutcome,
  PlatformAuditSortDirection,
} from "@tasklattice/contracts";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import type { Prisma, PrismaClient } from "../generated/prisma/client";

interface AuditCursor {
  occurredAt: string;
  id: string;
  direction: PlatformAuditSortDirection;
}

export interface AuditLogWriteInput {
  projectId?: string;
  occurredAt?: Date;
  actor: {
    type: PlatformAuditActorType;
    id: string;
    name: string;
    email?: string;
  };
  authorization: {
    role: string;
    decision: "allowed" | "denied";
  };
  action: string;
  verb: string;
  object: {
    type: string;
    id: string;
    name: string;
  };
  outcome: PlatformAuditOutcome;
  summary: string;
  request: {
    id: string;
    method: string;
    route: string;
    ipAddress: string;
    userAgent: string;
    parameters?: Record<string, unknown>;
    body?: unknown;
  };
  trace?: {
    traceId: string;
    spanId?: string;
  };
  metadata?: Record<string, unknown>;
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function optionalObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}

function encodeCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string, direction: PlatformAuditSortDirection): AuditCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<AuditCursor>;
    if (
      typeof parsed.id !== "string"
      || typeof parsed.occurredAt !== "string"
      || parsed.direction !== direction
      || Number.isNaN(Date.parse(parsed.occurredAt))
    ) {
      throw new Error("Cursor shape is invalid.");
    }
    return {
      id: parsed.id,
      occurredAt: parsed.occurredAt,
      direction,
    };
  } catch {
    throw new Error("Invalid audit log cursor.");
  }
}

function mapEvent(
  row: Prisma.AuditLogRecordGetPayload<Record<string, never>>,
): PlatformAuditLogEvent {
  const parameters = optionalObject(row.parameters);
  const metadata = optionalObject(row.metadata);
  return {
    id: row.id,
    projectId: row.projectId ?? "platform",
    occurredAt: row.occurredAt.toISOString(),
    actor: {
      type: row.actorType as PlatformAuditActorType,
      id: row.actorId,
      name: row.actorName,
      ...(row.actorEmail ? { email: row.actorEmail } : {}),
    },
    authorization: {
      scope: "project",
      role: row.authorizationRole,
      decision: row.authorizationDecision as "allowed" | "denied",
    },
    action: row.action,
    verb: row.verb,
    object: {
      type: row.objectType,
      id: row.objectId,
      name: row.objectName,
    },
    outcome: row.outcome as PlatformAuditOutcome,
    summary: row.summary,
    request: {
      id: row.requestId,
      method: row.httpMethod,
      route: row.route,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      ...(parameters ? { parameters } : {}),
      ...(row.requestBody !== null ? { body: row.requestBody } : {}),
    },
    ...(row.traceId
      ? {
          trace: {
            traceId: row.traceId,
            ...(row.spanId ? { spanId: row.spanId } : {}),
          },
        }
      : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export class AuditLogService {
  constructor(
    private readonly projectId: string,
    private readonly db: PrismaClient = prisma(),
  ) {}

  async record(input: AuditLogWriteInput): Promise<void> {
    const id = randomUUID();
    await this.db.auditLogRecord.create({
      data: {
        id,
        occurredAt: input.occurredAt ?? new Date(),
        actorType: input.actor.type,
        actorId: input.actor.id,
        actorName: input.actor.name,
        ...(input.actor.email ? { actorEmail: input.actor.email } : {}),
        authorizationRole: input.authorization.role,
        authorizationDecision: input.authorization.decision,
        action: input.action,
        verb: input.verb,
        objectType: input.object.type,
        objectId: input.object.id,
        objectName: input.object.name,
        outcome: input.outcome,
        summary: input.summary,
        requestId: input.request.id,
        httpMethod: input.request.method,
        route: input.request.route,
        ipAddress: input.request.ipAddress,
        userAgent: input.request.userAgent,
        ...(input.request.parameters
          ? { parameters: inputJson(input.request.parameters) }
          : {}),
        ...(input.request.body !== undefined
          ? { requestBody: inputJson(input.request.body) }
          : {}),
        ...(input.trace?.traceId ? { traceId: input.trace.traceId } : {}),
        ...(input.trace?.spanId ? { spanId: input.trace.spanId } : {}),
        ...(input.metadata ? { metadata: inputJson(input.metadata) } : {}),
        ...(input.projectId
          ? { project: { connect: { id: input.projectId } } }
          : {}),
      },
    });
  }

  async purgeExpired(retentionDays = 90, now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const result = await this.db.auditLogRecord.deleteMany({
      where: { occurredAt: { lt: cutoff } },
    });
    return result.count;
  }

  private where(input: PlatformAuditLogQuery): Prisma.AuditLogRecordWhereInput {
    const conditions: Prisma.AuditLogRecordWhereInput[] = [
      { projectId: this.projectId },
    ];

    if (input.from || input.to) {
      conditions.push({
        occurredAt: {
          ...(input.from ? { gte: new Date(input.from) } : {}),
          ...(input.to ? { lte: new Date(input.to) } : {}),
        },
      });
    }
    if (input.actorId) conditions.push({ actorId: input.actorId });
    if (input.action) conditions.push({ action: input.action });
    if (input.objectType) conditions.push({ objectType: input.objectType });
    if (input.outcome) conditions.push({ outcome: input.outcome });

    const query = input.query?.trim();
    if (query) {
      const contains = { contains: query, mode: "insensitive" as const };
      conditions.push({
        OR: [
          { actorName: contains },
          { actorEmail: contains },
          { action: contains },
          { verb: contains },
          { objectType: contains },
          { objectId: contains },
          { objectName: contains },
          { summary: contains },
          { requestId: contains },
        ],
      });
    }

    return { AND: conditions };
  }

  private async facets(): Promise<PlatformAuditLogFacets> {
    const [actors, actions, objectTypes] = await Promise.all([
      this.db.auditLogRecord.findMany({
        where: { projectId: this.projectId },
        distinct: ["actorId"],
        orderBy: [{ actorName: "asc" }, { actorId: "asc" }],
        select: {
          actorId: true,
          actorName: true,
          actorEmail: true,
        },
      }),
      this.db.auditLogRecord.findMany({
        where: { projectId: this.projectId },
        distinct: ["action"],
        orderBy: { action: "asc" },
        select: { action: true },
      }),
      this.db.auditLogRecord.findMany({
        where: { projectId: this.projectId },
        distinct: ["objectType"],
        orderBy: { objectType: "asc" },
        select: { objectType: true },
      }),
    ]);

    return {
      actors: actors.map((actor) => ({
        id: actor.actorId,
        name: actor.actorName,
        ...(actor.actorEmail ? { email: actor.actorEmail } : {}),
      })),
      actions: actions.map((row) => row.action),
      objectTypes: objectTypes.map((row) => row.objectType),
    };
  }

  async list(input: PlatformAuditLogQuery = {}): Promise<PlatformAuditLogListResponse> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const direction = input.direction ?? "desc";
    const baseWhere = this.where(input);
    const cursor = input.cursor
      ? decodeCursor(input.cursor, direction)
      : undefined;
    const cursorDate = cursor ? new Date(cursor.occurredAt) : undefined;
    const comparison = direction === "desc" ? "lt" : "gt";
    const where: Prisma.AuditLogRecordWhereInput = cursor && cursorDate
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { occurredAt: { [comparison]: cursorDate } },
                {
                  AND: [
                    { occurredAt: cursorDate },
                    { id: { [comparison]: cursor.id } },
                  ],
                },
              ],
            },
          ],
        }
      : baseWhere;

    const [rows, totalCount, facets] = await Promise.all([
      this.db.auditLogRecord.findMany({
        where,
        orderBy: [
          { occurredAt: direction },
          { id: direction },
        ],
        take: limit + 1,
      }),
      this.db.auditLogRecord.count({ where: baseWhere }),
      this.facets(),
    ]);
    const hasNextPage = rows.length > limit;
    const visibleRows = rows.slice(0, limit);
    const last = visibleRows.at(-1);

    return {
      data: visibleRows.map(mapEvent),
      totalCount,
      facets,
      ...(hasNextPage && last
        ? {
            nextCursor: encodeCursor({
              occurredAt: last.occurredAt.toISOString(),
              id: last.id,
              direction,
            }),
          }
        : {}),
    };
  }

  async listForExport(input: PlatformAuditLogQuery = {}): Promise<PlatformAuditLogEvent[]> {
    const direction = input.direction ?? "desc";
    const rows = await this.db.auditLogRecord.findMany({
      where: this.where(input),
      orderBy: [
        { occurredAt: direction },
        { id: direction },
      ],
    });
    return rows.map(mapEvent);
  }
}
