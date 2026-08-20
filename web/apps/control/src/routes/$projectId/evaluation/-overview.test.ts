import { describe, expect, it } from "vitest";
import { monitorDescription } from "./overview";

describe("Monitor route copy", () => {
  it("describes session business health", () => {
    expect(monitorDescription).toBe(
      "Track adoption, business outcomes, approvals, and safety signals for this demo session.",
    );
  });
});
