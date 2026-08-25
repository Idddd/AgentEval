/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_PERSONAS,
  DemoRoleProvider,
  projectRoleForDemoPersona,
  useDemoRole,
} from "./use-demo-role";

function PersonaProbe() {
  const { persona, roleOverride, setPersona } = useDemoRole();
  return (
    <button type="button" onClick={() => setPersona("agent-wizard")}>
      {persona}:{roleOverride}
    </button>
  );
}

describe("demo personas", () => {
  beforeEach(() => window.localStorage.clear());

  it("exposes exactly the three approved labels and role mappings", () => {
    expect(DEMO_PERSONAS).toEqual([
      { value: "admin", label: "Admin" },
      { value: "agent-wizard", label: "Agent Wizard" },
      { value: "end-user", label: "End user" },
    ]);
    expect(projectRoleForDemoPersona("admin")).toBe("admin");
    expect(projectRoleForDemoPersona("agent-wizard")).toBe("member");
    expect(projectRoleForDemoPersona("end-user")).toBe("frt");
  });

  it("keeps the selected persona in memory and resets to Admin on a fresh mount", async () => {
    window.localStorage.setItem("tasklattice.demo-role", "end-user");
    render(
      <DemoRoleProvider>
        <PersonaProbe />
      </DemoRoleProvider>,
    );

    expect(screen.getByRole("button").textContent).toBe("admin:admin");
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").textContent).toBe("agent-wizard:member");
    expect(window.localStorage.getItem("tasklattice.demo-role")).toBe(
      "end-user",
    );
  });
});
