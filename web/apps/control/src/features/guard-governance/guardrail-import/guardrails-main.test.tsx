/** @vitest-environment jsdom */
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

import { GuardrailDetailPage, GuardrailsPage } from "./guardrails-main";
import { renderImported } from "./test-utils";
import { cloneGuardGovernanceFixtures } from "../fixtures";
import { createGuardGovernanceStore } from "../store";

afterEach(cleanup);

describe("latest Guardrail source workflow", () => {
  it("renders the source registry columns and policy-backed release health", () => {
    renderImported(<GuardrailsPage projectId="individual" />);

    expect(screen.getByRole("heading", { name: "Guardrails" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Guardrail" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Status" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Policies" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Validation Run" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Updated" })).not.toBeNull();
    expect(screen.queryByText("Governance")).toBeNull();
    expect(screen.queryByText("Published versions")).toBeNull();
    expect(screen.queryByText("Require validation or release")).toBeNull();
    const row = screen.getByRole("row", { name: /Production Safety/ });
    expect(within(row).getByText("3")).not.toBeNull();
  });

  it("creates a policy-bound Guardrail from the prefilled source wizard", async () => {
    const user = userEvent.setup();
    renderImported(<GuardrailsPage projectId="individual" />);

    await user.click(screen.getByRole("button", { name: "Create Guardrail" }));
    expect(screen.getByRole("dialog", { name: "Create Guardrail" })).not.toBeNull();
    expect(screen.getByLabelText(/Name \*/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByText("Prompt Injection Protection").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sensitive Data Protection").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByText("Runtime posture").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Review Guardrail")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Create Guardrail" }));

    const createdName = await screen.findByText("Customer Interaction Guardrail");
    const createdRow = createdName.closest("tr");
    expect(createdRow).not.toBeNull();
    expect(within(createdRow!).getByText("2")).not.toBeNull();
  });

  it("exposes Runtime, Findings, Versions, and Draft Release and publishes a revalidated version", async () => {
    const user = userEvent.setup();
    renderImported(<GuardrailDetailPage projectId="individual" guardrailId="guardrail-production" />);

    expect(screen.getByRole("tab", { name: "Runtime" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Security findings" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Versions" })).not.toBeNull();
    await user.click(screen.getByRole("tab", { name: "Draft & release" }));
    await user.click(screen.getByRole("button", { name: "Create new draft" }));
    expect(screen.getByText("Validation required")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Validate draft" }));
    expect(screen.getByText("Validation passed")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Publish version" }));
    expect(screen.getByText("Release 3 active")).not.toBeNull();
  });

  it("shows the immutable Policy name captured by a historical release", async () => {
    const user = userEvent.setup();
    const state = cloneGuardGovernanceFixtures("individual");
    state.policies.find((policy) => policy.id === "policy-sensitive-data")!.name = "Renamed live Policy";
    const store = createGuardGovernanceStore(state);
    renderImported(
      <GuardrailDetailPage projectId="individual" guardrailId="guardrail-production" />,
      { store },
    );

    await user.click(screen.getByRole("tab", { name: "Versions" }));

    expect(screen.getByText("Sensitive Data Protection · v1")).not.toBeNull();
    expect(screen.queryByText("Renamed live Policy · v1")).toBeNull();
  });
});
