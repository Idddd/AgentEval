import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GatewaySyncStatus } from "./gateway-sync-status";

describe("GatewaySyncStatus", () => {
  it.each([
    ["READY", "Synchronized", "text-emerald-700"],
    ["VALIDATING", "Synchronizing", "text-amber-700"],
    ["DEGRADED", "Gateway sync failed", "text-destructive"],
  ] as const)("maps %s to its gateway sync signal", (status, label, color) => {
    const markup = renderToStaticMarkup(
      createElement(GatewaySyncStatus, { compact: true, status }),
    );

    expect(markup).toContain(label);
    expect(markup).toContain(color);
  });
});
