/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import type { ComponentType, ReactNode } from "react";
import { cloneEvaluationLayerFixtures } from "@/features/evaluation-layer/fixture-validation";
import { EvaluationLayerProvider, useEvaluationLayerState } from "@/features/evaluation-layer/mock-provider";
import { createEvaluationLayerStore } from "@/features/evaluation-layer/mock-store";
import { createDemoWorkflowStore } from "./store";
import * as workflowProviderModule from "./provider";
import {
  DemoWorkflowProvider,
  useDemoWorkflowState,
  useDemoWorkflowStore,
} from "./provider";

afterEach(cleanup);

function Probe() {
  const state = useDemoWorkflowState();
  const store = useDemoWorkflowStore();
  return (
    <div>
      <span>Session {state.demoSessionId}</span>
      <span>Skills {state.skills.length}</span>
      <button
        type="button"
        onClick={() =>
          store.createSkill(
            { name: "Session Skill", description: "Created in the tab" },
            "agent-wizard",
          )
        }
      >
        Create Skill
      </button>
    </div>
  );
}

it("keeps one workflow store while descendants rerender", async () => {
  const user = userEvent.setup();
  const view = render(
    <DemoWorkflowProvider projectId="individual">
      <Probe />
    </DemoWorkflowProvider>,
  );
  const session = screen.getByText(/Session /).textContent;

  await user.click(screen.getByRole("button", { name: "Create Skill" }));
  view.rerender(
    <DemoWorkflowProvider projectId="individual">
      <Probe />
    </DemoWorkflowProvider>,
  );

  expect(screen.getByText("Skills 1")).not.toBeNull();
  expect(screen.getByText(session!)).not.toBeNull();
});

it("keeps ready Build revisions synchronized with the Evaluation workspace", async () => {
  const workflowStore = createDemoWorkflowStore("individual");
  const revision = workflowStore.createAgentRevision("fixture-policy-guidance", "agent-wizard");
  workflowStore.markReadyForTechnicalValidation(revision.id, "agent-wizard");
  const evaluationStore = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
  const Passthrough = ({ children }: { children: ReactNode }) => <>{children}</>;
  const BridgeProvider = ((workflowProviderModule as unknown as {
    BuildEvaluationBridgeProvider?: ComponentType<{ children: ReactNode }>;
  }).BuildEvaluationBridgeProvider ?? Passthrough);
  function EvaluationProbe() {
    const state = useEvaluationLayerState();
    return <span>Targets {state.targets.map((target) => target.name).join(", ")}</span>;
  }

  render(
    <EvaluationLayerProvider projectId="individual" store={evaluationStore}>
      <DemoWorkflowProvider projectId="individual" store={workflowStore}>
        <BridgeProvider>
          <EvaluationProbe />
        </BridgeProvider>
      </DemoWorkflowProvider>
    </EvaluationLayerProvider>,
  );

  await waitFor(() => {
    expect(screen.getByText(/Policy Guidance Assistant/)).not.toBeNull();
  });
});
