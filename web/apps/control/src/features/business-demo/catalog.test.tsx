/** @vitest-environment jsdom */
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BusinessCatalog, EntityDetail } from "./catalog";
import { BusinessDemoProvider } from "./provider";
import { PROCESSING_MS, seedEntities, STORAGE_KEY, type Kind } from "./model";

function App({ kind = "policies" }: { kind?: Kind }) {
  const [id, setId] = useState<string>();
  return (
    <BusinessDemoProvider
      config={{ mode: "mock", sourceId: "mock", policyAuthoring: true }}
    >
      <BusinessCatalog kind={kind} selectedId={id} onSelect={setId} />
    </BusinessDemoProvider>
  );
}
beforeEach(() => {
  localStorage.clear();
});

it("combines owner checkboxes with status and resets both filters", () => {
  render(<App />);
  const owners = within(screen.getByRole("group", { name: "Owner" }));
  fireEvent.click(owners.getByRole("checkbox", { name: "ISS" }));
  expect(
    screen.queryByRole("button", { name: /^Payment authorizationv/ }),
  ).toBeNull();
  fireEvent.click(owners.getByRole("checkbox", { name: "RMG" }));
  expect(
    screen.getByRole("button", { name: /^Payment authorizationv/ }),
  ).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole("group", { name: "Status" })).getByRole(
      "checkbox",
      { name: "Ready" },
    ),
  );
  expect(
    screen.queryByRole("button", { name: /^Payment authorizationv/ }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(
    (owners.getByRole("checkbox", { name: "All" }) as HTMLInputElement).checked,
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: /^Payment authorizationv/ }),
  ).toBeTruthy();
});
it("exposes filters directly as checkboxes and names the homepage Guardrail Profile", () => {
  render(<App kind="guardrails" />);
  expect(
    screen.getByRole("heading", { name: "Guardrail Profile" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Filters/ })).toBeNull();
  expect(screen.getByRole("checkbox", { name: "SG" })).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "CN" })).toBeTruthy();
});

it("edits through field icons, cancels changes, then saves", () => {
  render(<App />);
  fireEvent.click(
    screen.getByRole("button", { name: /^Customer data protectionv1/ }),
  );
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.queryByRole("button", { name: "Save" })).toBeNull();
  if (dialog.queryByRole("button", { name: "Edit Name" }))
    fireEvent.click(dialog.getByRole("button", { name: "Edit Name" }));
  fireEvent.change(dialog.getByRole("textbox", { name: "Name" }), {
    target: { value: "Changed name" },
  });
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  expect(
    dialog.getByRole("button", { name: "Edit Name" }).parentElement
      ?.textContent,
  ).toBe("Customer data protection");
  if (dialog.queryByRole("button", { name: "Edit Name" }))
    fireEvent.click(dialog.getByRole("button", { name: "Edit Name" }));
  fireEvent.change(dialog.getByRole("textbox", { name: "Name" }), {
    target: { value: "Changed name" },
  });
  fireEvent.click(dialog.getByRole("button", { name: "Save" }));
  expect(
    JSON.parse(localStorage.getItem(STORAGE_KEY)!).items.find(
      (x: { id: string }) => x.id === "customer-data",
    ).name,
  ).toBe("Changed name");
  expect(dialog.queryByRole("button", { name: "Save" })).toBeNull();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("shows a two-field policy editor without technical configuration", () => {
  render(<App />);
  expect(screen.queryByText(/demo/i)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create Policy" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getAllByRole("textbox")).toHaveLength(2);
  expect(dialog.queryByText("BUSU")).toBeNull();
  fireEvent.click(dialog.getByRole("button", { name: "Submit" }));
  expect(dialog.getByText("Enter a name.")).toBeTruthy();
  expect(dialog.getByText("Enter the rule text.")).toBeTruthy();
});

it("saves a draft, opens details, submits and completes with persisted text", () => {
  vi.useFakeTimers();
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Create Policy" }));
  if (screen.queryByRole("button", { name: "Edit Name" }))
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "UI test policy" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(
    within(screen.getByRole("dialog")).getByRole("heading", {
      name: "UI test policy",
    }),
  ).toBeTruthy();
  if (screen.queryByRole("button", { name: "Edit Rule text" }))
    fireEvent.click(screen.getByRole("button", { name: "Edit Rule text" }));
  fireEvent.change(screen.getByLabelText("Rule text", { exact: true }), {
    target: { value: "Keep customer records private." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(screen.getByText("Processing rules")).toBeTruthy();
  expect(screen.queryByText(/demo/i)).toBeNull();
  act(() => {
    vi.advanceTimersByTime(PROCESSING_MS);
  });
  expect(within(screen.getByRole("dialog")).getByText("Ready")).toBeTruthy();
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!).items[0];
  expect(saved).toMatchObject({
    name: "UI test policy",
    text: "Keep customer records private.",
    status: "Ready",
  });
});

it("guards unsaved changes when closing the drawer", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Create Policy" }));
  if (screen.queryByRole("button", { name: "Edit Name" }))
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "Unsaved" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByText("Discard unsaved changes?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(
    (screen.getByLabelText("Name", { exact: true }) as HTMLInputElement).value,
  ).toBe("Unsaved");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("exposes guardrail business scope and prevents incomplete submission", () => {
  render(<App kind="guardrails" />);
  expect(screen.queryByText(/demo/i)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create Guardrail Profile" }));
  expect(
    within(screen.getByRole("dialog")).getAllByRole("combobox", {
      name: /^(BUSU|Location|Agent type|Data type)$/,
    }),
  ).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(screen.getByText("Select location.")).toBeTruthy();
  expect(screen.getByText("Select at least one ready Policy.")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Rule text" })).toBeNull();
});

it("creates a guardrail from ready policies and exposes version links", () => {
  render(<App kind="guardrails" />);
  fireEvent.click(screen.getByRole("button", { name: "Create Guardrail Profile" }));
  expect(
    screen.queryByRole("checkbox", { name: /Employee confidentiality/ }),
  ).toBeNull();
  if (screen.queryByRole("button", { name: "Edit Name" }))
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "Linked guard" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Customer data protection/ }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Customer Interaction rules/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(
    screen
      .getByRole("link", { name: /Customer data protection/ })
      .getAttribute("href"),
  ).toBe("/policies?item=customer-data&version=1");
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!).items[0];
  expect(saved.policies).toHaveLength(2);
  expect(saved.text).toBe("");
});

it("shows reverse links on a policy and creates a new immutable version", () => {
  const items = seedEntities();
  const guard = items[0]!;
  const policy = items.find((p) => p.id === guard.policies[0]!.policyId)!;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, items }));
  render(<App />);
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(`^${policy.name}v1`) }),
  );
  expect(
    screen
      .getByRole("link", { name: /Customer Interaction/ })
      .getAttribute("href"),
  ).toBe(`/guardrails?item=${guard.id}`);
  if (screen.queryByRole("button", { name: "Edit Rule text" }))
    fireEvent.click(screen.getByRole("button", { name: "Edit Rule text" }));
  fireEvent.change(screen.getByLabelText("Rule text", { exact: true }), {
    target: { value: "Updated rule" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!).items;
  expect(saved[0].version).toBe(2);
  expect(
    saved.find((g: { id: string }) => g.id === guard.id).policies[0].text,
  ).toBe(policy.text);
});

it("paginates and resets the page after searching", () => {
  const example = seedEntities()[4]!;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      items: Array.from({ length: 18 }, (_, i) => ({
        ...example,
        id: `p${i}`,
        name: `Policy ${i}`,
      })),
    }),
  );
  render(<App />);
  expect(screen.getByText("1–8 of 18")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getByText("9–16 of 18")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Search policies" }), {
    target: { value: "Policy 17" },
  });
  expect(screen.getByText("1–1 of 1")).toBeTruthy();
});

it("deletes an unlinked policy after confirmation and persists removal", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Create Policy" }));
  if (screen.queryByRole("button", { name: "Edit Name" }))
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "Disposable policy" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete Policy" }));
  const confirmation = within(screen.getByRole("alertdialog"));
  fireEvent.click(confirmation.getByRole("button", { name: "Delete" }));
  expect(
    JSON.parse(localStorage.getItem(STORAGE_KEY)!).items.some(
      (x: { name: string }) => x.name === "Disposable policy",
    ),
  ).toBe(false);
});

it("blocks deletion of a referenced policy with the affected profiles", () => {
  render(<App />);
  fireEvent.click(
    screen.getByRole("button", { name: /^Customer Interaction rulesv1/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete Policy" }));
  const confirmation = within(screen.getByRole("alertdialog"));
  expect(
    confirmation.getByText(
      /Remove this Policy from these Guardrail Profiles first/,
    ),
  ).toBeTruthy();
  expect(
    (confirmation.getByRole("button", { name: "Delete" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("deletes a guardrail without deleting its policies", async () => {
  render(<App kind="guardrails" />);
  fireEvent.click(
    screen.getByRole("button", { name: "View Sensitive Information" }),
  );
  const before = JSON.parse(localStorage.getItem(STORAGE_KEY)!).items;
  if (screen.queryByRole("button", { name: "Edit Name" }))
    fireEvent.click(screen.getByRole("button", { name: "Edit Name" }));
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "Unsaved profile" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete profile",
      }),
    );
  });
  const after = JSON.parse(localStorage.getItem(STORAGE_KEY)!).items;
  expect(
    after.some((x: { id: string }) => x.id === "sensitive-information"),
  ).toBe(false);
  expect(after.filter((x: { kind: string }) => x.kind === "policies")).toEqual(
    before.filter((x: { kind: string }) => x.kind === "policies"),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("switches versions inside the same detail panel and protects unsaved edits", () => {
  const base = seedEntities().find((item) => item.kind === "policies")!;
  const item = {
    ...base,
    version: 2,
    status: "Draft" as const,
    text: "Latest rule",
    revisions: [
      { policyId: base.id, version: 1, name: base.name, text: "Previous rule" },
    ],
  };
  const change = vi.fn();
  render(
    <BusinessDemoProvider
      config={{ mode: "mock", sourceId: "mock", policyAuthoring: true }}
    >
      <EntityDetail item={item} onEdit={() => {}} onVersionChange={change} />
    </BusinessDemoProvider>,
  );
  expect(screen.queryByRole("link", { name: "v1" })).toBeNull();
  const oldVersion = screen.getByRole("button", { name: "v1" });
  fireEvent.click(oldVersion);
  expect(screen.getByText("Previous rule")).toBeTruthy();
  expect(screen.getByRole("button", { name: "v1" })).toBe(oldVersion);
  expect(change).toHaveBeenLastCalledWith(1);
  fireEvent.click(screen.getByRole("button", { name: "v2 · Latest" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit Rule text" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Rule text" }), {
    target: { value: "Unsaved rule" },
  });
  fireEvent.click(screen.getByRole("button", { name: "v1" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByText("Unsaved rule")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "v1" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard and switch" }));
  expect(screen.getByText("Previous rule")).toBeTruthy();
});

it("sorts policies by updated time in both directions before pagination", () => {
  const policy = seedEntities().find((item) => item.kind === "policies")!;
  const items = Array.from({ length: 10 }, (_, i) => ({
    ...policy,
    id: `sort-${i}`,
    name: `Sort policy ${i}`,
    updatedAt: 1000 + i,
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, items }));
  render(<App />);
  const rows = () => screen.getAllByRole("row").slice(1);
  expect(rows()[0]!.textContent).toContain("Sort policy 9");
  fireEvent.click(
    screen.getByRole("button", {
      name: "Updated: newest first; sort oldest first",
    }),
  );
  expect(rows()[0]!.textContent).toContain("Sort policy 0");
  expect(
    screen
      .getByRole("columnheader", { name: /Updated/ })
      .getAttribute("aria-sort"),
  ).toBe("ascending");
  fireEvent.click(
    screen.getByRole("button", {
      name: "Updated: oldest first; sort newest first",
    }),
  );
  expect(rows()[0]!.textContent).toContain("Sort policy 9");
});

it("shows linked guardrails on the latest policy even when they use an older version", () => {
  const items = seedEntities();
  const guard = items.find((item) => item.id === "customer-interaction")!;
  const policy = items.find((item) => item.id === guard.policies[0]!.policyId)!;
  policy.revisions = [{ version: 1, name: policy.name, text: policy.text }];
  policy.version = 2;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, items }));
  render(<BusinessDemoProvider config={{ mode: "mock", sourceId: "mock", policyAuthoring: true }}>
    <EntityDetail item={policy} selectedVersion={2} onEdit={() => {}} />
  </BusinessDemoProvider>);
  expect(screen.getByRole("link", { name: /Customer Interaction/ })).toBeTruthy();
  expect(screen.getByText("Uses v1 · Different version")).toBeTruthy();
  expect(screen.queryByText("No linked guardrail profiles")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "v1" }));
  expect(screen.getByText("Uses v1 · Viewing this version")).toBeTruthy();
});
