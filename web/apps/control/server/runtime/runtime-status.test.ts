import { describe, expect, it } from "vitest";
import { runtimeStatusFromHealth } from "./runtime-status";

describe("runtimeStatusFromHealth", () => {
  it("never exposes a terminal for the fixture runner", () => {
    expect(runtimeStatusFromHealth({ ok: true, mode: "fixture" })).toMatchObject({
      mode: "fixture",
      terminal: {
        available: false,
        kind: "nemoclaw-tui",
        transport: "none",
      },
    });
  });

  it("exposes the TUI only through a real OpenShell runtime", () => {
    expect(
      runtimeStatusFromHealth({ ok: true, mode: "openshell-kubernetes" }),
    ).toEqual({
      mode: "openshell-kubernetes",
      terminal: {
        available: true,
        kind: "nemoclaw-tui",
        transport: "openshell",
      },
    });
  });
});
