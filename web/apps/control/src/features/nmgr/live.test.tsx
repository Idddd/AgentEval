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
  const fetcher = vi.fn(async (url: string) => url === "/api/marketplace-config?workspace=v3" ? Response.json({ mode: "live" }) : Response.json(snapshot));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
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
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/marketplace-config?workspace=v3" ? Response.json({ mode: "live" }) : Response.json({ error: { message: "Configure the NeMo username and password on the Marketplace server." } }, { status: 503 })));
  render(<NmgrMode />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry connection" })).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
});
it("actively queries backend status on click and shows missing resources without deleting the row", async () => {
  const snapshot = { revision: 2, actor: { id: "u", name: "Author", role: "User", unit: "ISS" }, state: { entities: [{ id: "control", name: "Existing control", provider: "NeMo", kind: "Guardrail", status: "TEST PASSED", version: 1, unit: "ISS", updated: "2026-10-21T00:00:00Z" }], audit: [] }, jobs: {}, bindings: {} };
  const fetcher = vi.fn(async (url: string) => url === "/api/marketplace-config?workspace=v3" ? Response.json({ mode: "live" }) : url.includes("?resource=") ? Response.json({ id: "control", revision: 2, status: "missing", message: "Not found in backend", checkedAt: "2026-10-21T00:01:00Z" }) : Response.json(snapshot));
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
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
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
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/marketplace-config?workspace=v3" ? Response.json({ mode: "live" }) : Response.json(snapshot)));
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
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/marketplace-config?workspace=v3" ? Response.json({ mode: "live" }) : Response.json(snapshot)));
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
