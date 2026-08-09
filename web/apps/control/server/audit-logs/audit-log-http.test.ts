import { describe, expect, it } from "vitest";
import type { PlatformAuditLogEvent } from "@tasklattice/contracts";
import {
  createAuditLogCsv,
  parseAuditLogQuery,
} from "./audit-log-http";

const event: PlatformAuditLogEvent = {
  id: "audit-1",
  projectId: "individual",
  occurredAt: "2026-07-26T11:00:00.000Z",
  actor: {
    type: "user",
    id: "maya",
    name: "=HYPERLINK(\"https://example.com\")",
  },
  authorization: {
    scope: "project",
    role: "admin",
    decision: "allowed",
  },
  action: "instance.create",
  verb: "created",
  object: {
    type: "Instance",
    id: "research-assistant",
    name: "Research Assistant",
  },
  outcome: "success",
  summary: "Created a research assistant.",
  request: {
    id: "req-1",
    method: "POST",
    route: "/instances",
    ipAddress: "127.0.0.1",
    userAgent: "Vitest",
  },
  trace: {
    traceId: "6e7f1c9a4c824b1aa7a5e68a0b134101",
    spanId: "8a6cb93f82c6461a",
  },
};

describe("audit log HTTP helpers", () => {
  it("parses bounded server query parameters", () => {
    const request = new Request(
      "https://tasklattice.local/api/v1/audit-logs"
      + "?query=maya&outcome=denied&limit=25&direction=asc",
    );
    expect(parseAuditLogQuery(request)).toEqual({
      query: "maya",
      outcome: "denied",
      limit: 25,
      direction: "asc",
    });
  });

  it("exports trace identifiers and neutralizes spreadsheet formulas", () => {
    const csv = createAuditLogCsv([event]);
    expect(csv).toContain("Trace ID");
    expect(csv).toContain(event.trace?.traceId);
    expect(csv).toContain("'=HYPERLINK");
  });
});
