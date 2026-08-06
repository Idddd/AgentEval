import { describe, expect, it } from "vitest";
import type { TraceSpan } from "@tasklattice/contracts";
import { buildTraceRows, formatDuration } from "./trace-model";

const spans: TraceSpan[] = [
  {
    spanId: "root",
    name: "Root workflow",
    type: "workflow",
    serviceName: "control",
    startOffsetMs: 0,
    durationMs: 2000,
    status: "ok",
    attributes: {},
  },
  {
    spanId: "agent",
    parentSpanId: "root",
    name: "Research Agent",
    type: "agent",
    serviceName: "research",
    startOffsetMs: 100,
    durationMs: 1200,
    status: "ok",
    attributes: {},
  },
  {
    spanId: "tool",
    parentSpanId: "agent",
    name: "NeoCloud lookup",
    type: "external",
    serviceName: "neocloud",
    startOffsetMs: 300,
    durationMs: 500,
    status: "ok",
    attributes: {},
  },
];

describe("buildTraceRows", () => {
  it("keeps collapsed descendants out of the visible row model", () => {
    expect(buildTraceRows(spans, new Set(["root"]), "")).toHaveLength(2);
  });

  it("includes matching spans and their ancestors during search", () => {
    expect(buildTraceRows(spans, new Set(), "neocloud").map((row) => row.span.spanId))
      .toEqual(["root", "agent", "tool"]);
  });
});

describe("formatDuration", () => {
  it("selects a readable unit", () => {
    expect(formatDuration(82)).toBe("82ms");
    expect(formatDuration(4820)).toBe("4.82s");
  });
});
