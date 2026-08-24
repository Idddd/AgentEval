/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { GuardGovernanceProvider } from "../mock-provider";
import { IntegrationsPage } from "./integrations-page";

afterEach(cleanup);

describe("IntegrationsPage", () => {
  it("shows complete system capability and runtime information", async () => {
    const user = userEvent.setup();
    render(
      <GuardGovernanceProvider projectId="individual">
        <IntegrationsPage />
      </GuardGovernanceProvider>,
    );

    expect(screen.getByText("System health")).not.toBeNull();
    expect(screen.getByText("Local deterministic detection")).not.toBeNull();
    expect(screen.getByText("Fast semantic")).not.toBeNull();
    expect(screen.getByText("Deep judge")).not.toBeNull();
    expect(screen.getByText("Automated reasoning")).not.toBeNull();
    expect(screen.getByText("18,420 requests / 12 errors")).not.toBeNull();
    expect(screen.getByText("online")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /Production LiteLLM/ }));
    expect(screen.getByText("Runtime activity")).not.toBeNull();
    expect(screen.getAllByText("verified").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("tlg_live_8f21")).not.toBeNull();
    expect(screen.getByText("Trusted traffic context")).not.toBeNull();
  });

  it("registers an Integration and displays its Credential once", async () => {
    const user = userEvent.setup();
    render(
      <GuardGovernanceProvider projectId="individual">
        <IntegrationsPage />
      </GuardGovernanceProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Register Integration" }));
    await user.type(screen.getByLabelText("Name"), "Security Gateway");
    await user.selectOptions(screen.getByLabelText("Protocol"), "a2a");
    await user.selectOptions(screen.getByLabelText("Environment"), "test");
    await user.click(screen.getByRole("button", { name: "Register" }));

    expect(screen.getByText("One-time Credential")).not.toBeNull();
    expect(screen.getByText(/^tlg_mock_/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByText("Security Gateway")).not.toBeNull();
    expect(screen.queryByText(/^tlg_mock_/)).toBeNull();
  });
});
