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
  it("keeps the page focused on the behavior list without call inspection panels", () => {
    render(<BehaviorPage />);

    expect(screen.getByText("Model call history")).toBeTruthy();
    expect(screen.queryByText("Call inspection")).toBeNull();
    expect(screen.queryByText("Runtime log")).toBeNull();
  });

  it("renders four dangerous behavior metrics with risk styling", () => {
    render(<BehaviorPage />);

    for (const label of ["Prompt injection", "Sensitive data leak", "Unsafe tool calls", "Execution errors"]) {
      const metric = screen.getAllByText(label).map((item) => item.closest('[data-slot="card"]')).find(Boolean);
      expect(metric).toBeTruthy();
      expect(metric?.className).toContain("border-destructive");
    }
  });

  it("adds a Risk Agent whose recorded behavior is entirely FAIL or ERROR", async () => {
    const user = userEvent.setup();
    render(<BehaviorPage />);

    await user.type(screen.getByRole("textbox", { name: "Search model calls" }), "Risk Agent");
    const rows = screen
      .getAllByText("Risk Agent")
      .map((item) => item.closest("tr"))
      .filter((row): row is HTMLTableRowElement => row !== null);

    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(within(row).queryByText("PASS")).toBeNull();
      expect(within(row).getByText(/FAIL|ERROR/)).toBeTruthy();
    }
  });

  it("filters from risk cards and toggles the active card off", async () => {
    const user = userEvent.setup();
    render(<BehaviorPage />);

    expect(screen.queryByRole("combobox", { name: "Behavior risk" })).toBeNull();
    const dataLeakCard = screen.getByRole("button", { name: /Sensitive data leak/i });
    await user.click(dataLeakCard);
    expect(screen.getByText("pii-data-exfiltration")).toBeTruthy();
    expect(screen.queryByText("destructive-tool-escalation")).toBeNull();
    expect(dataLeakCard.getAttribute("aria-pressed")).toBe("true");

    await user.click(dataLeakCard);
    expect(screen.getByText("destructive-tool-escalation")).toBeTruthy();
    expect(dataLeakCard.getAttribute("aria-pressed")).toBe("false");
  });
});
