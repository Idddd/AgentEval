/** @vitest-environment jsdom */
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { GuardrailDetailPage } from "./guardrails";
import { renderImported } from "./test-utils";

afterEach(cleanup);

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));

it("omits Assignment controls from the Guardrail detail page", async () => {
  renderImported(
    <GuardrailDetailPage
      projectId="individual"
      guardrailId="guardrail-production"
    />,
  );

  const workflow = await screen.findByRole("region", {
    name: "Guardrail workflow",
  });
  expect(workflow.textContent).not.toContain("Assignments");
  for (const name of ["Intent", "Controls", "Test cases", "Versions"]) {
    expect(screen.getByRole("tab", { name })).not.toBeNull();
  }
  expect(screen.queryByRole("tab", { name: "Assignments" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Create Assignment" }),
  ).toBeNull();
  expect(screen.queryByText("traffic assignments")).toBeNull();
});

it("renders nested evidence", async () => {
  const user = userEvent.setup();
  renderImported(
    <GuardrailDetailPage
      projectId="individual"
      guardrailId="guardrail-production"
    />,
  );

  await user.click(await screen.findByRole("tab", { name: "Test cases" }));
  expect(screen.getByText("Compliance")).not.toBeNull();
  expect(screen.getAllByText("Triggered findings").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Execution trace").length).toBeGreaterThan(0);
});
