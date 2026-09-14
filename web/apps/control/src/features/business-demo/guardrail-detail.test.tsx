/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { GuardrailDetails } from "./guardrail-detail";
import { BusinessDemoProvider } from "./provider";
import { saveEntity, seedEntities, STORAGE_KEY } from "./model";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const show = (id = "customer-interaction") =>
  render(
    <BusinessDemoProvider config={{ mode: "mock", sourceId: "mock", policyAuthoring: true }}>
      <GuardrailDetails id={id} />
    </BusinessDemoProvider>,
  );

it("opens a full detail page with policy versions, status and actions", () => {
  show();
  expect(
    screen.getByRole("heading", { name: "Customer Interaction", level: 1 }),
  ).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.getByRole("columnheader", { name: "Version status" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "View Customer Interaction rules" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Edit Customer Interaction rules" }),
  ).toBeTruthy();
});

it("views pinned text and edits a Policy without replacing the Guardrail reference", () => {
  show();
  const original = seedEntities()[0]!.policies[0]!;
  fireEvent.click(
    screen.getByRole("button", { name: "View Customer Interaction rules" }),
  );
  expect(
    within(screen.getByRole("dialog")).getByText(original.text),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Edit Customer Interaction rules" }),
  );
  expect(
    screen.getByRole("heading", { name: "Create Policy v2" }),
  ).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Rule text" }), {
    target: { value: "Changed rule" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByText("Edit latest")).toBeTruthy();
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!).items;
  expect(
    stored.find((x: { id: string }) => x.id === "customer-interaction")
      .policies[0],
  ).toEqual(original);
  expect(
    stored.find((x: { id: string }) => x.id === original.policyId).version,
  ).toBe(2);
});

it("shows ready pinned version alongside processing latest and disables modification", () => {
  const items = seedEntities();
  const policy = items.find((p) => p.id === items[0]!.policies[0]!.policyId)!;
  const processing = saveEntity(
    "policies",
    policy,
    true,
    Date.now(),
    policy.id,
    policy,
  );
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      items: items.map((p) => (p.id === policy.id ? processing : p)),
    }),
  );
  show();
  expect(screen.getByText("Ready")).toBeTruthy();
  expect(screen.getByText("Processing")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Edit Customer Interaction rules",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

it("can edit a Guardrail draft and protects unsaved changes", () => {
  show("sensitive-information");
  fireEvent.click(screen.getByRole("button", { name: "Edit Guardrail" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Updated guard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByText("Discard unsaved changes?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.getByRole("heading", { name: "Updated guard", level: 1 }),
  ).toBeTruthy();
});

it("provides a return link for a missing guardrail", () => {
  show("missing");
  expect(screen.getByText("Guardrail not found")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Guardrails" }).getAttribute("href"),
  ).toBe("/guardrails");
});
