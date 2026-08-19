/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DemoRoleProvider } from "@/hooks/use-demo-role";
import { AccountMenu } from "./account-menu";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#profile">{children}</a>,
  useNavigate: () => vi.fn(),
}));

describe("AccountMenu demo persona selector", () => {
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
});
