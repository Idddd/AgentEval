/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { DemoWorkflowDependencies } from "../model";
import { DemoWorkflowProvider } from "../provider";
import { createDemoWorkflowStore } from "../store";
import { MonitorPage } from "./monitor-page";

afterEach(cleanup);

function dependencies(): DemoWorkflowDependencies {
  let id = 0;
  return {
    id: () => `monitor-${++id}`,
    now: () => "2026-08-20T00:00:00.000Z",
    sessionId: () => "monitor-session",
  };
}

it("summarizes session adoption and business health without technical fields", () => {
  const store = createDemoWorkflowStore("individual", dependencies());
  const instance = store.createInstance(
    {
      agentId: "fixture-policy-guidance",
      revisionId: "fixture-policy-guidance-r1",
      name: "Policy Pilot",
      team: "Service Operations",
      intendedUse: "Approved policy lookup",
    },
    "end-user",
  );
  store.markInstanceReady(instance.id);

  render(
    <DemoWorkflowProvider projectId="individual" store={store}>
      <MonitorPage />
    </DemoWorkflowProvider>,
  );

  expect(screen.getByRole("heading", { name: "Monitor" })).not.toBeNull();
  expect(screen.getByText("1 published")).not.toBeNull();
  expect(screen.getByText("1 active")).not.toBeNull();
  expect(screen.getByText("92%")).not.toBeNull();
  expect(screen.getByText("$0.04")).not.toBeNull();
  expect(screen.getByText("Policy Pilot is ready")).not.toBeNull();
  expect(screen.queryByText("Endpoint")).toBeNull();
  expect(screen.queryByText("Model")).toBeNull();
});
