// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

import { renderImported } from "../guardrail-import/test-utils";
import { RelayGuardrailPreviewPage } from "./relay-guardrail-preview";

describe("Relay Guardrail comparison", () => {
  it("renders the copied runtime configuration", () => {
    renderImported(<RelayGuardrailPreviewPage projectId="individual" />);

    expect(
      screen.getByRole("heading", { name: "Relay Guardrail" }),
    ).not.toBeNull();
    expect(screen.getByLabelText("Integration base URL")).not.toBeNull();
    expect(screen.getByLabelText("Before model")).not.toBeNull();
    expect(screen.getByText("Runtime summary")).not.toBeNull();
  });
});
