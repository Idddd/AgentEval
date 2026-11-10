/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConnectionSetup } from "./connection-setup";
import { NmgrMode } from "./live";
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/v3/guardrails");
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const status = {
  saved: true,
  connectionRevision: "revision-one",
  configured: { nemoUrl: true, nemoToken: true, databaseUrl: true },
  persistence: "pod",
  manualConfiguration: true,
};
it("shows Secret read failures and both masked deployment and saved values without submitting previews", async () => {
  const token = { source: "Saved settings", status: "loaded", preview: "••••••••2222", length: 20 };
  const deployment = { source: "GUARD_API_TOKEN_FILE", status: "unreadable", preview: "", path: "/run/secrets/nemo", code: "ENOENT" };
  const fetcher = vi.fn(async () => Response.json({ ...status, values: { nemoToken: { effective: token, deployment, overridden: true } } }));
  vi.stubGlobal("fetch", fetcher);
  render(<ConnectionSetup onConnected={() => {}} onRetry={() => {}} />);
  expect(await screen.findByText(/ENOENT/)).toBeTruthy();
  expect(screen.getByText(/••••••••2222/)).toBeTruthy();
  expect(screen.getByText(/Deployment value is overridden/)).toBeTruthy();
  expect((screen.getByLabelText("NeMo Token") as HTMLInputElement).value).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Refresh configuration status" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
});
it("tests individual entered settings without saving or entering the workspace and clears stale results on edit", async () => {
  const connected = vi.fn();
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => path.endsWith("/test")
    ? Response.json({ ok: true, target: "nemoUrl", message: "Reachable; test Token next", durationMs: 8 })
    : Response.json({ ...status, advanced: { nemoTls: "skip" } }));
  vi.stubGlobal("fetch", fetcher);
  render(<ConnectionSetup onConnected={connected} onRetry={() => {}} />);
  await screen.findByRole("button", { name: "Use deployment settings" });
  fireEvent.change(screen.getByLabelText("NeMo URL"), { target: { value: "https://new.test/api/v1" } });
  fireEvent.click(screen.getByRole("button", { name: "Test NeMo URL" }));
  expect(await screen.findByText(/Reachable; test Token next/)).toBeTruthy();
  expect(JSON.parse(String(fetcher.mock.calls.find(([path]) => path.endsWith("/test"))?.[1]?.body))).toEqual({ target: "nemoUrl", settings: { nemoUrl: "https://new.test/api/v1" } });
  expect(connected).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.filter(([path, init]) => path === "/api/nmgr/connection" && init?.method === "POST")).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("NeMo URL"), { target: { value: "https://changed.test/api/v1" } });
  expect(screen.queryByText(/Reachable; test Token next/)).toBeNull();
});

it("masks all three fields and saves only entered replacements without browser credential storage", async () => {
  const connected = vi.fn(),
    fetcher = vi.fn(async (_path: string, init?: RequestInit) =>
      Response.json(
        init?.method === "POST"
          ? { ...status, connectionRevision: "revision-two" }
          : status,
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ConnectionSetup onConnected={connected} onRetry={() => {}} />);
  for (const label of ["NeMo URL", "NeMo Token", "Database URL"])
    expect((screen.getByLabelText(label) as HTMLInputElement).type).toBe(
      "password",
    );
  await screen.findByRole("button", { name: "Use deployment settings" });
  fireEvent.change(screen.getByLabelText("NeMo Token"), {
    target: { value: "manually-entered-private-token" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save & connect" }));
  await waitFor(() => expect(connected).toHaveBeenCalledOnce());
  const call = fetcher.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(JSON.parse(String(call[1]?.body))).toEqual({
    nemoToken: "manually-entered-private-token",
  });
  expect(new Headers(call[1]?.headers).get("x-marketplace-connection")).toBe(
    "revision-one",
  );
  expect(
    JSON.stringify([
      Object.entries(localStorage),
      Object.entries(sessionStorage),
    ]),
  ).not.toContain("manually-entered-private-token");
});
it("keeps the masked form available when a dependency rejects the save", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const connected = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json(
            {
              error: {
                message: "NeMo token rejected",
                code: "nemo_identity_rejected",
              },
            },
            { status: 503 },
          )
        : Response.json(status),
    ),
  );
  render(<ConnectionSetup onConnected={connected} onRetry={() => {}} />);
  await screen.findByRole("button", { name: "Use deployment settings" });
  fireEvent.change(screen.getByLabelText("NeMo Token"), {
    target: { value: "bad-private-token" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save & connect" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "NeMo token rejected",
  );
  expect((screen.getByLabelText("NeMo Token") as HTMLInputElement).type).toBe(
    "password",
  );
  expect(connected).not.toHaveBeenCalled();
});
it("offers optional settings in the default connection page and saves masked replacements", async () => {
  const connected = vi.fn(),
    fetcher = vi.fn(async (_path: string, init?: RequestInit) =>
      Response.json(status),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ConnectionSetup onConnected={connected} onRetry={() => {}} />);
  await screen.findByRole("button", { name: "Use deployment settings" });
  fireEvent.click(screen.getByText("Advanced settings (optional)"));
  fireEvent.change(screen.getByLabelText("Workspace ID"), {
    target: { value: "uat-fixed" },
  });
  fireEvent.change(screen.getByLabelText("Database TLS"), {
    target: { value: "url" },
  });
  fireEvent.change(screen.getByLabelText("Trusted CA"), {
    target: { value: "system" },
  });
  fireEvent.change(screen.getByLabelText("F5 integration"), {
    target: { value: "disabled" },
  });
  expect((screen.getByLabelText("Workspace ID") as HTMLInputElement).type).toBe(
    "password",
  );
  fireEvent.click(screen.getByRole("button", { name: "Save & connect" }));
  await waitFor(() => expect(connected).toHaveBeenCalledOnce());
  const call = fetcher.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(JSON.parse(String(call[1]?.body))).toEqual({
    workspaceId: "uat-fixed",
    databaseTls: "url",
    caMode: "system",
    f5Mode: "disabled",
  });
});
it("switches the live demo role without a user token or extra account mapping", async () => {
  const fetcher = vi.fn(async (path: string, init?: RequestInit) =>
    path.includes("marketplace-config")
      ? Response.json({
          mode: "live",
          demoRoleSwitching: true,
          connectionRevision: "revision-one",
        })
      : Response.json({
          accessMode: "demo",
          revision: 0,
          actor: {
            id: "demo",
            role:
              new Headers(init?.headers).get("x-marketplace-role") ?? "User",
            name: "Demo identity",
            unit: "ISS",
          },
          state: { entities: [], audit: [] },
          jobs: {},
          bindings: {},
        }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<NmgrMode />);
  const role = (await screen.findByLabelText("Workbench")) as HTMLSelectElement;
  expect(role.disabled).toBe(false);
  fireEvent.change(role, { target: { value: "IT Admin" } });
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Workbench") as HTMLSelectElement).value,
    ).toBe("IT Admin"),
  );
  expect(
    fetcher.mock.calls.some(
      ([, init]) =>
        new Headers(init?.headers).get("x-marketplace-role") === "IT Admin",
    ),
  ).toBe(true);
  expect(
    fetcher.mock.calls.every(
      ([, init]) => !new Headers(init?.headers).has("authorization"),
    ),
  ).toBe(true);
});
it("keeps fallback and advanced settings on the default V3 route when deployment configuration is missing", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      path.includes("marketplace-config")
        ? Response.json(
            {
              error: {
                code: "nemo_url_missing",
                message: "Configure NeMo URL",
              },
            },
            { status: 503 },
          )
        : Response.json({ configured: {}, manualConfiguration: true }),
    ),
  );
  render(<NmgrMode />);
  await screen.findByText("Advanced settings (optional)");
  expect(screen.getByLabelText("NeMo URL")).toBeTruthy();
  expect(screen.getByLabelText("Database URL")).toBeTruthy();
  expect(window.location.pathname).toBe("/v3/guardrails");
  expect(window.location.hash).toBe("#connection");
});

const workspace = { revision: 0, actor: { id: "demo", name: "Demo identity", role: "User", unit: "ISS" }, state: { entities: [], audit: [] }, jobs: {}, bindings: {} };
it.each(["nemoToken", "databaseUrl"])("opens setup when runtime responds but %s is missing", async field => {
  const partial = { ...status, configured: { ...status.configured, [field]: false } };
  const fetcher = vi.fn(async (path: string) => Response.json(path.includes("marketplace-config") ? { mode: "live", ...partial } : partial));
  vi.stubGlobal("fetch", fetcher);
  render(<NmgrMode />);
  await screen.findByLabelText("NeMo URL");
  expect(window.location.hash).toBe("#connection");
  expect(fetcher.mock.calls.some(([path]) => path === "/api/nmgr/workspace")).toBe(false);
});
it("hides the settings entry after configuration and opens settings only through its address", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => Response.json(
    path.includes("marketplace-config") ? { mode: "live" } : path === "/api/nmgr/connection" ? status : workspace,
  )));
  const page = render(<NmgrMode />);
  await screen.findByLabelText("Workbench");
  expect(screen.queryByRole("button", { name: "Connection settings" })).toBeNull();
  expect(screen.queryByLabelText("NeMo URL")).toBeNull();
  page.unmount();
  window.history.replaceState(null, "", "/v3/guardrails?role=user#connection");
  render(<NmgrMode />);
  expect(await screen.findByLabelText("NeMo URL")).toBeTruthy();
  await screen.findByRole("button", { name: "Use deployment settings" });
  fireEvent.click(screen.getByRole("button", { name: "Save & connect" }));
  await screen.findByLabelText("Workbench");
  expect(window.location.hash).toBe("");
  expect(window.location.search).toBe("?role=user");
});

it("does not open settings automatically when a configured runtime or backend fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (path: string) => path === "/api/nmgr/connection"
    ? Response.json(status)
    : Response.json({ error: { code: "nemo_token_invalid", message: "Saved token needs attention" } }, { status: 503 })));
  render(<NmgrMode />);
  await screen.findByRole("alert");
  expect(screen.queryByLabelText("NeMo URL")).toBeNull();
  expect(window.location.hash).toBe("");
});

it("clears an old runtime error when returning from the settings address after recovery", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let recovered = false;
  vi.stubGlobal("fetch", vi.fn(async (path: string) => path.includes("marketplace-config")
    ? recovered ? Response.json({ mode: "live" }) : Response.json({ error: { message: "Runtime unavailable" } }, { status: 503 })
    : Response.json(path === "/api/nmgr/connection" ? status : workspace)));
  render(<NmgrMode />);
  await screen.findByRole("alert");
  act(() => { window.location.hash = "connection"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
  await screen.findByLabelText("NeMo URL");
  recovered = true;
  act(() => { window.history.replaceState(null, "", "/v3/guardrails"); window.dispatchEvent(new HashChangeEvent("hashchange")); });
  await screen.findByLabelText("Workbench");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("shows F5 beside NeMo, tests its URL without sending the token, and saves entered settings", async () => {
  const connected = vi.fn();
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => Response.json(path.endsWith("/test")
    ? { message: "F5 reachable", durationMs: 4 } : { ...status, advanced: { f5Mode: "disabled" } }));
  vi.stubGlobal("fetch", fetcher);
  render(<ConnectionSetup onConnected={connected} onRetry={() => {}} />);
  await screen.findByRole("button", { name: "Use deployment settings" });
  const mode = screen.getByLabelText("F5 integration");
  expect(mode.closest("details")).toBeNull();
  fireEvent.change(mode, { target: { value: "enabled" } });
  fireEvent.change(screen.getByLabelText("F5 URL"), { target: { value: "https://f5.example/backend/v1" } });
  fireEvent.change(screen.getByLabelText("F5 Token"), { target: { value: "private-f5-token" } });
  expect((screen.getByLabelText("F5 Token") as HTMLInputElement).type).toBe("password");
  fireEvent.click(screen.getByRole("button", { name: "Test F5 URL" }));
  await screen.findByText(/F5 reachable/);
  expect(JSON.parse(String(fetcher.mock.calls.find(([path]) => path.endsWith("/test"))?.[1]?.body))).toEqual({ target: "f5Url", settings: { f5Url: "https://f5.example/backend/v1", f5Mode: "enabled" } });
  fireEvent.click(screen.getByRole("button", { name: "Save & connect" }));
  await waitFor(() => expect(connected).toHaveBeenCalledOnce());
  expect(JSON.parse(String(fetcher.mock.calls.find(([path, init]) => path === "/api/nmgr/connection" && init?.method === "POST")?.[1]?.body))).toEqual({ f5Url: "https://f5.example/backend/v1", f5Token: "private-f5-token", f5Mode: "enabled" });
});
