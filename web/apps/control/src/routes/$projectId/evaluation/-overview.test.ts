import { describe, expect, it } from "vitest";
import { monitorDescription } from "./overview";

describe("Monitor route copy", () => {
  it("describes live production quality and safety signals", () => {
    expect(monitorDescription).toBe(
      "Track live Agent traffic, quality, safety, latency, and cost with configurable evaluator policy.",
    );
  });
});
