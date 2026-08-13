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

it("renders the original workflow and all five tabs", async () => {
  renderImported(
    <GuardrailDetailPage
      projectId="individual"
      guardrailId="guardrail-production"
    />,
  );

  expect(
    await screen.findByRole("region", { name: "Guardrail workflow" }),
  ).not.toBeNull();
  for (const name of [
    "Intent",
    "Controls",
    "Test cases",
    "Versions",
    "Assignments",
  ]) {
    expect(screen.getByRole("tab", { name })).not.toBeNull();
  }
});

it("renders nested evidence and opens the original Assignment sheet", async () => {
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

  await user.click(screen.getByRole("button", { name: "Create Assignment" }));
  expect(
    screen.getByRole("heading", { name: "Create Assignment" }),
  ).not.toBeNull();
  expect(screen.getByText("Traffic characteristics")).not.toBeNull();
});
