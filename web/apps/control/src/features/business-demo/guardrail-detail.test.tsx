/** @vitest-environment jsdom */
import {
  act,
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
    <BusinessDemoProvider
      config={{ mode: "mock", sourceId: "mock", policyAuthoring: true }}
    >
      <GuardrailDetails id={id} />
    </BusinessDemoProvider>,
  );

it("deactivates before exposing delete and supports reactivation", async () => {
  show();
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Deactivate",
      }),
    );
  });
  expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Reactivate",
      }),
    );
  });
  expect(screen.getByText("Active")).toBeTruthy();
});

it("saves unsaved changes before asking to deactivate", async () => {
  show();
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Updated active profile" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
  expect(
    screen.getByRole("alertdialog", {
      name: "Save changes before continuing?",
    }),
  ).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  });
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!).items.find(
    (x: { id: string }) => x.id === "customer-interaction",
  );
  expect(stored.name).toBe("Updated active profile");
  expect(stored.status).toBe("Active");
  expect(
    screen.getByRole("alertdialog", {
      name: "Deactivate “Updated active profile”?",
    }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

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
    screen.queryByRole("button", { name: "Edit Customer Interaction rules" }),
  ).toBeNull();
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
  fireEvent.change(
    within(screen.getByRole("dialog")).getByRole("textbox", {
      name: "Rule text",
    }),
    {
      target: { value: "Changed rule" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByText("Edit latest")).toBeNull();
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
  fireEvent.click(
    screen.getByRole("button", { name: "View Customer Interaction rules" }),
  );
  expect(within(screen.getByRole("dialog")).queryByRole("textbox")).toBeNull();
});

it("can edit a Guardrail draft and protects unsaved changes", () => {
  show("sensitive-information");
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Updated guard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    (screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value,
  ).not.toBe("Updated guard");
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Updated guard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
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

it("saves All as the scope of a profile", () => {
  show();
  fireEvent.change(screen.getByLabelText("Location"), {
    target: { value: "All" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(
    JSON.parse(localStorage.getItem(STORAGE_KEY)!).items.find(
      (x: { id: string }) => x.id === "customer-interaction",
    ).location,
  ).toBe("All");
});
