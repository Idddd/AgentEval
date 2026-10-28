import { describe, expect, it, vi } from "vitest";
import { agents, policyHits, policyEvents, seedMeasure } from "./measure-data";
import {
  reportEvent,
  reviewReport,
  commitMeasure,
  measureStorageKey,
} from "./measure-store";

describe("Measure source behavior", () => {
  it("keeps same-agent events independent and avoids duplicate reports", () => {
    const state = seedMeasure();
    const events = policyEvents(agents[0]!.id, policyHits[0]!.id);
    const first = reportEvent(
      state,
      events[0]!,
      "Yann GUO",
      "User",
      "Legitimate verification question.",
      "2026-10-27T02:00:00Z",
    );
    expect(first.reports).toHaveLength(state.reports.length + 1);
    expect(state.reports.some((r) => r.eventId === events[0]!.id)).toBe(false);
    expect(first.reports.some((r) => r.eventId === events[2]!.id)).toBe(false);
    expect(reportEvent(first, events[0]!, "Yann GUO", "User", "Duplicate")).toBe(first);
    expect(first.reports[0]).toMatchObject({
      eventId: events[0]!.id,
      status: "Pending review",
      action: "Transformed",
      reportReason: "Legitimate verification question.",
      controlUnit: "ISS",
    });
  });

  it("records a technical event review without changing the event evidence or other records", () => {
    const state = seedMeasure();
    const original = structuredClone(state);
    const next = reviewReport(
      state,
      state.reports[0]!.id,
      "Confirm false positive",
      "Approved process question.",
      "Alex MORGAN · TEC",
      "IT Admin",
      "2026-10-27T02:06:00Z",
    );
    expect(state).toEqual(original);
    expect(next.reports[0]).toMatchObject({
      status: "Reviewed",
      review: {
        decision: "Confirm false positive",
        reason: "Approved process question.",
        reviewer: "Alex MORGAN · TEC",
        time: "2026-10-27T02:06:00Z",
      },
    });
    expect(next.reports[0]!.evidence).toEqual(original.reports[0]!.evidence);
    expect(next.reports[0]!.action).toBe(original.reports[0]!.action);
    expect(next.reports.slice(1)).toEqual(original.reports.slice(1));
    expect(Object.keys(next).sort()).toEqual(["reports", "version"]);
  });

  it.each(["User", "User Admin"] as const)(
    "does not grant %s technical review permission",
    (role) => {
      const state = seedMeasure();
      expect(() =>
        reviewReport(
          state,
          state.reports[0]!.id,
          "Not a false positive",
          "Rule was appropriate.",
          "Reviewer",
          role,
        ),
      ).toThrow(/technical/i);
    },
  );

  it("requires a reason, records the alternative decision and prevents rewriting a completed review", () => {
    const state = seedMeasure();
    expect(() =>
      reviewReport(
        state,
        state.reports[0]!.id,
        "Confirm false positive",
        "  ",
        "TEC",
        "IT Admin",
      ),
    ).toThrow(/reason/i);
    const next = reviewReport(
      state,
      state.reports[0]!.id,
      "Not a false positive",
      "Original enforcement was appropriate.",
      "TEC",
      "IT Admin",
    );
    expect(next.reports[0]!.review!.decision).toBe("Not a false positive");
    expect(() =>
      reviewReport(
        next,
        next.reports[0]!.id,
        "Confirm false positive",
        "Change it",
        "TEC",
        "IT Admin",
      ),
    ).toThrow(/already reviewed/i);
  });

  it("fails a write explicitly instead of claiming a successful submission", () => {
    const write = vi.fn(() => {
      throw new Error("Quota exceeded");
    });
    expect(() => commitMeasure(seedMeasure(), { setItem: write })).toThrow(
      /could not be saved/i,
    );
    expect(write).toHaveBeenCalledWith(measureStorageKey, expect.any(String));
  });
});
