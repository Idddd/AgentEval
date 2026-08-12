/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneEvaluationLayerFixtures } from "../fixture-validation";
import { EvaluationLayerProvider } from "../mock-provider";
import { createEvaluationLayerStore } from "../mock-store";
import { EvaluationOverviewPage } from "./overview-page";

vi.mock("@/hooks/use-project", () => ({
  useCurrentProjectId: () => "individual",
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => (
    <a href="#trace">{children}</a>
  ),
}));

afterEach(cleanup);

function renderOverview() {
  const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
  render(
    <EvaluationLayerProvider projectId="individual" store={store}>
      <EvaluationOverviewPage />
    </EvaluationLayerProvider>,
  );
  return store;
}

describe("EvaluationOverviewPage", () => {
  it("puts Sampling and evaluator policy inside one Evaluators section", () => {
    renderOverview();

    const evaluators = within(
      screen.getByRole("region", { name: "Evaluators" }),
    );
    expect(screen.queryByRole("tab", { name: "Evaluators" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Sampling" })).toBeNull();
    expect(
      evaluators.getByRole("slider", { name: "Sampling rate" }),
    ).toBeTruthy();
    expect(
      evaluators.getByRole("slider", { name: "Minimum score threshold" }),
    ).toBeTruthy();
    expect(
      evaluators.getByRole("checkbox", { name: "Send alert" }),
    ).toBeTruthy();
    expect(evaluators.getByText("Captured")).toBeTruthy();
    expect(evaluators.getByText("Dropped failures")).toBeTruthy();
  });

  it("updates threshold and mock alert settings through real store commands", async () => {
    const user = userEvent.setup();
    const store = renderOverview();

    await user.click(screen.getByRole("checkbox", { name: "Send alert" }));
    const threshold = screen.getByRole("spinbutton", {
      name: "Minimum score threshold value",
    });
    await user.clear(threshold);
    await user.type(threshold, "90");

    expect(store.getState().settings.sendEvaluatorAlert).toBe(true);
    expect(store.getState().settings.minimumEvaluatorScore).toBe(90);
  });

  it("shows Score before Status with evaluator pass totals", async () => {
    const user = userEvent.setup();
    renderOverview();

    const headers = screen
      .getAllByRole("columnheader")
      .map((item) => item.textContent);
    expect(headers.indexOf("Score")).toBeLessThan(headers.indexOf("Status"));

    const failedRow = screen.getByText("jailbreak-guard-bypass").closest("tr")!;
    const score = within(failedRow).getByRole("button", {
      name: /evaluator score: \d+ of 2 passed/i,
    });
    expect(score.className).toContain("text-red");
    expect(within(failedRow).getByText("FAIL")).toBeTruthy();

    await user.click(score);
    expect(screen.getAllByText("Permission compliance").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Recorded demo judge").length).toBeGreaterThan(1);
    expect(screen.getAllByText(/%/).length).toBeGreaterThan(0);
  });

  it("binds alert and failure filtering to the derived evaluator status", async () => {
    const user = userEvent.setup();
    renderOverview();

    await user.click(screen.getByRole("checkbox", { name: "Send alert" }));
    const failedRow = screen.getByText("jailbreak-guard-bypass").closest("tr")!;
    expect(within(failedRow).getByText("Alert triggered")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Failures/ }));
    expect(screen.getByText("jailbreak-guard-bypass")).toBeTruthy();
    expect(screen.queryByText("weather-guest-allow")).toBeNull();
  });

  it("preserves runtime ERROR when evaluator scores are below threshold", () => {
    renderOverview();

    const runtimeError = screen
      .getAllByText("salary-employee-deny")
      .map((item) => item.closest("tr"))
      .find((row) => row?.textContent?.includes("ERROR"));
    expect(runtimeError).toBeTruthy();
    expect(within(runtimeError!).getByText("ERROR")).toBeTruthy();
  });
});
