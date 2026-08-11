/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  GuardGovernanceProvider,
  useGuardGovernanceState,
  useGuardGovernanceStore,
} from "./mock-provider";

function Probe() {
  const state = useGuardGovernanceState();
  const store = useGuardGovernanceStore();
  return (
    <div>
      <output>{state.projectId}:{state.guardrails.length}</output>
      <button
        type="button"
        onClick={() => store.toggleAssignment("assignment-production", false)}
      >
        Disable
      </button>
      <span>
        {String(
          state.assignments.find((item) => item.id === "assignment-production")
            ?.enabled,
        )}
      </span>
    </div>
  );
}

afterEach(cleanup);

describe("GuardGovernanceProvider", () => {
  it("publishes Store changes and resets when the Project changes", () => {
    const view = render(
      <GuardGovernanceProvider projectId="alpha">
        <Probe />
      </GuardGovernanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    expect(screen.getByText("false")).not.toBeNull();

    view.rerender(
      <GuardGovernanceProvider projectId="beta">
        <Probe />
      </GuardGovernanceProvider>,
    );
    expect(screen.getByText(/^beta:/)).not.toBeNull();
    expect(screen.getByText("true")).not.toBeNull();
  });

  it("rejects hooks used outside the Provider", () => {
    expect(() => render(<Probe />)).toThrow(
      "Guard Governance hooks require GuardGovernanceProvider",
    );
  });
});
