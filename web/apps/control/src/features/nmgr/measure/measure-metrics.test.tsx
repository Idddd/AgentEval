/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SystemMetrics } from "./measure-metrics";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("preserves the two design navigation targets without extra actions or copy", () => {
  const onCenter = vi.fn();
  render(<SystemMetrics onCenter={onCenter} />);
  expect(screen.getAllByRole("button")).toHaveLength(2);
  for (const text of [
    "View Runners",
    "Protection Center",
    "Data",
    "Runner instances, health & capacity",
    "65.2% of quota",
    "No errors recorded",
    "Response time by percentile",
    "Normal",
    "Elevated",
    "+15.0%",
    "10 min · Mock data",
  ]) {
    expect(screen.queryByText(text, { exact: true })).toBeNull();
  }
  const runners = screen.getByRole("button", {
    name: "Open Guardrail Runners",
    description: /326.*500/,
  });
  fireEvent.click(within(runners).getByText("Runners (Running / Quota)"));
  expect(onCenter).toHaveBeenLastCalledWith("runners");
  fireEvent.click(
    screen.getByRole("button", { name: "Open Protection Center" }),
  );
  expect(onCenter).toHaveBeenLastCalledWith("protection");
});
it.each([
  ["Throughput", "12468 QPS"],
  ["VRAM Usage", "68.22 GB"],
  ["RAM Usage", "36.98 GB"],
  ["GPU Usage", "72.42 %"],
  ["CPU Usage", "34.65 %"],
])(
  "keeps %s as a numeric trend without adding a data-table flow",
  (title, latest) => {
    render(<SystemMetrics onCenter={vi.fn()} />);
    const chart = screen.getByRole("img", { name: `${title} mock data trend` });
    expect(chart.tagName.toLowerCase()).toBe("svg");
    expect(
      within(chart).getByLabelText(`${title}, Now: ${latest}`),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: `View ${title} data` }),
    ).toBeNull();
    expect(screen.queryByRole("table", { name: `${title} data` })).toBeNull();
  },
);
