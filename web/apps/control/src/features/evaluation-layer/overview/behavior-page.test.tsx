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

  it("ranks the four most frequent observed risk signals", () => {
    render(<BehaviorPage />);

    expect(screen.getByText("Top risk signals")).toBeTruthy();
    for (const label of ["Prompt injection", "Sensitive data leak", "Unsafe tool calls", "Execution errors"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Showing top 4 of/)).toBeTruthy();
    expect(screen.queryByText(/Add detector/i)).toBeNull();
  });

  it("elevates Risk Agent after multiple related anomalies", async () => {
    const user = userEvent.setup();
    render(<BehaviorPage />);

    const observationRow = screen.getByText("Multiple related anomalies").closest("tr")!;
    expect(within(observationRow).getByText("Elevated")).toBeTruthy();
    expect(within(observationRow).getByText(/4 anomalies \/ 5 min/)).toBeTruthy();

    await user.type(screen.getByRole("textbox", { name: "Search model calls" }), "Risk Agent");
    const historyRows = screen
      .getAllByText("Risk Agent")
      .map((item) => item.closest("tr"))
      .filter((row): row is HTMLTableRowElement => row !== null && row !== observationRow);

    expect(historyRows).toHaveLength(4);
    for (const row of historyRows) {
      expect(within(row).queryByText("PASS")).toBeNull();
      expect(within(row).getByText(/FAIL|ERROR/)).toBeTruthy();
    }
  });

  it("shows normal behavior alongside flagged calls by default", () => {
    render(<BehaviorPage />);

    expect(screen.getAllByText("Clear").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Flagged").length).toBeGreaterThan(0);
    expect(screen.getAllByText("PASS").length).toBeGreaterThan(0);
    expect((screen.getByRole("combobox", { name: "Behavior" }) as HTMLSelectElement).value).toBe("ALL");
  });

  it("keeps Risk Agent as the only dangerous target in the demo", () => {
    render(<BehaviorPage />);

    const observationRows = screen.getByRole("region", { name: "Agents under observation" }).querySelectorAll<HTMLTableRowElement>("tbody tr");
    expect(observationRows).toHaveLength(4);
    expect(within(observationRows[0]!).getByText("Elevated")).toBeTruthy();
    for (const row of Array.from(observationRows).slice(1)) {
      expect(within(row).getByText("Normal")).toBeTruthy();
      expect(within(row).getByText("No anomalies")).toBeTruthy();
    }
  });

  it("interleaves Risk Agent failures through otherwise normal history", () => {
    render(<BehaviorPage />);

    const historyRows = Array.from(document.querySelectorAll<HTMLTableRowElement>("table[data-density='compact'] tbody tr"));
    const riskPositions = historyRows
      .map((row, index) => within(row).queryByText("Risk Agent") ? index : -1)
      .filter((index) => index >= 0);

    expect(riskPositions.length).toBeGreaterThan(1);
    expect(riskPositions[0]).toBeGreaterThan(0);
    expect(riskPositions[1]! - riskPositions[0]!).toBeGreaterThan(1);
    expect(within(historyRows[riskPositions[0]!]!).getByText(/FAIL|ERROR/)).toBeTruthy();
  });

  it("sends an alert from the Risk Agent observation", async () => {
    const user = userEvent.setup();
    render(<BehaviorPage />);

    expect(screen.getAllByRole("button", { name: /Send alert/ })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Send alert for Risk Agent" }));

    expect(screen.getByRole("status").textContent).toBe(
      "Alert sent to security-ops@tasklattice.local.",
    );
    expect((screen.getByRole("button", { name: "Send alert for Risk Agent" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("filters from risk cards and toggles the active card off", async () => {
    const user = userEvent.setup();
    render(<BehaviorPage />);

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
