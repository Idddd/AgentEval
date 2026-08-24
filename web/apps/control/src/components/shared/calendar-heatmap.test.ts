import { describe, expect, it } from "vitest";
import { buildCalendarLayout, resolveCalendarMaxValue } from "./calendar-heatmap";

describe("resolveCalendarMaxValue", () => {
  it("preserves sub-dollar maxima so low spend remains visible", () => {
    expect(resolveCalendarMaxValue(0.01222189)).toBe(0.01222189);
  });

  it("uses a safe fallback only for an empty data set", () => {
    expect(resolveCalendarMaxValue(0)).toBe(1);
  });
});

describe("buildCalendarLayout", () => {
  it("stops at the requested end date and places it in the final week", () => {
    const layout = buildCalendarLayout("2025-08-04", "2026-08-03");

    expect(layout.days.at(-1)).toEqual({
      day: "2026-08-03",
      week: layout.weekCount - 1,
      weekday: 1,
    });
    expect(layout.days.some((day) => day.day === "2026-08-04")).toBe(false);
  });

  it("does not invent trailing cells after a partial week", () => {
    const layout = buildCalendarLayout("2026-07-27", "2026-08-03");

    expect(layout.days.map((day) => day.day)).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });
});
