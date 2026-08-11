/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { GuardGovernanceProvider } from "../mock-provider";
import { GuardrailDetailPage } from "./guardrail-detail-page";
import { GuardrailsPage } from "./guardrails-page";

function renderGovernance(node: React.ReactNode) {
  return render(
    <GuardGovernanceProvider projectId="individual">
      {node}
    </GuardGovernanceProvider>,
  );
}

afterEach(cleanup);

describe("Guardrails workflow", () => {
  it("creates a Guardrail and exposes it in the collection", async () => {
    const user = userEvent.setup();
    renderGovernance(<GuardrailsPage projectId="individual" />);

    await user.click(screen.getByRole("button", { name: "Create Guardrail" }));
    await user.type(screen.getByLabelText("Name"), "Claims Protection");
    await user.type(
      screen.getByLabelText("Purpose"),
      "Protect claims traffic",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByText("Claims Protection")).not.toBeNull();
    expect(screen.getAllByText("needs testing").length).toBeGreaterThan(0);
  });

  it("keeps the creation sheet open with a field error for an empty name", async () => {
    const user = userEvent.setup();
    renderGovernance(<GuardrailsPage projectId="individual" />);

    await user.click(screen.getByRole("button", { name: "Create Guardrail" }));
    await user.type(screen.getByLabelText("Purpose"), "Valid purpose");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert").textContent).toContain("Name is required");
    expect(screen.getByRole("heading", { name: "Create Guardrail" })).not.toBeNull();
  });

  it("runs test cases and promotes the Guardrail to Ready", async () => {
    const user = userEvent.setup();
    renderGovernance(<GuardrailDetailPage guardrailId="guardrail-draft" projectId="individual" />);

    expect(screen.getByText("needs testing")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Run test" }));

    await waitFor(() => expect(screen.getByText("ready")).not.toBeNull());
    expect(screen.getByText(/2 Evidence events generated/)).not.toBeNull();
  });

  it("disables test execution when no Test Cases exist", () => {
    renderGovernance(<GuardrailDetailPage guardrailId="guardrail-disabled" projectId="individual" />);
    expect(
      (screen.getByRole("button", { name: "Run test" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
