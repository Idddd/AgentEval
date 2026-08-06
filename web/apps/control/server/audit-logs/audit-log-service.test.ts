import { afterEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "../generated/prisma/client";
import { createTestPrisma } from "../test/prisma";
import { AuditLogService } from "./audit-log-service";

let database: PrismaClient | undefined;

afterEach(async () => {
  await database?.$disconnect();
  database = undefined;
});

describe("AuditLogService", () => {
  it("returns structured Project events with retained request attachments", async () => {
    database = createTestPrisma();
    const result = await new AuditLogService("individual", database).list();
    const events = result.data;

    expect(events).toHaveLength(8);
    expect(result.totalCount).toBe(8);
    expect(result.facets.actors.length).toBeGreaterThan(0);
    expect(result.facets.actions).toContain("instance.create");
    expect(events[0]).toMatchObject({
      actor: {
        type: "user",
      },
      authorization: {
        scope: "project",
      },
      object: {
        type: expect.any(String),
      },
      request: {
        id: expect.stringMatching(/^req_/),
        parameters: expect.any(Object),
      },
      trace: {
        traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
        spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
      },
    });
    expect(
      events.some((event) => event.request.body !== undefined),
    ).toBe(true);
    expect(
      events.some((event) => event.authorization.decision === "denied"),
    ).toBe(true);
  });

  it("applies server filters and returns stable cursor pages", async () => {
    database = createTestPrisma();
    const service = new AuditLogService("individual", database);
    const first = await service.list({ limit: 2, direction: "desc" });

    expect(first.data).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await service.list({
      limit: 2,
      direction: "desc",
      cursor: first.nextCursor!,
    });
    expect(second.data).toHaveLength(2);
    expect(second.data.map((event) => event.id)).not.toContain(first.data[0]?.id);
    expect(
      second.data.every((event) =>
        Date.parse(event.occurredAt)
        <= Date.parse(first.data.at(-1)?.occurredAt ?? ""),
      ),
    ).toBe(true);

    const denied = await service.list({
      outcome: "denied",
      query: "production github",
    });
    expect(denied.totalCount).toBe(1);
    expect(denied.data[0]).toMatchObject({
      outcome: "denied",
      object: { name: "Production GitHub" },
    });
  });

  it("purges only events older than the 90-day retention window", async () => {
    database = createTestPrisma();
    const service = new AuditLogService("individual", database);
    const event = {
      projectId: "individual",
      actor: { type: "system" as const, id: "retention", name: "Retention" },
      authorization: { role: "system", decision: "allowed" as const },
      action: "audit.retention_test",
      verb: "tested",
      object: { type: "Audit Event", id: "retention", name: "Retention" },
      outcome: "success" as const,
      summary: "Retention test.",
      request: {
        id: "retention-request",
        method: "POST",
        route: "/retention-test",
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
      },
    };
    const now = new Date("2026-07-26T00:00:00.000Z");
    await service.record({
      ...event,
      occurredAt: new Date("2026-04-26T23:59:59.000Z"),
    });
    await service.record({
      ...event,
      occurredAt: new Date("2026-04-27T00:00:01.000Z"),
      request: { ...event.request, id: "retention-request-new" },
    });

    expect(await service.purgeExpired(90, now)).toBe(1);
    expect(
      await database.auditLogRecord.count({
        where: { action: "audit.retention_test" },
      }),
    ).toBe(1);
  });
});
