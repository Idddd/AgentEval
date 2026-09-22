/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BusinessDemoProvider, useBusinessDemo } from "./provider";
import { OwnerMenu } from "./owner-menu";
import { blankDraft, OWNER_STORAGE_KEY, STORAGE_KEY } from "./model";

const config = {
  mode: "mock" as const,
  sourceId: "mock",
  policyAuthoring: true,
};
function Actions() {
  const { items, save } = useBusinessDemo();
  return (
    <>
      <button
        onClick={() =>
          save("policies", { ...blankDraft, name: "Owned policy" }, false)
        }
      >
        Create record
      </button>
      <button
        onClick={() => {
          const existing = items.find((item) => item.name === "Owned policy");
          if (existing)
            void save(
              "policies",
              { ...existing, text: "Updated rules" },
              false,
              existing,
            );
        }}
      >
        Edit record
      </button>
      <output aria-label="Record owner">
        {items.find((item) => item.name === "Owned policy")?.owner}
      </output>
    </>
  );
}
function app(compact = false) {
  return render(
    <BusinessDemoProvider config={config}>
      <OwnerMenu compact={compact} />
      <Actions />
    </BusinessDemoProvider>,
  );
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("switches among the existing owners and uses the current owner on new records", async () => {
  app();
  const before = JSON.parse(localStorage.getItem(STORAGE_KEY)!).items;
  await userEvent.click(
    screen.getByRole("button", { name: "Open account menu for Admin" }),
  );
  expect(
    screen.getAllByRole("menuitemradio").map((item) => item.textContent),
  ).toEqual(["Admin", "IT Admin", "ISS", "Security", "Compliance", "RMG"]);
  await userEvent.click(screen.getByRole("menuitemradio", { name: "ISS" }));
  expect(
    screen.getByRole("button", { name: "Open account menu for ISS" }),
  ).toBeTruthy();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).items).toEqual(before);
  await userEvent.click(screen.getByRole("button", { name: "Create record" }));
  expect(screen.getByLabelText("Record owner").textContent).toBe("ISS");
  await userEvent.click(
    screen.getByRole("button", { name: "Open account menu for ISS" }),
  );
  await userEvent.click(
    screen.getByRole("menuitemradio", { name: "Compliance" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Edit record" }));
  expect(screen.getByLabelText("Record owner").textContent).toBe("ISS");
});

it("remembers the selection on refresh and works with a collapsed sidebar", async () => {
  const view = app(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Open account menu for Admin" }),
  );
  await userEvent.click(screen.getByRole("menuitemradio", { name: "RMG" }));
  expect(localStorage.getItem(OWNER_STORAGE_KEY)).toBe("RMG");
  view.unmount();
  app(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Open account menu for RMG" }),
  );
  expect(
    screen
      .getByRole("menuitemradio", { name: "RMG" })
      .getAttribute("aria-checked"),
  ).toBe("true");
});

it("falls back to Admin for an unavailable saved owner", () => {
  localStorage.setItem(OWNER_STORAGE_KEY, "not-an-owner");
  app();
  expect(
    screen.getByRole("button", { name: "Open account menu for Admin" }),
  ).toBeTruthy();
});

it("still switches when browser storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  app();
  await userEvent.click(
    screen.getByRole("button", { name: "Open account menu for Admin" }),
  );
  await userEvent.click(
    screen.getByRole("menuitemradio", { name: "Compliance" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Create record" }));
  expect(screen.getByLabelText("Record owner").textContent).toBe("Compliance");
});

it("switches real accounts through authentication rather than impersonating a local owner", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ items: [], count: 0 })),
  );
  render(
    <BusinessDemoProvider config={{ ...config, mode: "live" }}>
      <OwnerMenu />
    </BusinessDemoProvider>,
  );
  await userEvent.type(screen.getByLabelText("Access token"), "test-token");
  await userEvent.click(screen.getByRole("button", { name: "Connect" }));
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Open account menu for Guard connection",
    }),
  );
  expect(screen.queryByRole("menuitemradio")).toBeNull();
  await userEvent.click(
    screen.getByRole("menuitem", { name: "Switch account" }),
  );
  expect(screen.getByLabelText("Access token")).toBeTruthy();
});
