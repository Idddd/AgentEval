/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CreationFlow } from "./components/creation-flow";
import { EntitySheet } from "./components/entity-sheet";
import "./guardrail-theme.css";

describe("Guard source visual foundation", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  it("keeps the main branch sidebar creation flow", () => {
    render(
      <CreationFlow
        orientation="sidebar"
        currentStep={0}
        onStepChange={() => undefined}
        progressLabel="Create"
        steps={[{ label: "Start", description: "Choose source" }]}
      >
        <div>Body</div>
      </CreationFlow>,
    );

    expect(screen.getByRole("tablist").className).toContain(
      "border-r",
    );
    expect(screen.getByRole("tab", { name: /Start/ }).className).toContain(
      "items-start",
    );
  });

  it("copies the exact Guard theme values", () => {
    const css = readFileSync(
      resolve(
        "src/features/guard-governance/guardrail-import/guardrail-theme.css",
      ),
      "utf8",
    );
    expect(css).toContain("--primary: #2563eb");
    expect(css).toContain("--radius-badge: 0.25rem");
    expect(css).toContain("--radius-control: 0.375rem");
    expect(css).toContain("--radius-card: 0.5rem");
    expect(css).toContain("--radius-large: 0.625rem");
    expect(css).toContain('font-family: "Hanken Grotesk"');
  });

  it("marks sheet portal content with the Guard namespace", () => {
    render(
      <EntitySheet
        open
        onOpenChange={() => undefined}
        title="Create"
        description="Description"
        eyebrow="Guardrail"
        footer={null}
        width="xl"
      >
        <div>Body</div>
      </EntitySheet>,
    );

    expect(document.querySelector(".guardrail-import")).not.toBeNull();
  });
});
