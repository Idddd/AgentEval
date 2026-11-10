/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NmgrMode } from "./live";
import type { Entity, Role } from "./model";
import type { NmgrBinding } from "../../../marketplace-server/nmgr";

const liveEntity = (id: string, kind: Entity["kind"], patch: Partial<Entity> = {}): Entity => ({
  id, kind, name: id, provider: "NeMo", description: "Real business intent", unit: "ISS", location: "ALL", custodian: "Author", approver: "Approver", mandatory: false,
  status: "DEPLOYED", version: 1, deployed: 1, updated: "2026-10-23T00:00:00Z", policies: [], refs: [], deployedRefs: [], attributes: { bu: "", agent: "", data: "" }, runs: [], mode: "Normal", threshold: 5, ...patch,
});
function serveWorkspace(entities: Entity[], role: Role = "User", bindings: Record<string, NmgrBinding> = {}) {
  const snapshot = { revision: 1, actor: { id: "u", name: "Configured Author", role, unit: "ISS" }, state: { entities, audit: [] }, jobs: {}, bindings };
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => url === "/api/marketplace-config?workspace=v3" ? Response.json({ mode: "live" }) : Response.json(snapshot));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

it("records V3 page navigation so browser Back returns within V3 instead of the previous V2 document", async () => {
  window.history.replaceState({ marker: "router-state" }, "", "/v2/guardrails");
  window.history.pushState({ marker: "router-state" }, "", "/v3/guardrails?role=user");
  serveWorkspace([liveEntity("route-profile", "Profile")]);
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: "Configure Profiles" }));
  expect(window.location.hash).toBe("#Profile/repository/");
  expect(window.history.state.marker).toBe("router-state");
  fireEvent.click(screen.getByRole("button", { name: "route-profile" }));
  expect(window.location.hash).toBe("#Profile/repository/route-profile");
  window.history.back();
  await waitFor(() => expect(screen.queryByRole("button", { name: "Back to list" })).toBeNull());
  expect(window.location.pathname).toBe("/v3/guardrails");
  expect(window.location.hash).toBe("#Profile/repository/");
});

it("restores a V3 Profile detail from its bookmarked URL", async () => {
  window.history.replaceState(null, "", "/v3/guardrails?role=user#Profile/repository/bookmarked-profile");
  serveWorkspace([liveEntity("bookmarked-profile", "Profile")]);
  render(<NmgrMode />);
  expect(await screen.findByRole("button", { name: "Back to list" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "bookmarked-profile" })).toBeTruthy();
});

it("keeps the current Profile detail when using Skip to content", async () => {
  window.history.replaceState(null, "", "/v3/guardrails?role=user#Profile/repository/focused-profile");
  serveWorkspace([liveEntity("focused-profile", "Profile")]);
  render(<NmgrMode />);
  await screen.findByRole("button", { name: "Back to list" });
  fireEvent.click(screen.getByRole("link", { name: "Skip to content" }));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(window.location.hash).toBe("#Profile/repository/focused-profile");
  expect(screen.getByRole("button", { name: "Back to list" })).toBeTruthy();
  expect(document.activeElement?.id).toBe("nmgr-content");
});
beforeEach(() => {
  window.history.replaceState(null, "", "/v3/guardrails");
  localStorage.clear(); sessionStorage.clear();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("automatically imports and displays externally managed resources without edit or release actions", async () => {
  const imported = { remoteId: "nemo-policy", available: true, checkedAt: "2026-11-05T00:00:00Z", policyBindings: [] };
  const fetcher = serveWorkspace([liveEntity("imported-policy", "Guardrail", { imported })]);
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: "imported-policy" }));
  expect(fetcher.mock.calls.some(([url, init]) => url === "/api/nmgr/workspace" && new Headers((init as RequestInit)?.headers).get("X-Marketplace-Import") === "true")).toBe(true);
  expect(screen.getByText(/Managed in NeMo/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Create revision" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit requirements" })).toBeNull();
  expect(screen.queryByText(/NeMo draft sync:/)).toBeNull();
});
it("keeps existing records visible with an import error when discovery fails", async () => {
  const fetcher = serveWorkspace([liveEntity("saved-policy", "Guardrail")]);
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (url, init?: RequestInit) => new Headers(init?.headers).get("X-Marketplace-Import") === "true" ? Response.json({ error: { message: "NeMo catalog denied", code: "nemo_http_403" } }, { status: 503 }) : original(url));
  render(<NmgrMode />);
  expect(await screen.findByRole("button", { name: "saved-policy" })).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("NeMo import failed");
});
it("imports F5 in the background, leaves NeMo usable while pending, and shows a separate failure", async () => {
  const fetcher = serveWorkspace([liveEntity("nemo-visible", "Guardrail")]);
  const original = fetcher.getMockImplementation()!;
  let resolve!: (value: Response) => void;
  fetcher.mockImplementation(async (url, init) => {
    if (url === "/api/nmgr/v1/integrations/f5/imports") return new Promise<Response>(done => { resolve = done; });
    const response = await original(url, init), data = await response.json();
    return Response.json({ ...data, sources: ["NeMo", "F5"] });
  });
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: "nemo-visible" }));
  expect(screen.getByRole("heading", { name: "nemo-visible" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Back to list" }).hasAttribute("disabled")).toBe(false);
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  resolve(Response.json({ error: { code: "f5_http_403", message: "F5 catalog denied", requestId: "f5-reference" } }, { status: 403 }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("F5 import failed"));
  expect(screen.getByRole("heading", { name: "nemo-visible" })).toBeTruthy();
});
it("shows real F5 versions and exact disabled Project bindings with read-only drilldown", async () => {
  const meta = { available: true, checkedAt: "2026-11-09T00:00:00Z", policyBindings: [] };
  const scanner = liveEntity("external-scanner", "Guardrail", { provider: "F5", sourceInstanceId: "f5", imported: { ...meta, remoteId: "remote-scanner", f5: { currentVersionId: "v2-id", versions: [{ id: "v1-id", name: "Version One", published: true }, { id: "v2-id", name: "Version Two", published: false }], scannerBindings: [], packageBindings: [] } } });
  const project = liveEntity("external-project", "Profile", { provider: "F5", sourceInstanceId: "f5", deployed: null, refs: [scanner.id], imported: { ...meta, remoteId: "remote-project", f5: { versions: [], deploymentStatus: "draft", scannerBindings: [{ id: "remote-scanner", version: "v1-id", direction: "response", enabled: false, blocking: false, mode: "monitor" }], packageBindings: [] } } });
  window.history.replaceState(null, "", "/v3/guardrails#Profile/repository/external-project");
  serveWorkspace([scanner, project]); render(<NmgrMode />);
  const table = await screen.findByRole("table", { name: "F5 Scanner bindings" });
  expect(within(table).getByText("v1-id")).toBeTruthy(); expect(within(table).getAllByText("No")).toHaveLength(2);
  expect(screen.queryByText("NeMo Policy bindings (draft)")).toBeNull();
  expect(screen.getByText(/Managed in F5/)).toBeTruthy();
  fireEvent.click(within(table).getByRole("button", { name: "external-scanner" }));
  expect(await screen.findByRole("table", { name: "F5 Scanner versions" })).toBeTruthy();
  expect(screen.getByText("Version Two")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Create revision" })).toBeNull();
});
it.each(["before", "after"])("retains NeMo backend observations when F5 import finishes %s the status query", async timing => {
  let revision = 1, imports = 0, readRevision = 0;
  let finishImport!: () => void;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/marketplace-config?workspace=v3") return Response.json({ mode: "live" });
    if (url === "/api/nmgr/v1/integrations/f5/imports") {
      imports++;
      if (imports === 2 && timing === "after") await new Promise<void>(resolve => { finishImport = resolve; });
      revision++; return Response.json({ revision, imported: { guardrails: 0, profiles: 0 } });
    }
    if (url.includes("?resource=")) return Response.json({ id: "stable-nemo", revision, checkedAt: "2026-11-09T00:00:00Z", status: "available", message: "Backend resource readable" });
    readRevision = revision;
    return Response.json({ revision, sources: ["NeMo", "F5"], actor: { id: "u", name: "User", role: "User", unit: "ISS" }, state: { entities: [liveEntity("stable-nemo", "Guardrail")], audit: [] }, jobs: {}, bindings: {} });
  }));
  render(<NmgrMode />);
  await screen.findByRole("button", { name: "stable-nemo" });
  await waitFor(() => expect(readRevision).toBe(2));
  fireEvent.click(screen.getByRole("button", { name: "Refresh backend status" }));
  if (timing === "after") {
    await screen.findByText("Backend resource readable");
    finishImport();
  }
  await waitFor(() => expect(readRevision).toBe(3));
  await waitFor(() => expect(screen.getByText("Backend resource readable")).toBeTruthy());
  expect(screen.queryByText(/Workspace changed during the query/)).toBeNull();
});
it("renders the shared dashboard with zero disconnected metrics, real released counts, and working create navigation", async () => {
  serveWorkspace([liveEntity("published-control", "Guardrail"), liveEntity("draft-control", "Guardrail", { deployed: null, status: "DRAFT" }), liveEntity("published-profile", "Profile", { refs: ["published-control"], deployedRefs: ["published-control"] })]);
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: "Dashboard" }));
  const scans = screen.getByRole("region", { name: "In Last 10 Minutes" });
  expect(within(scans).getByText("0")).toBeTruthy();
  expect(within(scans).getByText("Pass: 0")).toBeTruthy();
  expect(within(scans).getByText("Block: 0")).toBeTruthy();
  expect(within(scans).getAllByText("0.00 %")).toHaveLength(3);
  expect(within(screen.getByRole("region", { name: "Deployed Protection" })).getAllByText("1")).toHaveLength(2);
  expect(screen.getByText(/Traffic metrics are not connected/)).toBeTruthy();
  expect(screen.getByRole("table", { name: "Enforce & Prevent" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "New Guardrail" }));
  expect(screen.getByLabelText("Name")).toBeTruthy();
  expect(screen.queryByLabelText("ID")).toBeNull();
});
it.each(["Guardrail/repository/", "Profile/dashboard/"])("opens V3 Guardrail creation from %s without navigating and protects unsaved changes", async route => {
  window.history.replaceState(null, "", `/v3/guardrails?role=user#${route}`);
  const fetcher = serveWorkspace([]);
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: /^(New|Create) Guardrail$/ }));
  expect(screen.getByRole("dialog", { name: "Create Guardrail" })).toBeTruthy();
  expect(window.location.hash).toBe(`#${route}`);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unsaved Guardrail" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Discard unsaved changes?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Unsaved Guardrail");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(window.location.hash).toBe(`#${route}`);
  expect(fetcher.mock.calls.some(([url]) => url === "/api/nmgr/commands")).toBe(false);
});
it("retains the V3 drawer on create failure and closes it after a successful retry", async () => {
  window.history.replaceState(null, "", "/v3/guardrails?role=user#Profile/dashboard/");
  const fetcher = serveWorkspace([]);
  const original = fetcher.getMockImplementation()!;
  let accepted = false;
  fetcher.mockImplementation(async (url, init) => {
    if (url !== "/api/nmgr/commands") return original(url, init);
    const command = JSON.parse(init!.body as string);
    expect(command.type).toBe("create");
    expect(command.draft.kind).toBe("Guardrail");
    if (!accepted) return Response.json({ error: { message: "Create request rejected" } }, { status: 422 });
    const snapshot = await (await original("/api/nmgr/workspace")).json();
    return Response.json({ ...snapshot, revision: 2, state: { ...snapshot.state, entities: [liveEntity(command.draft.id, "Guardrail", { ...command.draft, sourcePending: true, status: "DRAFT", deployed: null })] } });
  });
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: "New Guardrail" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Drawer submission" } });
  fireEvent.change(screen.getByLabelText("Control intent"), { target: { value: "Protect confidential content" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect((await within(screen.getByRole("dialog")).findByRole("alert")).textContent).toContain("Create request rejected");
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Drawer submission");
  expect(window.location.hash).toBe("#Profile/dashboard/");
  accepted = true;
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("heading", { name: "Drawer submission" })).toBeTruthy();
  expect(window.location.pathname).toBe("/v3/guardrails");
  expect(window.location.hash).toMatch(/^#Guardrail\/repository\/gr-/);
});
it("shows published profile configuration without simulating runtime modes or writing backend changes", async () => {
  const fetcher = serveWorkspace([liveEntity("released-control", "Guardrail"), liveEntity("released-profile", "Profile", { refs: ["released-control"], deployedRefs: ["released-control"] })]);
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: "Dashboard" }));
  fireEvent.click(screen.getByRole("button", { name: "View operations for released-profile" }));
  expect(screen.getByRole("button", { name: "Bypass" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Monitoring" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Preventing" }).hasAttribute("disabled")).toBe(true);
  expect(screen.queryByText("Monitoring ·")).toBeNull();
  expect(fetcher.mock.calls.some(([url]) => url === "/api/nmgr/commands")).toBe(false);
});
it.each(["NeMo", "F5"] as const)("shows the pinned %s Guardrail revision in published profile operations", async provider => {
  const original = liveEntity("control", "Guardrail", { name: "Approved original", provider });
  const second = { ...original, name: "Later release", version: 2, deployed: 2 };
  const draft = { ...second, name: "Unpublished rename", version: 3, status: "DRAFT" as const, revisions: { 1: original, 2: second } };
  const binding = (version: string): NmgrBinding => provider === "F5" ? { f5: { sourceId: "f5", scannerId: "remote-control", versionId: version } } : { policyId: "remote-control", publishedVersion: version };
  serveWorkspace([draft, liveEntity("profile", "Profile", { provider, refs: ["control"], deployedRefs: ["control"] })], "User", {
    "control@1": binding("v1"), "control@2": binding("v2"),
    "profile@1": { publishedRefs: { control: { policyId: "remote-control", policyVersion: "v1", enabledRuleIds: [], enabledRails: [] } } },
  });
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: "Dashboard" }));
  fireEvent.click(screen.getByRole("button", { name: "View operations for profile" }));
  expect(screen.getByRole("article", { name: "Approved original" })).toBeTruthy();
  expect(screen.queryByText("Later release")).toBeNull();
  expect(screen.queryByText("Unpublished rename")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "View Guardrail" }));
  expect(screen.getByRole("heading", { name: "Unpublished rename" })).toBeTruthy();
});
it.each(["NeMo", "F5"] as const)("shows newly published %s metadata before a historical snapshot exists", async provider => {
  serveWorkspace([liveEntity("control", "Guardrail", { name: "First release", provider }), liveEntity("profile", "Profile", { provider, refs: ["control"], deployedRefs: ["control"] })], "User", {
    "control@1": provider === "F5" ? { f5: { sourceId: "f5", scannerId: "remote-control", versionId: "v1" } } : { policyId: "remote-control", publishedVersion: "v1" },
    "profile@1": { publishedRefs: { control: { policyId: "remote-control", policyVersion: "v1", enabledRuleIds: [], enabledRails: [] } } },
  });
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: "Dashboard" }));
  fireEvent.click(screen.getByRole("button", { name: "View operations for profile" }));
  expect(screen.getByRole("article", { name: "First release" })).toBeTruthy();
  expect(screen.queryByText("Published metadata unavailable")).toBeNull();
});
it("filters and paginates real records instead of dropping all records into one table", async () => {
  serveWorkspace(Array.from({ length: 8 }, (_, i) => liveEntity(`control-${i}`, "Guardrail", { status: i === 7 ? "DRAFT" : "DEPLOYED", deployed: i === 7 ? null : 1 })));
  render(<NmgrMode />);
  await screen.findByRole("button", { name: "control-0" });
  expect(screen.queryByText("control-7", { selector: "button" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "control-7" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "DRAFT" } });
  expect(screen.getByText("Page 1 / 1")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "control-6" })).toBeNull();
});
it("uses the deployment queue and keeps the real release action in the detail", async () => {
  serveWorkspace([liveEntity("approved-control", "Guardrail", { status: "SIGNED OFF", deployed: null })], "IT Admin");
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: "Guardrail Deployment" }));
  expect(screen.getByRole("region", { name: "Guardrail Deployment" })).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "approved-control" }));
  expect(screen.getByRole("button", { name: "Release to NeMo" })).toBeTruthy();
  expect(screen.getByRole("list", { name: /Workflow:/ })).toBeTruthy();
});
it("enters the local workspace without asking for credentials or sending stored tokens", async () => {
  sessionStorage.setItem("marketplace-v2-token", "obsolete-token");
  const snapshot = { accessMode: "local", revision: 1, actor: { id: "u", name: "Configured Author", role: "User", unit: "ISS" }, state: { entities: [], audit: [] }, jobs: {}, bindings: {} };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    return url === "/api/marketplace-config?workspace=v3" ? Response.json({ mode: "live" }) : Response.json(snapshot);
  });
  vi.stubGlobal("fetch", fetcher); render(<NmgrMode />);
  expect(await screen.findByText("Configured Author")).toBeTruthy();
  expect(screen.queryByLabelText("Username")).toBeNull(); expect(screen.queryByLabelText("Password")).toBeNull();
  expect(screen.queryByLabelText("NeMo access token")).toBeNull();
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  expect(sessionStorage.getItem("marketplace-v2-token")).toBeNull();
  expect(screen.getByText(/Local test identity/)).toBeTruthy();
});
it("shows backend configuration errors without offering a credential form", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, _init?: RequestInit) => url === "/api/marketplace-config?workspace=v3" ? Response.json({ mode: "live" }) : Response.json({ error: { message: "Configure the NeMo username and password on the Marketplace server." } }, { status: 503 })));
  render(<NmgrMode />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry connection" })).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
  expect(screen.queryByLabelText("NeMo URL")).toBeNull();
});
it("actively queries backend status on click and shows missing resources without deleting the row", async () => {
  const snapshot = { revision: 2, actor: { id: "u", name: "Author", role: "User", unit: "ISS" }, state: { entities: [{ id: "control", name: "Existing control", provider: "NeMo", kind: "Guardrail", status: "TEST PASSED", version: 1, unit: "ISS", updated: "2026-10-21T00:00:00Z" }], audit: [] }, jobs: {}, bindings: {} };
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => url === "/api/marketplace-config?workspace=v3" ? Response.json({ mode: "live" }) : url.includes("?resource=") ? Response.json({ id: "control", revision: 2, status: "missing", message: "Not found in backend", checkedAt: "2026-10-21T00:01:00Z" }) : Response.json(snapshot));
  vi.stubGlobal("fetch", fetcher); render(<NmgrMode demo={<p>Demo</p>} />);
  expect(await screen.findByText("Existing control")).toBeTruthy();
  expect(fetcher.mock.calls.some(([url]) => url.includes("?resource="))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Refresh backend status" }));
  expect(await screen.findByText("Not found in backend")).toBeTruthy();
  expect(screen.getByText("Existing control")).toBeTruthy();
  expect(fetcher.mock.calls.some(([url]) => url === "/api/nmgr/workspace?resource=control")).toBe(true);
});
it("clears old observations on a failed refresh and rejects results from a different revision", async () => {
  const snapshot = { revision: 2, actor: { id: "u", name: "Author", role: "User", unit: "ISS" }, state: { entities: [{ id: "control", name: "Existing control", kind: "Guardrail", status: "TEST PASSED", version: 1, updated: "2026-10-21T00:00:00Z" }], audit: [] }, jobs: {}, bindings: {} };
  let mode = "ok";
  vi.stubGlobal("fetch", vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === "/api/marketplace-config?workspace=v3") return Response.json({ mode: "live" });
    if (url.includes("?resource=")) { if (mode === "fail") throw new Error("offline"); return Response.json({ id: "control", revision: mode === "stale" ? 3 : 2, status: "available", message: "Backend resource readable", checkedAt: "2026-10-21T00:01:00Z" }); }
    return Response.json(snapshot);
  }));
  render(<NmgrMode demo={<p>Demo</p>} />);
  fireEvent.click(await screen.findByRole("button", { name: "Refresh backend status" }));
  expect(await screen.findByText("Backend resource readable")).toBeTruthy();
  mode = "fail"; fireEvent.click(await screen.findByRole("button", { name: "Refresh backend status" }));
  expect(await screen.findByText(/api_unreachable.*Cannot reach the Marketplace API/)).toBeTruthy();
  expect(screen.queryByText("Backend resource readable")).toBeNull();
  mode = "stale"; fireEvent.click(await screen.findByRole("button", { name: "Refresh backend status" }));
  expect(await screen.findByText("Workspace changed during the query. Refresh backend status again.")).toBeTruthy();
  expect(screen.queryByText("Backend resource readable")).toBeNull();
});
it("fails closed when runtime configuration is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: 503 })));
  render(<NmgrMode demo={<p>Fabricated demo data</p>} />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("Fabricated demo data")).toBeNull();
});
it("never silently switches the real V2 entry to mock data", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ mode: "mock" })));
  render(<NmgrMode demo={<p>Fabricated demo data</p>} />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("Fabricated demo data")).toBeNull();
});
it("shows draft sync failures and lets the authorized author reconcile", async () => {
  const snapshot = { revision: 2, actor: { id: "u", name: "Author", role: "User", unit: "ISS" }, state: { entities: [{ id: "control", name: "Unsynced control", provider: "NeMo", kind: "Guardrail", status: "DRAFT", version: 1, unit: "ISS", runs: [], refs: [], updated: "2026-10-21T00:00:00Z" }], audit: [] }, jobs: { control: { actor: "u", canResume: true, purpose: "draft-sync", status: "uncertain", phase: "sync-profile-save", message: "Response lost" } }, bindings: {} };
  vi.stubGlobal("fetch", vi.fn(async (url: string, _init?: RequestInit) => url === "/api/marketplace-config?workspace=v3" ? Response.json({ mode: "live" }) : Response.json(snapshot)));
  render(<NmgrMode demo={<p>Demo</p>} />);
  fireEvent.click(await screen.findByText("Unsynced control"));
  expect(await screen.findByText("NeMo draft sync: outcome needs verification")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reconcile with NeMo" })).toBeTruthy();
  expect(screen.getByLabelText("Remote resource ID")).toBeTruthy();
});
it.each(["Guardrail", "Profile"] as const)("creates %s with a hidden stable ID and retains the form when a save is rejected", async kind => {
  localStorage.setItem("nmgr-owner", "IT Admin");
  window.history.replaceState(null, "", "/v3/guardrails?role=tech");
  const snapshot = { revision: 3, actor: { id: "real-author", name: "Real author", role: "User", unit: "RMG" }, state: { entities: [], audit: [] }, jobs: {}, bindings: {} };
  let sent: any;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/marketplace-config?workspace=v3") return Response.json({ mode: "live" });
    if (url === "/api/nmgr/commands") { sent = JSON.parse(init!.body as string); return Response.json({ error: { message: "Workspace changed. Review before retrying." } }, { status: 409 }); }
    return Response.json(snapshot);
  }));
  render(<NmgrMode demo={<p>Fabricated demo data</p>} />);
  expect(await screen.findByText("Real author")).toBeTruthy();
  expect((screen.getByLabelText("Workbench") as HTMLSelectElement).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Guardrail Deployment" })).toBeNull();
  if (kind === "Profile") fireEvent.click(screen.getByRole("button", { name: "Configure Profiles" }));
  fireEvent.click(screen.getByRole("button", { name: `Create ${kind}` }));
  expect(screen.queryByLabelText("ID")).toBeNull();
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New control" } });
  fireEvent.change(screen.getByLabelText(kind === "Guardrail" ? "Control intent" : "Use case"), { target: { value: "Block secrets" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Workspace changed"));
  expect(screen.getByLabelText("Name")).toBeTruthy();
  expect(sent.expectedRevision).toBe(3);
  const firstId = sent.draft.id;
  expect(firstId).toMatch(new RegExp(`^${kind === "Guardrail" ? "gr" : "pf"}-[0-9a-f-]{36}$`));
  expect(firstId).toMatch(/^[a-z][a-z0-9-]{2,63}$/);
  const firstRequest = sent.requestId;
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Corrected name" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  await waitFor(() => expect(sent.requestId).not.toBe(firstRequest));
  expect(sent.draft.id).toBe(firstId);
  expect(sent.draft.status).toBeUndefined(); expect(sent.role).toBeUndefined();
  expect(screen.queryByText("Fabricated demo data")).toBeNull();
});
it("lets Tech correct a definitely rejected draft configuration", async () => {
  const snapshot = { revision: 2, actor: { id: "tech", name: "Tech", role: "IT Admin", unit: "ISS" }, state: { entities: [{ id: "control", name: "Rejected control", provider: "NeMo", kind: "Guardrail", status: "DRAFT", version: 1, unit: "ISS", runs: [], refs: [], updated: "2026-10-21T00:00:00Z" }], audit: [] }, jobs: { control: { actor: "tech", canResume: true, canCorrect: true, purpose: "draft-sync", status: "failed", phase: "sync-policy-save" } }, bindings: {} };
  vi.stubGlobal("fetch", vi.fn(async (url: string, _init?: RequestInit) => url === "/api/marketplace-config?workspace=v3" ? Response.json({ mode: "live" }) : Response.json(snapshot)));
  render(<NmgrMode />);
  fireEvent.click(await screen.findByText("Rejected control"));
  expect(await screen.findByRole("button", { name: "Save implementation" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Run evaluation" })).toBeNull();
});
it("requires Tech to choose a configured Source before saving implementation", async () => {
  let sent: any;
  const snapshot = { revision: 1, sources: ["NeMo", "F5"], actor: { id: "tech", name: "Engineer", role: "IT Admin", unit: "ISS" }, state: { entities: [liveEntity("pending-control", "Guardrail", { deployed: null, status: "DRAFT", sourcePending: true })], audit: [] }, jobs: {}, bindings: {} };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/marketplace-config?workspace=v3") return Response.json({ mode: "live" });
    if (url === "/api/nmgr/commands") { sent = JSON.parse(init!.body as string); return Response.json({ error: { message: "test conflict" } }, { status: 409 }); }
    return Response.json(snapshot);
  }));
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: "pending-control" }));
  expect(screen.getByRole("button", { name: "Save implementation" }).hasAttribute("disabled")).toBe(true);
  fireEvent.change(screen.getByLabelText("Source"), { target: { value: "F5" } });
  fireEvent.click(screen.getByRole("button", { name: "Save implementation" }));
  await waitFor(() => expect(sent?.provider).toBe("F5"));
  expect(sent.action).toBe("implement");
});
it("explains NeMo custom JSON and prevents natural-language synchronization without losing the input", async () => {
  const fetcher = serveWorkspace([liveEntity("custom-control", "Guardrail", { deployed: null, status: "DRAFT" })], "IT Admin");
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: "custom-control" }));
  const editor = screen.getByRole("textbox", { name: "NeMo Policy JSON" });
  expect(screen.queryByRole("textbox", { name: /LLM prompt/ })).toBeNull();
  expect(screen.queryByLabelText("Direction")).toBeNull();
  fireEvent.change(editor, { target: { value: "Block private customer information" } });
  expect(screen.getByRole("button", { name: "Save implementation" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain("valid NeMo Policy JSON");
  fireEvent.click(screen.getByRole("button", { name: "Save implementation" }));
  expect(fetcher.mock.calls.some(([url]) => url === "/api/nmgr/commands")).toBe(false);
  expect((editor as HTMLTextAreaElement).value).toBe("Block private customer information");
  const definition = JSON.stringify({ schema_version: 1, kind: "Policy", rules: [{ id: "control" }], tests: [] });
  fireEvent.change(editor, { target: { value: definition } });
  expect(screen.getByRole("button", { name: "Save implementation" }).hasAttribute("disabled")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Save implementation" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/nmgr/commands")).toBe(true));
  const call = fetcher.mock.calls.find(([url]) => url === "/api/nmgr/commands")!;
  expect(JSON.parse(call[1]!.body as string).config.content).toBe(definition);
});
it("keeps F5 GenAI prompts while switching the provider-specific custom editor", async () => {
  const snapshot = { revision: 1, sources: ["NeMo", "F5"], actor: { id: "tech", name: "Tech", role: "IT Admin", unit: "ISS" }, state: { entities: [liveEntity("source-control", "Guardrail", { deployed: null, status: "DRAFT", sourcePending: true })], audit: [] }, jobs: {}, bindings: {} };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url === "/api/marketplace-config?workspace=v3" ? { mode: "live" } : snapshot)));
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: "source-control" }));
  fireEvent.change(screen.getByLabelText("Source"), { target: { value: "F5" } });
  fireEvent.change(screen.getByRole("textbox", { name: /LLM prompt/ }), { target: { value: "Block secrets" } });
  expect(screen.getByRole("button", { name: "Save implementation" }).hasAttribute("disabled")).toBe(false);
  fireEvent.change(screen.getByLabelText("Source"), { target: { value: "NeMo" } });
  expect((screen.getByRole("textbox", { name: "NeMo Policy JSON" }) as HTMLTextAreaElement).value).toBe("Block secrets");
  expect(screen.getByRole("button", { name: "Save implementation" }).hasAttribute("disabled")).toBe(true);
  fireEvent.change(screen.getByLabelText("Source"), { target: { value: "F5" } });
  expect(screen.getByRole("button", { name: "Save implementation" }).hasAttribute("disabled")).toBe(false);
});
it("labels a saved NeMo custom definition as Policy JSON instead of an LLM prompt", async () => {
  serveWorkspace([liveEntity("saved-custom", "Guardrail", { deployed: null, status: "TEST READY", config: { scannerType: "custom", content: '{"kind":"Policy"}', direction: "request", versionName: "v1", versionDescription: "" } })], "IT Admin");
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: "saved-custom" }));
  expect(screen.getByRole("heading", { name: "NeMo Policy JSON" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "LLM prompt" })).toBeNull();
  expect(screen.getByText("Custom Policy (JSON)")).toBeTruthy();
  expect(screen.getByText("Defined by Policy rule stages")).toBeTruthy();
});
it("keeps source selection out of User requests even when F5 is configured", async () => {
  let sent: any;
  const snapshot = { revision: 1, sources: ["NeMo", "F5"], actor: { id: "author", name: "Author", role: "User", unit: "ISS" }, state: { entities: [], audit: [] }, jobs: {}, bindings: {} };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/marketplace-config?workspace=v3") return Response.json({ mode: "live" });
    if (url === "/api/nmgr/commands") { sent = JSON.parse(init!.body as string); return Response.json({ error: { message: "test conflict" } }, { status: 409 }); }
    return Response.json(snapshot);
  }));
  render(<NmgrMode demo={<p>Demo</p>} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create Guardrail" }));
  expect(screen.queryByLabelText("Source")).toBeNull();
  expect(screen.queryByLabelText("ID")).toBeNull();
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "F5 control" } });
  fireEvent.change(screen.getByLabelText("Control intent"), { target: { value: "Block secrets" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  await waitFor(() => expect(sent?.draft).toBeTruthy()); expect(sent.draft).not.toHaveProperty("provider");
});

it("shows an F5 configuration error with a trace reference while keeping NeMo usable", async () => {
  const fetcher = serveWorkspace([liveEntity("nemo-policy", "Guardrail")]);
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (url, init) => {
    const response = await original(url, init);
    if (url !== "/api/nmgr/workspace") return response;
    return Response.json({ ...await response.json(), sourceErrors: { F5: { code: "f5_config_invalid", message: "Check F5 URL and Token", requestId: "f5-reference" } } });
  });
  render(<NmgrMode />);
  expect(await screen.findByRole("button", { name: "nemo-policy" })).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("f5-reference");
  fireEvent.click(screen.getByRole("button", { name: "Create Guardrail" }));
  expect(screen.getByLabelText("Name")).toBeTruthy();
});

it.each([false, true])("retries an F5-only revision conflict only if NeMo state is unchanged (changed=%s)", async changed => {
  const entity = liveEntity("nemo-control", "Guardrail", { status: "DRAFT", deployed: null });
  const base = { revision: 1, sources: ["NeMo", "F5"], actor: { id: "u", name: "Author", role: "User", unit: "ISS" }, state: { entities: [entity], audit: [] }, jobs: {}, bindings: {} };
  let attempts = 0;
  const latest = { ...base, revision: 2, state: { ...base.state, entities: changed ? [{ ...entity, name: "Changed remotely" }] : base.state.entities } };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/marketplace-config?workspace=v3") return Response.json({ mode: "live" });
    if (url === "/api/nmgr/commands") {
      attempts++;
      if (attempts === 1) return Response.json({ error: { code: "workspace_revision_changed", message: "Workspace changed" } }, { status: 409 });
      expect(JSON.parse(init!.body as string).expectedRevision).toBe(2);
      return Response.json({ ...latest, revision: 3 });
    }
    return Response.json(attempts ? latest : base);
  }));
  render(<NmgrMode />);
  fireEvent.click(await screen.findByRole("button", { name: "Create Guardrail" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New NeMo control" } });
  fireEvent.change(screen.getByLabelText("Control intent"), { target: { value: "Block secrets" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  if (changed) {
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Workspace changed"));
    expect(attempts).toBe(1);
  } else await waitFor(() => expect(attempts).toBe(2));
});
