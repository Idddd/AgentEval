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
import { GuardrailDetailPage, GuardrailsPage } from "./guardrails";
import { renderImported } from "./test-utils";

it("shows business coverage and health in the registry", async () => {
  renderImported(<GuardrailsPage projectId="individual" />);
  expect(await screen.findByText(/Guardrail registry.*4/)).not.toBeNull();
  expect(
    screen.getByText(/Protect public model traffic/).classList.contains("max-h-10"),
  ).toBe(true);
  expect(screen.queryByText("Tested current")).toBeNull();
  expect(screen.getByRole("columnheader", { name: "What it protects" })).not.toBeNull();
  expect(screen.getByRole("columnheader", { name: "Policy scope" })).not.toBeNull();
  expect(screen.getByRole("columnheader", { name: "Current impact" })).not.toBeNull();
  expect(screen.getByRole("columnheader", { name: "Status" })).not.toBeNull();
  expect(screen.getAllByText("All Agents").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Prompt injection").length).toBeGreaterThan(0);
  expect(screen.getByText("1 relationship missing")).not.toBeNull();
});

it("makes coverage gaps visible and fixes current matches when the policy is saved", async () => {
  const user = userEvent.setup();
  renderImported(
    <GuardrailDetailPage
      projectId="individual"
      guardrailId="guardrail-production"
    />,
  );

  expect(await screen.findByText("Customer Service is not protected")).not.toBeNull();
  expect(screen.getByText("Customer Service")).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Manage policy scope" }));
  expect(screen.getByRole("dialog", { name: "Manage coverage" })).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Save coverage" }));
  expect(await screen.findByText("Every required target is protected")).not.toBeNull();
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
    screen.getByRole("button", { name: /Customize Intent Create/ }),
  ).not.toBeNull();
  expect(
    screen.getByRole("button", {
      name: /Advanced PII Protection \(Australia\)/,
    }),
  ).not.toBeNull();
  expect(
    screen.getByRole("button", { name: /Competitor Mention Detection/ }),
  ).not.toBeNull();
});

it("combines multiple selected templates into one editable safety intent", async () => {
  const user = userEvent.setup();
  renderImported(<GuardrailsPage projectId="individual" />);

  await user.click(
    await screen.findByRole("button", { name: "Create Guardrail" }),
  );
  await user.click(
    screen.getByRole("button", {
      name: /Advanced PII Protection \(Australia\)/,
    }),
  );
  await user.click(
    screen.getByRole("button", { name: /Prompt Injection Protection/ }),
  );

  expect(screen.getAllByLabelText("Selected template")).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Continue" }));

  expect(screen.queryByLabelText("Business purpose")).toBeNull();
  expect(screen.queryByLabelText("Allowed behavior")).toBeNull();
  expect(screen.queryByLabelText("Restricted behavior")).toBeNull();
  expect(screen.getByText("Advanced PII Protection (Australia)")).not.toBeNull();
  expect(screen.getByText("Prompt Injection Protection")).not.toBeNull();
});

it("describes custom intent creation without upload and mock-analyzes its purpose", async () => {
  const user = userEvent.setup();
  renderImported(<GuardrailsPage projectId="individual" />);

  await user.click(
    await screen.findByRole("button", { name: "Create Guardrail" }),
  );
  await user.click(
    screen.getByRole("button", { name: /Customize Intent Create/ }),
  );

  expect(screen.getByText(/entered business-intent document/i)).not.toBeNull();
  expect(document.querySelector('input[type="file"]')).toBeNull();
  await user.click(screen.getByRole("button", { name: "Continue" }));

  const purpose = screen.getByLabelText("Business purpose");
  expect((purpose as HTMLTextAreaElement).value).toContain(
    "ISS requires this AI assistant",
  );
  expect((purpose as HTMLTextAreaElement).value).toContain(
    "retain evidence",
  );
  await user.click(
    await screen.findByRole("button", { name: "Analyze protection intent" }),
  );
  expect(
    (await screen.findByLabelText(
      "Allowed behavior",
    ) as HTMLTextAreaElement).value,
  ).not.toBe("");
  expect(
    (screen.getByLabelText("Restricted behavior") as HTMLTextAreaElement).value,
  ).not.toBe("");
  expect(screen.getByRole("region", { name: "Business scenarios" })).not.toBeNull();
  expect(screen.getByRole("combobox", { name: "Risk level" })).not.toBeNull();
  expect(screen.getByRole("combobox", { name: "Response action" })).not.toBeNull();
});

it("renders all parameter controls for an imported Guard template", async () => {
  const user = userEvent.setup();
  renderImported(<GuardrailsPage projectId="individual" />);

  await user.click(
    await screen.findByRole("button", { name: "Create Guardrail" }),
  );
  await user.click(
    screen.getByRole("button", { name: /Competitor Mention Detection/ }),
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));

  expect(screen.getByLabelText("Your Brand Name *")).not.toBeNull();
  expect(screen.getByPlaceholderText("One competitor per line").tagName).toBe(
    "TEXTAREA",
  );
});

it("creates from Safety intent without a separate Controls step", async () => {
  const user = userEvent.setup();
  renderImported(<GuardrailsPage projectId="individual" />);

  await user.click(
    await screen.findByRole("button", { name: "Create Guardrail" }),
  );
  expect(screen.queryByText("Review enforcement")).toBeNull();
  await user.click(
    screen.getByRole("button", { name: /Baseline PII Protection/ }),
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("Baseline PII Protection")).not.toBeNull();

  expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  expect(screen.queryByText("Controls to enforce")).toBeNull();
  expect(screen.getAllByRole("button", { name: "Create Guardrail" }).length).toBeGreaterThan(0);
});
