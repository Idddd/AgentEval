import { describe, expect, it } from "vitest";
import {
  auditFiltersToQuery,
  defaultAuditLogFilters,
} from "./audit-log-utils";

const now = Date.parse("2026-07-26T12:00:00.000Z");

describe("auditFiltersToQuery", () => {
  it("converts the selected time range to an absolute server timestamp", () => {
    expect(
      auditFiltersToQuery(defaultAuditLogFilters, now),
    ).toEqual({
      from: "2026-07-19T12:00:00.000Z",
    });
  });

  it("omits all-value filters and forwards active server filters", () => {
    expect(
      auditFiltersToQuery(
        {
          query: "  request-123  ",
          timeRange: "all",
          actorId: "maya",
          action: "instance.create",
          objectType: "Instance",
          outcome: "denied",
        },
        now,
      ),
    ).toEqual({
      query: "request-123",
      actorId: "maya",
      action: "instance.create",
      objectType: "Instance",
      outcome: "denied",
    });
  });
});
