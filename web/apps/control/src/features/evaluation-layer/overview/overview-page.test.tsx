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
  it("puts row-scoped evaluator policy and compact Sampling inside one section", () => {
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
      evaluators.getByRole("spinbutton", {
        name: "Minimum score for Permission compliance",
      }),
    ).toBeTruthy();
    expect(
      evaluators.getByRole("checkbox", {
        name: "Send alert for Permission compliance",
      }),
    ).toBeTruthy();
    expect(evaluators.queryByText("Captured")).toBeNull();
    expect(evaluators.queryByText("Estimated capture cost")).toBeNull();
    expect(evaluators.queryByText("Estimated saving")).toBeNull();
    expect(evaluators.queryByText("Dropped failures")).toBeNull();
    expect(evaluators.queryByTestId("sampling-progress")).toBeNull();
  });

  it("updates only the selected evaluator's threshold and mock alert", async () => {
    const user = userEvent.setup();
    const store = renderOverview();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Send alert for Permission compliance",
      }),
    );
    const threshold = screen.getByRole("spinbutton", {
      name: "Minimum score for Permission compliance",
    });
    await user.clear(threshold);
    await user.type(threshold, "90");

    expect(store.getState().evaluators[0]).toMatchObject({
      sendAlert: true,
      minimumScore: 90,
    });
    expect(store.getState().evaluators[1]).toMatchObject({
      sendAlert: false,
      minimumScore: 80,
    });
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

    await user.click(
      screen.getByRole("checkbox", {
        name: "Send alert for Recorded demo judge",
      }),
    );
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
