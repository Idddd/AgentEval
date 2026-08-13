/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CreationFlow } from "./components/creation-flow";
import { EntitySheet } from "./components/entity-sheet";
import "./guardrail-theme.css";

describe("Guard source visual foundation", () => {
  it("keeps the original creation step dimensions", () => {
    render(
      <CreationFlow
        currentStep={0}
        onStepChange={() => undefined}
        progressLabel="Create"
        steps={[{ label: "Start", description: "Choose source" }]}
      >
        <div>Body</div>
      </CreationFlow>,
    );

    expect(screen.getByRole("button", { name: /Start/ }).className).toContain(
      "min-h-20",
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
    expect(css).toContain("--radius-card: 0.75rem");
    expect(css).toContain("--radius-large: 1rem");
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
