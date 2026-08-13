/** @vitest-environment jsdom */
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));
import { GuardrailsPage } from "./guardrails";
import { renderImported } from "./test-utils";

it("renders the original registry hierarchy without AgentEval metric cards", async () => {
  renderImported(<GuardrailsPage projectId="individual" />);
  expect(await screen.findByText(/Guardrail registry.*4/)).not.toBeNull();
  expect(screen.queryByText("Tested current")).toBeNull();
  expect(
    screen.getByRole("columnheader", { name: "Test evidence" }),
  ).not.toBeNull();
});

it("retains the original template and blank creation choices", async () => {
  const user = userEvent.setup();
  renderImported(<GuardrailsPage projectId="individual" />);

  await user.click(
    await screen.findByRole("button", { name: "Create Guardrail" }),
  );

  expect(
    screen.getByRole("navigation", { name: "Create Guardrail" }),
  ).not.toBeNull();
  expect(screen.getByLabelText("Find a local template")).not.toBeNull();
  expect(
    screen.getByRole("button", { name: /Blank safety intent/ }),
  ).not.toBeNull();
  expect(
    screen.getByRole("button", { name: /Enterprise Safety Baseline/ }),
  ).not.toBeNull();
});
