/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { EvaluationLayerProvider } from "@/features/evaluation-layer/mock-provider";
import type { DemoWorkflowDependencies } from "../model";
import { DemoWorkflowProvider } from "../provider";
import { createDemoWorkflowStore } from "../store";
import { MonitorPage } from "./monitor-page";

vi.mock("@/hooks/use-project", () => ({
  useCurrentProjectId: () => "individual",
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#trace">{children}</a>,
}));

afterEach(cleanup);

function dependencies(): DemoWorkflowDependencies {
  let id = 0;
  return {
    id: () => `monitor-${++id}`,
    now: () => "2026-08-20T00:00:00.000Z",
    sessionId: () => "monitor-session",
  };
}

it("restores production monitoring controls, evaluator policy, and trace evidence", () => {
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
    <EvaluationLayerProvider projectId="individual">
      <DemoWorkflowProvider projectId="individual" store={store}>
        <MonitorPage />
      </DemoWorkflowProvider>
    </EvaluationLayerProvider>,
  );

  expect(screen.getByRole("heading", { name: "Production Monitor" })).not.toBeNull();
  expect(screen.getByRole("combobox", { name: "Agent" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "PASS" })).not.toBeNull();
  expect(screen.getByRole("slider", { name: "Sampling rate" })).not.toBeNull();
  expect(screen.getByRole("columnheader", { name: "Trace" })).not.toBeNull();
  expect(screen.getByRole("columnheader", { name: "Score" })).not.toBeNull();
  expect(screen.getAllByText("Data leak detection").length).toBeGreaterThan(0);
  expect(screen.queryByText("Published Agents")).toBeNull();
});
