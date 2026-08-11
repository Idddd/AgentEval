/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { GuardGovernanceProvider } from "../mock-provider";
import { AssignmentsPage } from "./assignments-page";

afterEach(cleanup);

describe("AssignmentsPage", () => {
  it("shows the immutable default baseline, pinned versions, and recursive scopes", () => {
    render(
      <GuardGovernanceProvider projectId="individual">
        <AssignmentsPage />
      </GuardGovernanceProvider>,
    );

    expect(screen.getByText("Default unmatched traffic")).not.toBeNull();
    expect(screen.getByText("Baseline")).not.toBeNull();
    expect(screen.getAllByText(/Guardrail Version 2/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Verified JWT claim:department/)).not.toBeNull();
  });

  it("creates an Assignment with a Ready Guardrail and valid traffic scope", async () => {
    const user = userEvent.setup();
    render(
      <GuardGovernanceProvider projectId="individual">
        <AssignmentsPage />
      </GuardGovernanceProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Create Assignment" }));
    const guardrailSelect = screen.getByLabelText("Guardrail");
    expect(within(guardrailSelect).getByRole("option", { name: "Production Safety" })).not.toBeNull();
    expect(within(guardrailSelect).queryByRole("option", { name: "Claims Safety" })).toBeNull();

    await user.type(screen.getByLabelText("Assignment name"), "Finance traffic");
    await user.clear(screen.getByLabelText("Rule 1 value"));
    await user.type(screen.getByLabelText("Rule 1 value"), "finance");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByText("Finance traffic")).not.toBeNull();
  });
});
