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
import { downloadJson } from "@/lib/file-download";
vi.mock("@/lib/file-download", () => ({ downloadJson: vi.fn() }));
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
function jsonFile(value: unknown) {
  const text = JSON.stringify(value);
  return Object.assign(new File([text], "backup.json", { type: "application/json" }), { text: async () => text });
}

it("downloads saved settings and imports a backup without requiring fields to be entered again", async () => {
  const connected = vi.fn();
  const backup = { format: "marketplace-connection", version: 1, data: "encrypted" };
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (!path.endsWith("/backup")) return Response.json(status);
    if (init?.method === "POST") {
      expect(JSON.parse(String(init.body))).toEqual(backup);
      expect(new Headers(init.headers).get("X-Marketplace-Connection")).toBe(status.connectionRevision);
      return Response.json(status);
    }
    return Response.json(backup);
  }));
  render(<ConnectionSetup onConnected={connected} onRetry={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: "Export saved JSON" }));
  await waitFor(() => expect(downloadJson).toHaveBeenCalledWith(backup, "marketplace-connection-backup.json"));
  fireEvent.change(screen.getByLabelText("Choose connection backup JSON"), { target: { files: [jsonFile(backup)] } });
  await waitFor(() => expect(connected).toHaveBeenCalledOnce());
});

it("manages the strict browser origin list from Advanced settings without saving other connections", async () => {
  const connected = vi.fn();
  const fetcher = vi.fn(async (path: string, request?: RequestInit) => {
    if (!path.endsWith("/allowed-origins")) return Response.json({ ...status, manualConfiguration: false });
    expect(new Headers(request?.headers).get("Authorization")).toBe("Bearer tech-user-token");
    const deploymentOrigins = ["https://old.portal.internal"];
    return Response.json(request?.method === "PUT"
      ? { ...JSON.parse(String(request.body)), deploymentOrigins, source: "saved" }
      : { origins: deploymentOrigins, deploymentOrigins, source: "deployment" });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<ConnectionSetup onConnected={connected} onRetry={() => {}} />);
  fireEvent.click(screen.getByText("Advanced settings (optional)"));
  fireEvent.change(await screen.findByLabelText("Tech user token"), { target: { value: "tech-user-token" } });
  fireEvent.click(screen.getByRole("button", { name: "Load allowed origins" }));
  await screen.findByText("Allowed origins loaded.");
  fireEvent.change(screen.getByLabelText("Allowed frontend origins"), { target: { value: "https://portal.internal:8443" } });
  fireEvent.click(screen.getByRole("button", { name: "Save allowed origins" }));
  await screen.findByText("Allowed origins saved.");
  const saved = fetcher.mock.calls.find(([, init]) => init?.method === "PUT");
  expect(JSON.parse(String(saved?.[1]?.body))).toEqual({ origins: ["https://portal.internal:8443"] });
  expect(screen.getByText("Using a saved override.")).toBeTruthy();
  const exportFile = { format: "marketplace-browser-origins", version: 1, origins: ["https://portal.internal:8443"] };
  fireEvent.click(screen.getByRole("button", { name: "Export origins JSON" }));
  expect(downloadJson).toHaveBeenCalledWith(exportFile, "marketplace-allowed-origins.json");
  fireEvent.click(screen.getByRole("button", { name: "Restore deployment origins" }));
  await screen.findByText("Deployment origins restored.");
  expect((screen.getByLabelText("Allowed frontend origins") as HTMLTextAreaElement).value).toBe("https://old.portal.internal");
  expect(screen.getByText("Using deployment settings.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Choose allowed origins JSON"), { target: { files: [jsonFile(exportFile)] } });
  await screen.findByText("Allowed origins saved.");
  expect((screen.getByLabelText("Allowed frontend origins") as HTMLTextAreaElement).value).toBe("https://portal.internal:8443");
  expect(connected).not.toHaveBeenCalled();
});
it("tests Evaluate without saving and refreshes its activity log", async () => {
  const connected = vi.fn();
  let tested = false;
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/test")) {
      tested = true;
      expect(JSON.parse(String(init?.body))).toEqual({ target: "evaluationUrl", settings: { evaluationUrl: "https://evaluate.internal" } });
      return Response.json({ ok: true, target: "evaluationUrl", message: "Evaluate API reachable.", durationMs: 5 });
    }
    return Response.json({ ...status, evaluationLogs: tested ? [{ time: "2026-11-24T00:00:00Z", action: "test", status: 200, durationMs: 5, requestId: "reference-test" }] : [] });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<ConnectionSetup onConnected={connected} onRetry={() => {}} />);
  const input = await screen.findByLabelText("Evaluate URL");
  await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false));
  fireEvent.change(input, { target: { value: "https://evaluate.internal" } });
  fireEvent.click(screen.getByRole("button", { name: "Test Evaluate URL" }));
  expect(await screen.findByText("Evaluate API reachable. (5 ms)")).toBeTruthy();
  fireEvent.click(await screen.findByText("Evaluate activity log · 1"));
  expect(screen.getByText("reference-test")).toBeTruthy();
  expect(connected).not.toHaveBeenCalled();
});
it("saves and restores only Evaluate from the fallback controls", async () => {
  let saved = false;
  const connected = vi.fn();
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/evaluation")) {
      saved = init?.method === "POST";
      if (saved) expect(JSON.parse(String(init?.body))).toEqual({ evaluationUrl: "https://backup.internal" });
      else expect(init?.body).toBeUndefined();
    }
    const deployment = { source: "MARKETPLACE_EVALUATION_URL", status: "loaded", preview: "https://primary.internal" };
    const effective = saved ? { ...deployment, source: "Saved settings", preview: "https://backup.internal" } : deployment;
    return Response.json({ ...status, values: { evaluationUrl: { effective, deployment, overridden: saved } } });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<ConnectionSetup onConnected={connected} onRetry={() => {}} />);
  await screen.findByText(/Using deployment settings/);
  fireEvent.change(screen.getByLabelText("NeMo URL"), { target: { value: "https://leave-this-alone.internal/api/v1" } });
  fireEvent.change(screen.getByLabelText("Evaluate URL"), { target: { value: "https://backup.internal" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Evaluate fallback" }));
  const restore = await screen.findByRole("button", { name: "Use deployment Evaluate URL" });
  await waitFor(() => expect((restore as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(restore);
  await screen.findByText(/Saved fallback cleared/);
  expect((screen.getByLabelText("NeMo URL") as HTMLInputElement).value).toBe("https://leave-this-alone.internal/api/v1");
  expect(connected).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.filter(([path]) => path.endsWith("/evaluation")).map(([, init]) => init?.method)).toEqual(["POST", "DELETE"]);
});
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
