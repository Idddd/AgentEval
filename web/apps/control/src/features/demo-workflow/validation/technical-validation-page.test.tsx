/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DemoWorkflowProvider } from "../provider";
import { createDemoWorkflowStore } from "../store";
import type { DemoWorkflowDependencies } from "../model";
import { TechnicalValidationPage } from "./technical-validation-page";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function dependencies(): DemoWorkflowDependencies {
  let id = 0;
  return {
    id: () => `validation-${++id}`,
    now: () => "2026-08-20T00:00:00.000Z",
    sessionId: () => "validation-session",
  };
}

it("validates a draft before allowing Release Candidate submission", async () => {
  vi.useFakeTimers();
  const store = createDemoWorkflowStore("individual", dependencies());
  const revision = store.createAgentRevision(
    "fixture-policy-guidance",
    "agent-wizard",
  );
  store.markReadyForTechnicalValidation(revision.id, "agent-wizard");
  render(
    <DemoWorkflowProvider projectId="individual" store={store}>
      <TechnicalValidationPage />
    </DemoWorkflowProvider>,
  );

  expect(
    (
      screen.getByRole("button", {
        name: "Submit Release Candidate",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Run Technical Validation" }),
  );
  await vi.advanceTimersByTimeAsync(600);

  expect(screen.getAllByText("Validated").length).toBeGreaterThan(0);
  expect(screen.getByText("Dependency resolution passed")).not.toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Submit Release Candidate" }),
  );

  expect(screen.getByText("Pending business evaluation")).not.toBeNull();
  expect(
    store.getState().agentRevisions.find((item) => item.id === revision.id)
      ?.status,
  ).toBe("PENDING_EVAL");
});
