/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Measure } from "./measure";
import { measureStorageKey } from "./measure-store";

it("opens the existing dashboard from the scan overview", () => {
  const dashboard = vi.fn();
  render(<Measure role="User" onDashboard={dashboard} />);
  fireEvent.click(screen.getByRole("button", { name: "Open scan dashboard" }));
  expect(dashboard).toHaveBeenCalledOnce();
});

it("jumps to and ranks agents by the selected hit metric without changing the source numbers", () => {
  render(<Measure role="User" />);
  fireEvent.click(
    screen.getByRole("button", { name: "View agents with blocked hits" }),
  );
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("row")[1]!.textContent).toContain(
    "Customer Feedback Analyzer",
  );
  expect(
    within(table)
      .getByRole("columnheader", { name: "Blocked" })
      .getAttribute("aria-sort"),
  ).toBe("descending");
  fireEvent.click(screen.getByRole("button", { name: "Clear metric focus" }));
  expect(within(table).getAllByRole("row")[1]!.textContent).toContain(
    "Customer Information Verifier",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "View agents with transformed hits" }),
  );
  expect(within(table).getAllByRole("row")[1]!.textContent).toContain(
    "Enterprise Loan Assessor",
  );
});

it.each([
  ["User", "Most Used Model of Month", "OpenAPI", "8069"],
  ["User Admin", "Least Used Model of Month", "Google", "12"],
] as const)(
  "opens the %s model usage summary without leaving the current agent page",
  (role, title, provider, queries) => {
    render(<Measure role={role} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(
      screen.getByRole("button", { name: `View summary: ${title}` }),
    );
    const summary = screen.getByRole("dialog", { name: "Model usage summary" });
    expect(within(summary).getByText(provider, { exact: true })).toBeTruthy();
    expect(within(summary).getByText(queries, { exact: true })).toBeTruthy();
    fireEvent.click(
      within(summary).getAllByRole("button", { name: "Close" })[0]!,
    );
    expect(screen.getByText("Page 2 / 2")).toBeTruthy();
  },
);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(["User", "IT Admin"] as const)(
  "keeps unreadable saved reports visible as an error for %s",
  (role) => {
    localStorage.setItem(measureStorageKey, "broken saved reports");
    render(<Measure role={role} />);
    expect(screen.getByRole("alert").textContent).toMatch(
      /saved Measure reports could not be read/i,
    );
    expect(localStorage.getItem(measureStorageKey)).toBe(
      "broken saved reports",
    );
  },
);

it("continues to the next report after a review removes the current item from the pending filter", () => {
  render(<Measure role="IT Admin" />);
  fireEvent.change(screen.getByLabelText("Report status"), {
    target: { value: "Pending review" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Open report FPR-2026-00420" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review & Decision" }));
  fireEvent.change(screen.getByLabelText("Review reason *"), {
    target: { value: "Reviewed historical evidence." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
  fireEvent.click(screen.getByRole("button", { name: "Next report" }));
  expect(
    within(screen.getByRole("dialog", { name: "Report detail" })).getByText(
      "FPR-2026-00422",
      { exact: true },
    ),
  ).toBeTruthy();
});

it.each(["User", "User Admin"] as const)(
  "lets %s drill into an agent and policy, report an event and close one level at a time",
  (role) => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    render(<Measure role={role} />);
    expect(
      screen.getByText("Last 10 Minutes in Your Control Unit"),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Customer Information Verifier" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Hits Threshold Breach" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Policy #12356" }));
    const dialog = screen.getByRole("dialog", { name: "Policy #12356" });
    fireEvent.click(
      within(dialog).getAllByRole("button", {
        name: "Report False Positive",
      })[0]!,
    );
    fireEvent.change(screen.getByLabelText("Report Reason"), { target: { value: "This is a valid verification process question." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    const returnedDialog = screen.getByRole("dialog", { name: "Policy #12356" });
    expect(
      within(returnedDialog).getAllByText("False Positive Reported").length,
    ).toBeGreaterThan(3);
    fireEvent.click(
      within(returnedDialog).getAllByRole("button", { name: "Close" })[0]!,
    );
    expect(
      screen.getByRole("dialog", { name: "Hits Threshold Breach" }),
    ).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(network).not.toHaveBeenCalled();
  },
);

it("preserves report filters and page while a technical reviewer opens, cancels and closes a report", () => {
  render(<Measure role="IT Admin" />);
  fireEvent.change(screen.getByLabelText("Report status"), {
    target: { value: "Pending review" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  const first = screen.getAllByRole("button", { name: /^Open report / })[0]!;
  const label = first.getAttribute("aria-label")!;
  fireEvent.click(first);
  fireEvent.click(screen.getByRole("button", { name: "Review & Decision" }));
  expect(
    screen.getByRole("heading", { name: "Review false-positive report" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("dialog", { name: "Report detail" })).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
  expect(
    (screen.getByLabelText("Report status") as HTMLSelectElement).value,
  ).toBe("Pending review");
  expect(screen.getByText("Page 2 / 2")).toBeTruthy();
  expect(screen.getByRole("button", { name: label })).toBeTruthy();
});

it.each(["Confirm false positive", "Not a false positive"] as const)(
  "submits %s with an event-only completion and a persisted audit record",
  (decision) => {
    render(<Measure role="IT Admin" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Open report FPR-2026-00418" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review & Decision" }));
    fireEvent.click(screen.getByRole("radio", { name: decision }));
    fireEvent.change(screen.getByLabelText("Review reason *"), {
      target: { value: "Checked the original event and historical policy." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
    expect(
      screen.getByRole("heading", { name: "Report reviewed" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Decision recorded for this report only. Production policy and guardrails are unchanged.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Checked the original event and historical policy."),
    ).toBeTruthy();
    cleanup();
    render(<Measure role="IT Admin" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Open report FPR-2026-00418" }),
    );
    expect(
      screen.getByRole("heading", { name: "Report reviewed" }),
    ).toBeTruthy();
  },
);

it("requires a review reason and leaves the review editable when browser persistence fails", () => {
  render(<Measure role="IT Admin" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Open report FPR-2026-00418" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review & Decision" }));
  fireEvent.change(screen.getByLabelText("Review reason *"), {
    target: { value: "" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Submit review" }).closest("form")!,
  );
  expect(screen.getByRole("alert").textContent).toMatch(/reason/i);
  fireEvent.change(screen.getByLabelText("Review reason *"), {
    target: { value: "Checked evidence." },
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Full");
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
  expect(screen.getByRole("alert").textContent).toMatch(/could not be saved/i);
  expect(
    screen.getByRole("heading", { name: "Review false-positive report" }),
  ).toBeTruthy();
  vi.restoreAllMocks();
});

it("removes technical report details and decisions when the workbench role changes", () => {
  const { rerender } = render(<Measure role="IT Admin" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Open report FPR-2026-00418" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review & Decision" }));
  rerender(<Measure role="User" />);
  expect(screen.queryByRole("button", { name: "Submit review" })).toBeNull();
  expect(
    screen.queryByRole("heading", { name: "Review false-positive report" }),
  ).toBeNull();
});
