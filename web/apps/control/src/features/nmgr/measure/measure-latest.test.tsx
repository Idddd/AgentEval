/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Measure } from "./measure";
import { NmgrApp } from "../app";
import { measureStorageKey } from "./measure-store";
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(
    null,
    "",
    "/v2/guardrails?role=tech#Profile/measure/",
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi
    .fn()
    .mockReturnValue({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("opens the Runner screenshot layout, expands details/planning, refreshes and returns to Measure", () => {
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  render(<NmgrApp mock />);
  fireEvent.click(
    screen.getByRole("button", { name: "Open Guardrail Runners" }),
  );
  expect(window.location.hash).toBe("#Profile/runners/");
  expect(
    screen.getByRole("heading", { name: "Guardrail Runners" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "1 Runner serving" }),
  ).toBeTruthy();
  expect(screen.getByText("Updates every 10s")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "marketplace-uat-local-1" }),
  );
  expect(screen.getByText("7 / 7")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Capacity planning" }));
  expect(
    screen.getByText(/Changing them does not start or stop Runners/),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(screen.getByRole("status").textContent).toContain(
    "Runner data is up to date",
  );
  fireEvent.click(screen.getByRole("button", { name: "Back to Measure" }));
  expect(window.location.hash).toBe("#Profile/measure/");
  expect(network).not.toHaveBeenCalled();
});

it("opens a Runner bookmark only for Tech and cleans up the update timer", () => {
  vi.useFakeTimers();
  window.history.replaceState(
    null,
    "",
    "/v2/guardrails?role=tech#Profile/runners/",
  );
  const { unmount } = render(<NmgrApp mock />);
  expect(
    screen.getByRole("heading", { name: "1 Runner serving" }),
  ).toBeTruthy();
  const before = screen.getByLabelText("Last updated").textContent;
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.getByLabelText("Last updated").textContent).not.toBe(before);
  fireEvent.click(screen.getByRole("tab", { name: "Version" }));
  expect(screen.getByText("NeMo version")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Health" }));
  expect(
    screen.getByText(
      "All connected Runners have applied their current configuration.",
    ),
  ).toBeTruthy();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["User", "User Admin"] as const)(
  "blocks %s from opening a Tech Runner bookmark",
  (role) => {
    window.history.replaceState(
      null,
      "",
      `/v2/guardrails?role=${role === "User" ? "user" : "approver"}#Profile/runners/`,
    );
    render(<NmgrApp mock />);
    expect(
      screen.queryByRole("heading", { name: "1 Runner serving" }),
    ).toBeNull();
    expect(window.location.hash).not.toContain("runners");
  },
);

it("connects QPS to Protection Center with read-only runtime record details", () => {
  render(<Measure role="IT Admin" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Open Protection Center" }),
  );
  expect(screen.getByRole("heading", { name: "Runtime logs" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Outcome"), {
    target: { value: "Blocked" },
  });
  fireEvent.click(
    screen.getAllByRole("button", { name: /^Open runtime record/ })[0]!,
  );
  expect(screen.getByRole("dialog", { name: "Runtime record" })).toBeTruthy();
  expect(localStorage.getItem(measureStorageKey)).toBeNull();
});

function startReport() {
  fireEvent.click(
    screen.getByRole("button", { name: "Customer Information Verifier" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Policy #12356" }));
  fireEvent.click(
    screen.getAllByRole("button", { name: "Report False Positive" })[0]!,
  );
}
it.each(["User", "User Admin"] as const)(
  "requires %s to submit an event report reason and preserves policy position on cancel",
  (role) => {
    render(<Measure role={role} />);
    startReport();
    expect(
      screen.getByRole("heading", { name: "Review false-positive report" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Report Reason")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Submit" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(localStorage.getItem(measureStorageKey)).toBeNull();
    fireEvent.change(screen.getByLabelText("Report Reason"), {
      target: {
        value: "A legitimate process question, not disclosure of private data.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Policy #12356" })).toBeTruthy();
    expect(localStorage.getItem(measureStorageKey)).toBeNull();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Report False Positive" })[0]!,
    );
    fireEvent.change(screen.getByLabelText("Report Reason"), {
      target: { value: "  Legitimate verification guidance.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    const saved = JSON.parse(localStorage.getItem(measureStorageKey)!);
    expect(saved.reports[0]).toMatchObject({
      reportReason: "Legitimate verification guidance.",
      controlUnit: "ISS",
      status: "Pending review",
    });
    expect(screen.getByRole("dialog", { name: "Policy #12356" })).toBeTruthy();
  },
);

it("retains a draft and reason when browser storage rejects report submission", () => {
  render(<Measure role="User" />);
  startReport();
  fireEvent.change(screen.getByLabelText("Report Reason"), {
    target: { value: "Valid report explanation." },
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(
    (screen.getByLabelText("Report Reason") as HTMLTextAreaElement).value,
  ).toBe("Valid report explanation.");
  expect(screen.getByRole("alert").textContent).toMatch(/could not be saved/);
  expect(localStorage.getItem(measureStorageKey)).toBeNull();
});

it("shows the actual submitted reason and reporting unit immediately in the Tech detail sheet", () => {
  const business = render(<Measure role="User" />);
  startReport();
  fireEvent.change(screen.getByLabelText("Report Reason"), {
    target: {
      value: "The approved process question needs no manual escalation.",
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  const report = JSON.parse(localStorage.getItem(measureStorageKey)!)
    .reports[0];
  business.unmount();
  render(<Measure role="IT Admin" />);
  fireEvent.click(
    screen.getByRole("button", { name: `Open report ${report.id}` }),
  );
  const detail = screen.getByRole("dialog", { name: "Report detail" });
  expect(
    within(detail).getByText(
      "The approved process question needs no manual escalation.",
    ),
  ).toBeTruthy();
  expect(within(detail).getByText("Yann GUO / ISS")).toBeTruthy();
});
