/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { GuardGovernanceProvider } from "../mock-provider";
import { GuardrailDetailPage } from "./guardrail-detail-page";
import { GuardrailsPage } from "./guardrails-page";

function renderGovernance(node: React.ReactNode) {
  return render(
    <GuardGovernanceProvider projectId="individual">{node}</GuardGovernanceProvider>,
  );
}

afterEach(cleanup);

describe("complete Guardrails workflow", () => {
  it("shows built-in ownership, test compliance, assignments, and update time", () => {
    renderGovernance(<GuardrailsPage projectId="individual" />);

    expect(screen.getByText("Built-in")).not.toBeNull();
    expect(screen.getByText("100% compliance")).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Test evidence" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Last updated" })).not.toBeNull();
    expect(screen.getByText("5 reviewed cases")).not.toBeNull();
  });

  it("creates a Guardrail through the three-step template flow", async () => {
    const user = userEvent.setup();
    renderGovernance(<GuardrailsPage projectId="individual" />);

    await user.click(screen.getByRole("button", { name: "Create Guardrail" }));
    await user.click(screen.getByRole("button", { name: /Advanced PII Protection \(Australia\)/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.clear(screen.getByLabelText("Guardrail name"));
    await user.type(screen.getByLabelText("Guardrail name"), "Claims Protection");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Review controls")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByText("Claims Protection")).not.toBeNull();
    expect(screen.getAllByText("needs testing").length).toBeGreaterThan(0);
  });

  it("restores all five Guardrail detail tabs and workflow evidence", async () => {
    const user = userEvent.setup();
    renderGovernance(
      <GuardrailDetailPage guardrailId="guardrail-production" projectId="individual" />,
    );

    expect(screen.getByText("Workflow")).not.toBeNull();
    for (const name of ["Intent", "Controls", "Test Cases", "Versions", "Assignments"]) {
      expect(screen.getByRole("tab", { name })).not.toBeNull();
    }
    expect(screen.getByText("100% compliance")).not.toBeNull();

    await user.click(screen.getByRole("tab", { name: "Versions" }));
    expect(screen.getByText("sha256:prod-v2-a3c8")).not.toBeNull();
    await user.click(screen.getByRole("tab", { name: "Assignments" }));
    expect(screen.getByText("Verified support routes")).not.toBeNull();
  });

  it("keeps the built-in baseline read-only", () => {
    renderGovernance(
      <GuardrailDetailPage guardrailId="guardrail-default" projectId="individual" />,
    );

    expect(screen.queryByRole("button", { name: "Edit intent" })).toBeNull();
    expect(screen.getAllByText("Product-managed baseline").length).toBeGreaterThan(0);
  });
});
