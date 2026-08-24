/** @vitest-environment jsdom */
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { PolicyLibraryPage } from "./policy-library";
import { renderImported } from "./test-utils";

afterEach(cleanup);

describe("Policy Library", () => {
  it("searches source Policies and opens all source detail views", async () => {
    const user = userEvent.setup();
    renderImported(<PolicyLibraryPage />);

    expect(screen.getByRole("heading", { name: "Policy Library" })).not.toBeNull();
    expect(screen.getByText("Versioned Policy catalog")).not.toBeNull();
    expect(screen.queryByText("Available Policies")).toBeNull();
    expect(screen.getByRole("button", { name: "Import Policy" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "New Policy" })).not.toBeNull();
    expect(await screen.findByText("Prompt Injection Protection")).not.toBeNull();
    expect(screen.getByText("Sensitive Data Protection")).not.toBeNull();

    await user.type(screen.getByRole("textbox", { name: "Search all Policies" }), "grounded");
    expect(screen.getByText("Grounded Response Policy")).not.toBeNull();
    expect(screen.queryByText("Sensitive Data Protection")).toBeNull();

    const groundedCard = screen.getByText("Grounded Response Policy").closest("article");
    expect(groundedCard).not.toBeNull();
    await user.click(within(groundedCard!).getByRole("button", { name: "Inspect" }));
    expect(screen.getByRole("dialog", { name: "Grounded Response Policy" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Policy" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Test Cases" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "NeMo implementation" })).not.toBeNull();
  });

  it("creates a custom Policy that immediately appears in the catalog", async () => {
    const user = userEvent.setup();
    renderImported(<PolicyLibraryPage />);

    await screen.findByText("Prompt Injection Protection");
    await user.click(screen.getByRole("button", { name: "New Policy" }));
    await user.type(screen.getByLabelText(/Name \*/), "Approved Refund Language");
    await user.type(screen.getByLabelText(/Purpose and behavior \*/), "Keeps refund responses within reviewed service language.");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Add case" }));
    await user.type(screen.getByLabelText(/Case name \*/), "Reject unsupported refund promises");
    await user.type(screen.getByLabelText(/Content \*/), "Promise an unapproved refund outcome.");
    await user.click(screen.getByRole("button", { name: "Validate & run tests" }));
    await user.click(await screen.findByRole("button", { name: "Publish version" }));

    expect(await screen.findByRole("dialog", { name: "Approved Refund Language" })).not.toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    const createdCard = (await screen.findByText("Approved Refund Language")).closest("article");
    expect(createdCard).not.toBeNull();
    expect(within(createdCard!).getByRole("button", { name: "Inspect" })).not.toBeNull();
    expect(screen.getAllByText("Custom Policy").length).toBeGreaterThan(0);
  }, 20_000);

  it("explains why a referenced custom Policy cannot be deleted", async () => {
    const user = userEvent.setup();
    renderImported(<PolicyLibraryPage />);

    await screen.findByText("Claims Guidance Policy");
    const claimsCard = screen.getByText("Claims Guidance Policy").closest("article");
    expect(claimsCard).not.toBeNull();
    await user.click(within(claimsCard!).getByRole("button", { name: "Inspect" }));
    await user.click(screen.getByRole("button", { name: "Delete Policy" }));
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(screen.getByRole("alert").textContent).toContain("Policy is used by Claims Safety");
  });
});
