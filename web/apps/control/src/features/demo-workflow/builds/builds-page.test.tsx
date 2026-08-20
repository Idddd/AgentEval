/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { DemoWorkflowProvider } from "../provider";
import { createDemoWorkflowStore } from "../store";
import type { DemoWorkflowDependencies } from "../model";
import { BuildsPage } from "./builds-page";

afterEach(cleanup);

function dependencies(): DemoWorkflowDependencies {
  let id = 0;
  return {
    id: () => `build-${++id}`,
    now: () => "2026-08-20T00:00:00.000Z",
    sessionId: () => "build-session",
  };
}

it("clones an approved revision and presents a technical field diff", async () => {
  const user = userEvent.setup();
  const store = createDemoWorkflowStore("individual", dependencies());
  render(
    <DemoWorkflowProvider projectId="individual" store={store}>
      <BuildsPage />
    </DemoWorkflowProvider>,
  );

  await user.click(screen.getByRole("button", { name: "Create New Revision" }));
  await user.click(screen.getByRole("button", { name: "Edit R2" }));
  await user.clear(screen.getByLabelText("Model"));
  await user.type(screen.getByLabelText("Model"), "Demo reasoning model v2");
  await user.click(screen.getByRole("button", { name: "Save draft" }));

  expect(screen.getByText("Model changed")).not.toBeNull();
  expect(screen.getAllByText("Demo reasoning model v2").length).toBeGreaterThan(0);
  expect(
    store.getState().agentRevisions.find(
      (revision) => revision.id === "fixture-policy-guidance-r1",
    )?.model,
  ).toBe("Demo reasoning model");
  expect(
    store.getState().agentRevisions.find((revision) => revision.revision === 2),
  ).toMatchObject({ model: "Demo reasoning model v2", status: "DRAFT" });
});

it("marks a complete draft ready for Technical Validation", async () => {
  const user = userEvent.setup();
  const store = createDemoWorkflowStore("individual", dependencies());
  store.createAgentRevision("fixture-policy-guidance", "agent-wizard");
  render(
    <DemoWorkflowProvider projectId="individual" store={store}>
      <BuildsPage />
    </DemoWorkflowProvider>,
  );

  await user.click(
    screen.getByRole("button", { name: "Mark ready for validation" }),
  );

  expect(
    store.getState().agentRevisions.find((revision) => revision.revision === 2)
      ?.status,
  ).toBe("READY_FOR_VALIDATION");
  expect(screen.getAllByText("Ready for validation").length).toBeGreaterThan(0);
  expect(screen.getByRole("status").textContent).toContain("ready for Evaluate");
  expect(screen.queryByText(/Run Technical Validation/)).toBeNull();
});
