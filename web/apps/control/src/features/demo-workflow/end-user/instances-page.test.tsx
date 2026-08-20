/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DemoWorkflowDependencies } from "../model";
import { DemoWorkflowProvider } from "../provider";
import { createDemoWorkflowStore } from "../store";
import { EndUserInstancesPage } from "./instances-page";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function dependencies(): DemoWorkflowDependencies {
  let id = 0;
  return {
    id: () => `instance-${++id}`,
    now: () => "2026-08-20T00:00:00.000Z",
    sessionId: () => "instance-session",
  };
}

it("stops a ready Instance and keeps the page business focused", async () => {
  vi.useFakeTimers();
  const store = createDemoWorkflowStore("individual", dependencies());
  const instance = store.createInstance(
    {
      agentId: "fixture-policy-guidance",
      revisionId: "fixture-policy-guidance-r1",
      name: "Policy Guidance Pilot",
      team: "Customer Service Operations",
      intendedUse: "Resolve customer cases using approved policy guidance.",
    },
    "end-user",
  );
  store.markInstanceReady(instance.id);
  render(
    <DemoWorkflowProvider projectId="individual" store={store}>
      <EndUserInstancesPage />
    </DemoWorkflowProvider>,
  );

  expect(screen.getByText("Policy Guidance Pilot")).not.toBeNull();
  expect(screen.getByText(/Stable version 1/)).not.toBeNull();
  expect(screen.queryByText("Endpoint")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Stop Instance" }));
  expect(screen.getAllByText("Stopping").length).toBeGreaterThan(0);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(screen.getAllByText("Stopped").length).toBeGreaterThan(0);
  expect(store.getState().instances[0]?.status).toBe("STOPPED");
});
