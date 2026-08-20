/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
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
