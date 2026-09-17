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
  fireEvent.click(screen.getByRole("button", { name: "Active" }));
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Active",
      }),
    );
  });
  expect(screen.getByText("Active")).toBeTruthy();
});

it("locks active fields and policy editing until deactivated", async () => {
  show();
  expect(screen.queryByRole("button", { name: "Edit Name" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Edit Customer Interaction rules" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Deactivate",
      }),
    );
  });
  expect(screen.getByRole("button", { name: "Edit Name" })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Edit Customer Interaction rules" }),
  ).toBeTruthy();
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
    screen.getByRole("button", { name: "Customer Interaction rules" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Edit Customer Interaction rules" }),
  ).toBeNull();
});

it("views pinned text and edits a Policy without replacing the Guardrail Profile reference", () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      items: seedEntities().map((item) =>
        item.id === "customer-interaction"
          ? { ...item, status: "Ready" }
          : item,
      ),
    }),
  );
  show();
  const original = seedEntities()[0]!.policies[0]!;
  fireEvent.click(
    screen.getByRole("button", { name: "Customer Interaction rules" }),
  );
  expect(
    within(screen.getByRole("dialog")).getByText(original.text),
  ).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Edit Rule text",
    }),
  );
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
    screen.getByRole("button", { name: "Customer Interaction rules" }),
  );
  expect(within(screen.getByRole("dialog")).queryByRole("textbox")).toBeNull();
});

it("can edit a Guardrail Profile draft and protects unsaved changes", () => {
  show("sensitive-information");
  if (screen.queryByRole("button", { name: "Edit Name" }))
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Updated guard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    screen.getByRole("button", { name: "Edit Name" }).parentElement
      ?.textContent,
  ).not.toBe("Updated guard");
  if (screen.queryByRole("button", { name: "Edit Name" }))
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
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
  expect(screen.getByText("Guardrail Profile not found")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Guardrail Profiles" }).getAttribute("href"),
  ).toBe("/guardrails");
});

it("saves All as the scope of a profile", () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      items: seedEntities().map((item) =>
        item.id === "customer-interaction"
          ? { ...item, status: "Ready" }
          : item,
      ),
    }),
  );
  show();
  if (screen.queryByRole("button", { name: "Edit Location" }))
    fireEvent.click(screen.getByRole("button", { name: "Edit Location" }));
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

it("shows persistent edit icons and only opens a field through its icon", () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      items: seedEntities().map((item) =>
        item.id === "customer-interaction"
          ? { ...item, status: "Ready" }
          : item,
      ),
    }),
  );
  show();
  expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
  const edit = screen.getByRole("button", { name: "Edit Name" });
  fireEvent.click(edit.parentElement!.querySelector("span")!);
  expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
  fireEvent.click(edit);
  const input = screen.getByRole("textbox", { name: "Name" });
  expect(document.activeElement).toBe(input);
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  fireEvent.change(input, { target: { value: "Icon edit draft" } });
  fireEvent.blur(input, {
    relatedTarget: screen.getByRole("button", { name: "Edit Location" }),
  });
  expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
  expect(screen.getByText("Icon edit draft")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByText("Icon edit draft")).toBeNull();
  expect(screen.getByRole("button", { name: "Edit Name" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Edit Policies" }));
  expect(
    screen.getByRole("textbox", { name: "Search ready policies" }),
  ).toBeTruthy();
});

it("removes a policy link without deleting the shared policy", async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      items: seedEntities().map((item) =>
        item.id === "customer-interaction"
          ? { ...item, status: "Ready" }
          : item,
      ),
    }),
  );
  show();
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Customer Interaction rules" }),
  );
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Remove from profile" }),
    );
  });
  const items = JSON.parse(localStorage.getItem(STORAGE_KEY)!).items;
  expect(
    items.find((item: { id: string }) => item.id === "customer-interaction")
      .policies,
  ).toHaveLength(0);
  expect(
    items.some(
      (item: { name: string; kind: string }) =>
        item.kind === "policies" && item.name === "Customer Interaction rules",
    ),
  ).toBe(true);
});

it("adds a policy through the section plus button and saves the selection", () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      items: seedEntities().map((item) =>
        item.id === "customer-interaction"
          ? { ...item, status: "Ready" }
          : item,
      ),
    }),
  );
  show();
  fireEvent.click(screen.getByRole("button", { name: "Add Policy" }));
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "Search ready policies" }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Customer data protection/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const items = JSON.parse(localStorage.getItem(STORAGE_KEY)!).items;
  expect(
    items.find((item: { id: string }) => item.id === "customer-interaction")
      .policies,
  ).toHaveLength(2);
  expect(
    screen.getByRole("button", { name: "Customer data protection" }),
  ).toBeTruthy();
});

it("opens policy details from its name without a View action or inline rule text", () => {
  show();
  expect(screen.queryByRole("button", { name: /^View / })).toBeNull();
  expect(screen.queryByRole("columnheader", { name: "Actions" })).toBeNull();
  expect(screen.queryByText("Rule text")).toBeNull();
  const rule = seedEntities()[0]!.policies[0]!.text;
  expect(screen.queryByText(rule)).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Customer Interaction rules" }),
  );
  expect(within(screen.getByRole("dialog")).getByText(rule)).toBeTruthy();
});

it("keeps the policy picker open inside and toggles selection from row padding", () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      items: seedEntities().map((item) =>
        item.id === "customer-interaction"
          ? { ...item, status: "Ready" }
          : item,
      ),
    }),
  );
  show();
  fireEvent.click(screen.getByRole("button", { name: "Add Policy" }));
  const search = screen.getByRole("textbox", { name: "Search ready policies" });
  fireEvent.blur(search, { relatedTarget: null });
  expect(screen.getByRole("textbox", { name: "Search ready policies" })).toBe(
    search,
  );
  const checkbox = screen.getByRole("checkbox", {
    name: /Customer data protection/,
  }) as HTMLInputElement;
  const row = checkbox.closest("label")!.parentElement!;
  fireEvent.pointerDown(row);
  fireEvent.click(row);
  expect(checkbox.checked).toBe(true);
  const summary = row.querySelector("summary")!;
  fireEvent.pointerDown(summary);
  fireEvent.click(summary);
  expect(checkbox.checked).toBe(true);
  expect(screen.getByRole("textbox", { name: "Search ready policies" })).toBe(
    search,
  );
  fireEvent.click(
    screen.getByRole("heading", { name: "Customer Interaction", level: 1 }),
  );
  expect(
    screen.queryByRole("textbox", { name: "Search ready policies" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
});

it("keeps the pinned version until a ready upgrade is selected and saved", () => {
  const items = seedEntities();
  const guard = items.find((item) => item.id === "customer-interaction")!;
  guard.status = "Ready";
  const policy = items.find((item) => item.id === guard.policies[0]!.policyId)!;
  policy.revisions = [{ version: 1, name: policy.name, text: policy.text }];
  policy.version = 2;
  policy.text = "Version two rule";
  policy.status = "Ready";
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, items }));
  show();
  fireEvent.click(screen.getByRole("button", { name: "Add Policy" }));
  const versions = screen.getByRole("combobox", {
    name: `Version for ${policy.name}`,
  }) as HTMLSelectElement;
  expect(versions.value).toBe("1");
  expect(screen.getByText("New version v2 available")).toBeTruthy();
  fireEvent.change(versions, { target: { value: "2" } });
  const saveButton = screen.getByRole("button", { name: "Save" });
  fireEvent.pointerDown(saveButton);
  fireEvent.mouseDown(saveButton);
  expect(screen.getByRole("combobox", { name: `Version for ${policy.name}` })).toBe(versions);
  expect(screen.getByRole("button", { name: "Save" })).toBe(saveButton);
  fireEvent.pointerUp(saveButton);
  fireEvent.mouseUp(saveButton);

  expect(screen.getByText("Version two rule")).toBeTruthy();
  expect(
    JSON.parse(localStorage.getItem(STORAGE_KEY)!).items.find(
      (item: { id: string }) => item.id === guard.id,
    ).policies[0].version,
  ).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(
    JSON.parse(localStorage.getItem(STORAGE_KEY)!).items.find(
      (item: { id: string }) => item.id === guard.id,
    ).policies[0],
  ).toMatchObject({ version: 2, text: "Version two rule" });
});

it("shows an unfinished latest version but prevents selecting it", () => {
  const items = seedEntities();
  const guard = items.find((item) => item.id === "customer-interaction")!;
  guard.status = "Ready";
  const policy = items.find((item) => item.id === guard.policies[0]!.policyId)!;
  policy.revisions = [{ version: 1, name: policy.name, text: policy.text }];
  policy.version = 2;
  policy.status = "Processing";
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, items }));
  show();
  fireEvent.click(screen.getByRole("button", { name: "Add Policy" }));
  const versions = screen.getByRole("combobox", { name: `Version for ${policy.name}` }) as HTMLSelectElement;
  expect(versions.value).toBe("1");
  expect((within(versions).getByRole("option", { name: "v2 · Latest · Processing (not ready)" }) as HTMLOptionElement).disabled).toBe(true);
});
