/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloneEvaluationLayerFixtures } from "../fixture-validation";
import { BehaviorPage } from "./behavior-page";

const stateHolder = vi.hoisted(() => ({ value: null as any }));

vi.mock("../mock-provider", () => ({
  useEvaluationLayerState: () => stateHolder.value,
}));

beforeEach(() => {
  stateHolder.value = cloneEvaluationLayerFixtures();
});

afterEach(cleanup);

describe("BehaviorPage", () => {
  it("shows recorded model calls and explains a policy violation with the LLM review", async () => {
    const user = userEvent.setup();
    render(<BehaviorPage />);

    expect(screen.getByText("Model call history")).toBeTruthy();
    expect(screen.getByText("Runtime log")).toBeTruthy();
    const failedRow = screen.getByText("jailbreak-guard-bypass").closest("tr")!;
    await user.click(within(failedRow).getByRole("button", { name: "Inspect" }));
    await user.click(screen.getByRole("button", { name: "Review with LLM" }));

    expect(screen.getByText("Violation detected")).toBeTruthy();
    expect(screen.getByText("Authorization boundary")).toBeTruthy();
    expect(screen.getAllByText(/continued after access should have been denied/i).length).toBeGreaterThan(0);
  });

  it("marks compliant behavior clear after review", async () => {
    const user = userEvent.setup();
    render(<BehaviorPage />);
    const clearRow = screen.getByText("weather-guest-allow").closest("tr")!;
    await user.click(within(clearRow).getByRole("button", { name: "Inspect" }));
    await user.click(screen.getByRole("button", { name: "Review with LLM" }));
    expect(screen.getAllByText("No violation detected").length).toBeGreaterThan(0);
  });
});
