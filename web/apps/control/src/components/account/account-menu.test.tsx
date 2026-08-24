/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoRoleProvider } from "@/hooks/use-demo-role";
import { AccountMenu } from "./account-menu";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#profile">{children}</a>,
  useNavigate: () => navigate,
}));

describe("AccountMenu demo persona selector", () => {
  afterEach(cleanup);

  beforeEach(() => {
    navigate.mockReset();
    window.localStorage.clear();
  });

  it("offers only Admin, Agent Wizard, and End user inside Local account", async () => {
    render(
      <DemoRoleProvider>
        <AccountMenu
          onLogout={vi.fn()}
          projectId="individual"
          user={{
            id: "local-admin",
            username: "admin",
            displayName: "Local Administrator",
            email: "admin@tasklattice.local",
            provider: "local",
            systemRole: "super_administrator",
          }}
        />
      </DemoRoleProvider>,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "Open account menu for Local Administrator",
      }),
    );
    const selector = screen.getByRole("combobox", { name: "View as" });
    expect(
      Array.from((selector as HTMLSelectElement).options).map(
        (option) => option.text,
      ),
    ).toEqual(["Admin", "Agent Wizard", "End user"]);
  });

  it("opens the first navigation tab when the persona changes", async () => {
    render(
      <DemoRoleProvider>
        <AccountMenu
          onLogout={vi.fn()}
          projectId="individual"
          user={{
            id: "local-admin",
            username: "admin",
            displayName: "Local Administrator",
            email: "admin@tasklattice.local",
            provider: "local",
            systemRole: "super_administrator",
          }}
        />
      </DemoRoleProvider>,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "Open account menu for Local Administrator",
      }),
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "View as" }),
      "agent-wizard",
    );

    expect(navigate).toHaveBeenCalledWith({
      to: "/$projectId/create",
      params: { projectId: "individual" },
    });
  });
});
