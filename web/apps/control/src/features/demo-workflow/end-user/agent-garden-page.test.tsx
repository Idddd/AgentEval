/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DemoWorkflowDependencies } from "../model";
import { DemoWorkflowProvider } from "../provider";
import { createDemoWorkflowStore } from "../store";
import { EndUserAgentGardenPage } from "./agent-garden-page";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function dependencies(): DemoWorkflowDependencies {
  let id = 0;
  return {
    id: () => `garden-${++id}`,
    now: () => "2026-08-20T00:00:00.000Z",
    sessionId: () => "garden-session",
  };
}

it("applies an approved Agent as a session-only Instance", async () => {
  vi.useFakeTimers();
  const store = createDemoWorkflowStore("individual", dependencies());
  render(
    <DemoWorkflowProvider projectId="individual" store={store}>
      <EndUserAgentGardenPage />
    </DemoWorkflowProvider>,
  );

  expect(screen.getByText("Policy Guidance Assistant")).not.toBeNull();
  expect(screen.getByText(/94% scenario success/)).not.toBeNull();
  expect(screen.queryByText("Demo reasoning model")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Apply Instance" }));

  const dialog = screen.getByRole("dialog", { name: "Apply Policy Guidance Assistant" });
  expect((within(dialog).getByLabelText("Instance name") as HTMLInputElement).value).toBe(
    "Policy Guidance Pilot",
  );
  expect((within(dialog).getByLabelText("Team") as HTMLInputElement).value).toBe(
    "Customer Service Operations",
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Apply Instance" }));

  expect(screen.getByText("Instance request submitted")).not.toBeNull();
  expect(store.getState().instances[0]?.status).toBe("PROVISIONING");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
  expect(store.getState().instances[0]?.status).toBe("READY");
});
