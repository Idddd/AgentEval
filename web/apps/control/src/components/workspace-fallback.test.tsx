/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceBoundary } from "./workspace-fallback";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("recovers a broken workspace render with deployment guidance and explicit mock link", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  function Broken(): never { throw new Error("chunk unavailable"); }
  render(<WorkspaceBoundary><Broken /></WorkspaceBoundary>);
  expect(screen.getByRole("alert").textContent).toContain("workspace_render_failed");
  expect(screen.getByRole("button", { name: "Reload workspace" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open Mock V2" }).getAttribute("href")).toBe("/v2/guardrails");
  expect(log.mock.calls.some(([entry]) => typeof entry === "string" && entry.includes('"event":"workspace_render_failed"'))).toBe(true);
});
