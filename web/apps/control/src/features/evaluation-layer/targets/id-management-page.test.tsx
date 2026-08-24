/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneEvaluationLayerFixtures } from "../fixture-validation";
import { IdManagementPage } from "./id-management-page";

const stateHolder = vi.hoisted(() => ({ value: null as any }));

vi.mock("../mock-provider", () => ({
  useEvaluationLayerState: () => stateHolder.value,
}));

beforeEach(() => {
  stateHolder.value = cloneEvaluationLayerFixtures();
});

afterEach(cleanup);

describe("IdManagementPage", () => {
  it("shows ownership, submitters, and immutable version history", async () => {
    const user = userEvent.setup();
    render(<IdManagementPage />);

    expect(screen.getByText("Target registry")).toBeTruthy();
    const officeRow = screen.getAllByText("Office Assistant")[0]!.closest("tr")!;
    await user.click(within(officeRow).getByRole("button", { name: "View history" }));

    expect(screen.getAllByText("demo-permission-compliance").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Maya Chen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Alex Morgan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("R2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("R1").length).toBeGreaterThan(0);
  });

  it("filters targets by identity or owner", async () => {
    const user = userEvent.setup();
    render(<IdManagementPage />);
    await user.type(screen.getByRole("textbox", { name: "Search target identities" }), "Office Assistant");
    expect(screen.getAllByText("Office Assistant").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sample Security Assistant")).toBeNull();
  });
});
