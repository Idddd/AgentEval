/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { BusinessConnectionStatus, BusinessDemoProvider } from "./provider";
import { BusinessCatalog } from "./catalog";
import { STORAGE_KEY, seedEntities } from "./model";
const policy = {
  id: "remote-policy",
  name: "Remote Privacy",
  description: "Keep data private",
  version: "2026.09",
  implementation: "rules",
};
const live = {
  mode: "live" as const,
  sourceId: "remote",
  policyAuthoring: false,
};
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function app(mode: "live" | "auto" = "live") {
  return render(
    <BusinessDemoProvider config={{ ...live, mode }}>
      <BusinessConnectionStatus />
      <BusinessCatalog kind="policies" onSelect={() => {}} />
    </BusinessDemoProvider>,
  );
}
function connect() {
  fireEvent.change(screen.getByLabelText("Access token"), {
    target: { value: "personal-secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
}
function responding() {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith("/policies"))
      return Response.json({ items: [policy], count: 1 });
    if (url.endsWith("/guardrails")) return Response.json({ items: [] });
    throw new Error("unexpected URL");
  });
}
it("opens the live demo automatically without a token form and reconnects on remount", async () => {
  const fetcher = responding();
  vi.stubGlobal("fetch", fetcher);
  const mount = () => render(
    <BusinessDemoProvider config={{ ...live, autoConnect: true }}>
      <BusinessConnectionStatus />
      <BusinessCatalog kind="policies" onSelect={() => {}} />
    </BusinessDemoProvider>,
  );
  const first = mount();
  expect(screen.queryByLabelText("Access token")).toBeNull();
  await screen.findByRole("button", { name: /^Remote Privacy/ });
  expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).has("Authorization")).toBe(false);
  first.unmount();
  mount();
  await screen.findByRole("button", { name: /^Remote Privacy/ });
  expect(screen.queryByLabelText("Access token")).toBeNull();
});
it("offers retry instead of requiring a token when automatic demo connection fails", async () => {
  const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => { throw new Error("offline"); });
  vi.stubGlobal("fetch", fetcher);
  render(
    <BusinessDemoProvider config={{ ...live, autoConnect: true }}>
      <BusinessCatalog kind="policies" onSelect={() => {}} />
    </BusinessDemoProvider>,
  );
  await screen.findByRole("alert");
  expect(screen.queryByLabelText("Access token")).toBeNull();
  fetcher.mockImplementation(responding());
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByRole("button", { name: /^Remote Privacy/ });
});
it("isolates live records from existing mock storage and keeps tokens out of storage", async () => {
  const stored = JSON.stringify({ version: 2, items: seedEntities() });
  localStorage.setItem(STORAGE_KEY, stored);
  vi.stubGlobal("fetch", responding());
  app();
  expect(screen.queryByText("Guardrails")).toBeNull();
  connect();
  expect(
    await screen.findByRole("button", { name: /^Remote Privacy/ }),
  ).toBeTruthy();
  expect(screen.queryByText("Customer Interaction Profile")).toBeNull();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);
  expect(JSON.stringify(sessionStorage)).not.toContain("personal-secret");
  fireEvent.click(screen.getByRole("button", { name: "Create Guardrail" }));
  expect(screen.getByText(/Rule authoring is not configured/)).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Submit" }).hasAttribute("disabled"),
  ).toBe(true);
});
it("auto mode falls back only on initial connection failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );
  app("auto");
  connect();
  expect(await screen.findByText("Offline · Local data")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Create Guardrail" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reconnect" })).toBeTruthy();
});
it("does not hide a permission failure behind mock data", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { error: { code: "forbidden", message: "Insufficient permissions" } },
        { status: 403 },
      ),
    ),
  );
  app("auto");
  connect();
  expect(await screen.findByText("Insufficient permissions")).toBeTruthy();
  expect(screen.queryByText("Offline · Local data")).toBeNull();
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});
it("keeps last live data on subsequent failures without switching sources", async () => {
  const fetcher = responding();
  vi.stubGlobal("fetch", fetcher);
  app("auto");
  connect();
  await screen.findByRole("button", { name: /^Remote Privacy/ });
  fetcher.mockImplementation(async () => {
    throw new Error("disconnected");
  });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Showing last retrieved data",
    ),
  );
  expect(screen.queryByText("Offline · Local data")).toBeNull();
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});
it("fails closed when runtime settings cannot load", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}, { status: 503 })),
  );
  render(
    <BusinessDemoProvider>
      <BusinessCatalog kind="guardrails" onSelect={() => {}} />
    </BusinessDemoProvider>,
  );
  expect(
    await screen.findByText("Cannot load connection settings."),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});
