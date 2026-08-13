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
  it("shows Onboarding Assistant as the first trace example", () => {
    renderOverview();

    const traceTables = screen.getAllByRole("table");
    const firstTraceRow = within(traceTables.at(-1)!).getAllByRole("row")[1]!;
    expect(firstTraceRow.textContent).toContain("Onboarding Assistant");
  });

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
    const sampling = evaluators.getByRole("slider", { name: "Sampling rate" });
    const evaluatorTable = evaluators.getByRole("table");
    expect(
      sampling.compareDocumentPosition(evaluatorTable) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      evaluators.getAllByRole("heading", { name: "Sampling" }),
    ).toHaveLength(1);
    expect(
      evaluators.getByRole("spinbutton", {
        name: "Minimum score for Data leak detection",
      }),
    ).toBeTruthy();
    expect(
      evaluators.getByRole("checkbox", {
        name: "Send alert for Data leak detection",
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
        name: "Send alert for Data leak detection",
      }),
    );
    const threshold = screen.getByRole("spinbutton", {
      name: "Minimum score for Data leak detection",
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

    const failedRow = screen.getByText("Prompt injection data leak").closest("tr")!;
    const score = within(failedRow).getByRole("button", {
      name: /evaluator score: \d+ of 2 passed/i,
    });
    expect(score.className).toContain("text-red");
    expect(within(failedRow).getByText("FAIL")).toBeTruthy();

    await user.click(score);
    expect(screen.getAllByText("Data leak detection").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Token efficiency").length).toBeGreaterThan(1);
    expect(screen.getAllByText(/%/).length).toBeGreaterThan(0);
  });

  it("binds alert and failure filtering to the derived evaluator status", async () => {
    const user = userEvent.setup();
    renderOverview();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Send alert for Token efficiency",
      }),
    );
    const failedRow = screen.getByText("Prompt injection data leak").closest("tr")!;
    expect(within(failedRow).getByText("Alert triggered")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Failures/ }));
    expect(screen.getByText("Prompt injection data leak")).toBeTruthy();
    expect(screen.queryByText("Safe public data access")).toBeNull();
  });

  it("preserves runtime ERROR when evaluator scores are below threshold", () => {
    renderOverview();

    const runtimeError = screen
      .getAllByText("Data leak prevention")
      .map((item) => item.closest("tr"))
      .find((row) => row?.textContent?.includes("ERROR"));
    expect(runtimeError).toBeTruthy();
    expect(within(runtimeError!).getByText("ERROR")).toBeTruthy();
  });

  it("shows clear monitoring labels while preserving case IDs internally", () => {
    const store = renderOverview();
    const expectedLabels = [
      "Safe public data access",
      "Authorized employee data access",
      "Data leak prevention",
      "Authorized privileged action",
      "Unauthorized action blocked",
      "Prompt injection data leak",
      "Authorized read-only action",
      "Unauthorized tool action blocked",
      "Grounded policy response",
      "Ungrounded response prevented",
      "Instruction-following summary",
      "Risk-aware summarization",
    ];

    for (const label of expectedLabels) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("weather-guest-allow")).toBeNull();
    expect(store.getState().traces.some((trace) => trace.caseId === "weather-guest-allow")).toBe(true);
  });

  it("identifies the token evaluator as a Langsmith source", () => {
    renderOverview();

    const evaluatorRow = screen.getByText("Token efficiency").closest("tr")!;
    expect(within(evaluatorRow).getByText("Langsmith")).toBeTruthy();
    expect(within(evaluatorRow).queryByText("Langfuse")).toBeNull();
  });
});
