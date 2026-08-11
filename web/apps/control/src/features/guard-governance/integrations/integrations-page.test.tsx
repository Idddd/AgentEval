/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { GuardGovernanceProvider } from "../mock-provider";
import { IntegrationsPage } from "./integrations-page";

afterEach(cleanup);

describe("IntegrationsPage", () => {
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

    expect(screen.getByText("Security Gateway")).not.toBeNull();
    expect(screen.getByText(/^tlg_mock_/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Dismiss Credential" }));
    expect(screen.queryByText(/^tlg_mock_/)).toBeNull();
  });
});
