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
  expect(
    screen.getByText(/Protect public model traffic/).classList.contains("max-h-10"),
  ).toBe(true);
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
  expect(screen.queryByLabelText("Allowed business domains")).toBeNull();
  expect(screen.queryByLabelText("Restricted domains")).toBeNull();
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
      "Allowed business domains",
    ) as HTMLTextAreaElement).value,
  ).not.toBe("");
  expect(
    (screen.getByLabelText("Restricted domains") as HTMLTextAreaElement).value,
  ).not.toBe("");
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

it("does not repeat template summaries on the Controls step", async () => {
  const user = userEvent.setup();
  renderImported(<GuardrailsPage projectId="individual" />);

  await user.click(
    await screen.findByRole("button", { name: "Create Guardrail" }),
  );
  await user.click(
    screen.getByRole("button", { name: /Baseline PII Protection/ }),
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("Baseline PII Protection")).not.toBeNull();

  await user.click(screen.getByRole("button", { name: "Continue" }));

  expect(screen.queryByText("Baseline PII Protection")).toBeNull();
  expect(screen.getByText("Controls to enforce")).not.toBeNull();
});
