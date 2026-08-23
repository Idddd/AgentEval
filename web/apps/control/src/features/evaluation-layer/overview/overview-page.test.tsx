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

function renderOverview(fixtures = cloneEvaluationLayerFixtures()) {
  const store = createEvaluationLayerStore(fixtures);
  render(
    <EvaluationLayerProvider projectId="individual" store={store}>
      <EvaluationOverviewPage />
    </EvaluationLayerProvider>,
  );
  return store;
}

describe("EvaluationOverviewPage", () => {
  it("orders traces by recency instead of pinning Onboarding Assistant", () => {
    const fixtures = cloneEvaluationLayerFixtures();
    const newest = fixtures.traces.find(
      (trace) => trace.targetId !== "demo-onboarding-assistant",
    )!;
    newest.startedAt = "2099-01-01T00:00:00.000Z";
    const expectedTarget = fixtures.targets.find(
      (target) => target.id === newest.targetId,
    )!.name;
    renderOverview(fixtures);

    const traceTables = screen.getAllByRole("table");
    const firstTraceRow = within(traceTables.at(-1)!).getAllByRole("row")[1]!;
    expect(firstTraceRow.textContent).toContain(expectedTarget);
    expect(firstTraceRow.textContent).not.toContain("Onboarding Assistant");
  });

  it("shows evaluator rules and Sampling together as the trace policy", () => {
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
    expect(sampling).toBeTruthy();
    expect(evaluators.getByText("Evaluator policy")).toBeTruthy();
    expect(evaluators.getByText("2 active")).toBeTruthy();
    expect(evaluators.queryByRole("table")).toBeNull();
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

  it("keeps ten Evaluators compact while preserving access to every rule and result", async () => {
    const user = userEvent.setup();
    const fixtures = cloneEvaluationLayerFixtures();
    fixtures.evaluators.push(
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `scale-evaluator-${index + 3}`,
        name: `Scale Evaluator ${index + 3}`,
        provider: "BUILT_IN" as const,
        version: "demo-v1",
        enabled: true,
        minimumScore: 80,
        sendAlert: false,
      })),
    );
    renderOverview(fixtures);

    const evaluators = screen.getByRole("region", { name: "Evaluators" });
    expect(within(evaluators).getAllByRole("article")).toHaveLength(4);
    expect(within(evaluators).getByText("Showing 4 of 10 Evaluators")).toBeTruthy();
    expect(
      screen.getByRole("note", { name: "Checks applied to every case" }).textContent,
    ).toContain("+7 more active");

    const traceTable = screen.getAllByRole("table").at(-1)!;
    const firstTraceRow = within(traceTable).getAllByRole("row")[1]!;
    expect(within(firstTraceRow).getByText("Show remaining 7 evaluator results")).toBeTruthy();

    await user.click(
      within(evaluators).getByRole("button", { name: "Show all 10 Evaluators" }),
    );
    expect(within(evaluators).getAllByRole("article")).toHaveLength(10);
    expect(within(evaluators).getByText("Showing 10 of 10 Evaluators")).toBeTruthy();
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

  it("shows each evaluator result before the derived Trace status", () => {
    renderOverview();

    const headers = screen
      .getAllByRole("columnheader")
      .map((item) => item.textContent);
    expect(headers.indexOf("Evaluator results")).toBeLessThan(
      headers.indexOf("Status"),
    );

    const failedRow = screen.getByText("Prompt injection data leak").closest("tr")!;
    const score = within(failedRow).getByLabelText(
      /evaluator score: \d+ of 2 passed/i,
    );
    expect(score.textContent).toContain("Data leak detection");
    expect(score.textContent).toContain("Token efficiency");
    expect(score.textContent).toContain("FAIL");
    expect(within(failedRow).getAllByText("FAIL").length).toBeGreaterThan(0);
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
      "Security incident summary includes risks and next steps",
    ];

    for (const label of expectedLabels) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("weather-guest-allow")).toBeNull();
    expect(store.getState().traces.some((trace) => trace.caseId === "weather-guest-allow")).toBe(true);
  });

  it("lists the checks applied to every case once above the trace table", () => {
    renderOverview();

    const checks = screen.getByRole("note", {
      name: "Checks applied to every case",
    });
    expect(within(checks).getByText("Data leak detection")).toBeTruthy();
    expect(within(checks).getByText("Token efficiency")).toBeTruthy();
    expect(within(checks).getByText("Incoming Trace")).toBeTruthy();
    expect(within(checks).getByText("Final Trace status")).toBeTruthy();
    expect(within(checks).getByText(/Any evaluator below threshold/)).toBeTruthy();
    expect(screen.queryByText("Test: Budget review memo")).toBeNull();
  });

  it("identifies the token evaluator as a Langsmith source", () => {
    renderOverview();

    const evaluatorSection = screen.getByRole("region", { name: "Evaluators" });
    const evaluatorCard = within(evaluatorSection)
      .getByText("Token efficiency")
      .closest("article")!;
    expect(within(evaluatorCard).getByText(/Langsmith/)).toBeTruthy();
    expect(within(evaluatorCard).queryByText(/Langfuse/)).toBeNull();
  });
});
