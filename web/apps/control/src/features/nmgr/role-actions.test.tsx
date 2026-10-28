/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  act,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DemoNmgrApp as NmgrApp } from "./app";
import { seed, type Role, type Kind, type Status } from "./model";
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/guardrails");
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
  vi.useRealTimers();
});
function openDetail(
  role: Role,
  kind: Kind,
  status: Status,
  view = "repository",
) {
  const state = seed();
  const item = state.entities.find((e) => e.kind === kind)!;
  item.unit = "ISS";
  item.status = status;
  if (status === "DRAFT") item.runs = [];
  localStorage.setItem("nmgr-v2-mock-state", JSON.stringify(state));
  localStorage.setItem("nmgr-v2-mock-owner", role);
  window.location.hash = `${kind}/${view}/${item.id}`;
  render(<NmgrApp />);
  return item;
}
it("opens User dashboard by default and switches entire workbenches", () => {
  render(<NmgrApp />);
  expect(
    screen.getByRole("heading", { name: "Protection Dashboard" }),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Workbench"), {
    target: { value: "User Admin" },
  });
  expect(screen.getByRole("button", { name: "Guardrail Signoff" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Control Intents" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Workbench"), {
    target: { value: "IT Admin" },
  });
  expect(
    screen.getByRole("heading", { name: "Guardrail Requests", level: 1 }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Guardrail Deployment" }),
  ).toBeTruthy();
});
it("shows User test records in a drawer and requests approval from there", () => {
  openDetail("User", "Guardrail", "TEST PASSED");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "Run Evaluation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Evaluation" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Review results" }));
  expect(
    screen.getByRole("heading", { name: "Guardrail Results" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Results for / }));
  expect(screen.getByRole("table", { name: "Benchmark Results" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Request Signoff" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(screen.getByText(/signoff request submitted/)).toBeTruthy();
  expect(
    JSON.parse(localStorage.getItem("nmgr-v2-mock-state")!).entities.some(
      (e: { status: string }) => e.status === "SIGNOFF REQUESTED",
    ),
  ).toBe(true);
});
it.each(["sidebar", "history", "workbench"])("clears page notifications after %s navigation", (navigation) => {
  const item = openDetail("User", "Profile", "DRAFT");
  fireEvent.click(screen.getByRole("button", { name: "Request Signoff" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(screen.getByText(/signoff request submitted/)).toBeTruthy();
  if (navigation === "sidebar") {
    fireEvent.click(screen.getByRole("button", { name: "Control Intents" }));
  } else if (navigation === "workbench") {
    fireEvent.change(screen.getByLabelText("Workbench"), { target: { value: "User Admin" } });
  } else {
    act(() => {
      window.history.replaceState(null, "", "#Profile/dashboard/");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
  }
  expect(screen.queryByText(/signoff request submitted/)).toBeNull();
  act(() => {
    window.history.replaceState(null, "", `#Profile/repository/${item.id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(screen.queryByText(/signoff request submitted/)).toBeNull();
});
it("lets approvers review tests on the page and approve without deploying", () => {
  openDetail("User Admin", "Guardrail", "SIGNOFF REQUESTED", "signoff");
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Evaluation" }));
  expect(within(screen.getByRole("table", { name: "Evaluation Records" })).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Evaluation / Version", "Result"]);
  expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Results for / }));
  expect(screen.getByRole("table", { name: "Benchmark Results" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(
    screen.getByText(/ready for Tech Implementor deployment/),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Go Deploy" })).toBeNull();
});
it.each(["repository", "tests"])("lets Tech expand benchmark results from %s", (view) => {
  openDetail("IT Admin", "Guardrail", "TEST PASSED", view);
  if (view === "repository") fireEvent.click(screen.getByRole("button", { name: "Evaluation" }));
  expect(screen.queryByRole("table", { name: "Benchmark Results" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Results for / }));
  expect(screen.getByRole("table", { name: "Benchmark Results" })).toBeTruthy();
});
it("requests Profile approval directly without Tests or Deploy", () => {
  openDetail("User", "Profile", "DRAFT");
  expect(screen.getByRole("button", { name: "Request Signoff" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Evaluation" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Request Signoff" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(screen.getByText(/signoff request submitted/)).toBeTruthy();
});
it("allows only technical workbench to deploy signed Guardrails", () => {
  openDetail("IT Admin", "Guardrail", "SIGNED OFF", "deploy");
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Go Deploy",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(screen.getByText(/deployed successfully/)).toBeTruthy();
});
it.each(["Guardrail", "Profile"] as Kind[])("opens %s repository details through the name without an Action column", (kind) => {
  const state = seed();
  const item = state.entities.find((entity) => entity.kind === kind)!;
  item.unit = "ISS";
  localStorage.setItem("nmgr-v2-mock-state", JSON.stringify(state));
  localStorage.setItem("nmgr-v2-mock-owner", "User");
  window.location.hash = `${kind}/repository/`;
  render(<NmgrApp />);
  expect(screen.queryByRole("columnheader", { name: "Action" })).toBeNull();
  expect(screen.queryByRole("button", { name: "View" })).toBeNull();
  const link = screen.getByRole("link", { name: item.name });
  expect(document.body.textContent).not.toContain(item.id);
  expect(link.getAttribute("href")).toBe(`#${kind}/repository/${item.id}`);
  fireEvent.click(link);
  expect(screen.getByRole("heading", { name: `${kind} Details` })).toBeTruthy();
  expect(document.body.textContent).not.toContain(item.id);
});
it("keeps uploaded datasets usable with English file-picker text and no visible entity ID", async () => {
  const item = openDetail("IT Admin", "Guardrail", "TEST READY", "tests");
  fireEvent.click(screen.getByRole("button", { name: "Run Evaluation" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByText("Choose File")).toBeTruthy();
  expect(dialog.getByText("No file chosen")).toBeTruthy();
  expect(screen.getByRole("dialog").textContent).not.toContain(item.id);
  await act(async () => {
    fireEvent.change(dialog.getByLabelText("Upload Custom Dataset (JSON Array of Cases)"), {
      target: { files: [{ name: "acceptance.json", size: 100, text: async () => JSON.stringify([{ input: "Hello", expected: "Pass" }]) }] },
    });
  });
  expect(dialog.getByText("acceptance.json")).toBeTruthy();
  expect(dialog.getByText("1 acceptance cases")).toBeTruthy();
});
it("creates a Profile with an automatic ID and the simplified fields", () => {
  const state = seed();
  const guard = state.entities.find((entity) => entity.kind === "Guardrail" && entity.deployed !== null)!;
  guard.mandatory = true;
  guard.location = "ALL";
  localStorage.setItem("nmgr-v2-mock-state", JSON.stringify(state));
  window.location.hash = "Profile/repository/";
  render(<NmgrApp />);
  fireEvent.click(screen.getByRole("button", { name: "New Profile" }));
  const form = within(screen.getByRole("dialog"));
  expect(form.queryByLabelText("Profile ID (unique)")).toBeNull();
  expect(form.queryByText("Custodian")).toBeNull();
  expect(form.getByLabelText("Location")).toBeTruthy();
  expect(form.getByRole("region", { name: "Available Guardrails" })).toBeTruthy();
  fireEvent.change(form.getByLabelText("Profile Name"), { target: { value: "Auto ID profile" } });
  fireEvent.change(form.getByLabelText("Use Case"), { target: { value: "Protect customer requests" } });
  fireEvent.change(form.getByLabelText("Alert Metric"), { target: { value: "Pass Rate" } });
  fireEvent.change(form.getByLabelText("Alert Threshold (%)"), { target: { value: "25" } });
  fireEvent.change(form.getByLabelText("Alert Window (Minutes)"), { target: { value: "3" } });
  fireEvent.click(form.getByRole("button", { name: "Submit" }));
  expect(screen.getByRole("heading", { name: "Profile Details" })).toBeTruthy();
  expect(window.location.hash).toMatch(/^#Profile\/repository\/pf-[0-9a-f-]{36}$/);
  expect(screen.getByText("Pass Rate > 25% in 3 minutes")).toBeTruthy();
});

it("configures a new Guardrail using Control Intent and scanner content without a Requirement field", () => {
  const state = seed(), item = state.entities.find((item) => item.kind === "Guardrail")!;
  item.status = "DRAFT";
  item.policies = [];
  item.runs = [];
  localStorage.setItem("nmgr-v2-mock-state", JSON.stringify(state));
  localStorage.setItem("nmgr-v2-mock-owner", "IT Admin");
  window.location.hash = `Guardrail/repository/${item.id}`;
  render(<NmgrApp />);
  fireEvent.click(screen.getByRole("button", { name: "Configure" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.queryByLabelText("Requirement")).toBeNull();
  expect(dialog.getByRole("heading", { name: "Control Intent" })).toBeTruthy();
  expect(dialog.getByText(item.description)).toBeTruthy();
  fireEvent.change(dialog.getByLabelText("Guardrail provider"), { target: { value: "F5" } });
  fireEvent.click(dialog.getByRole("button", { name: "Confirm" }));
  const saved = JSON.parse(localStorage.getItem("nmgr-v2-mock-state")!);
  expect(saved.entities.find((entry: { id: string }) => entry.id === item.id)).toMatchObject({ status: "TEST READY", policies: [item.description], provider: "F5" });
});
it("keeps Trace content blank while retaining its navigation and title", () => {
  window.location.hash = "Profile/audit/";
  render(<NmgrApp />);
  expect(screen.getByRole("heading", { name: "Trace", level: 1 })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Trace" })).toBeTruthy();
  expect(screen.getByRole("main").textContent).toBe("");
  expect(screen.queryByRole("table")).toBeNull();
});
it("shows the shared enforcement list on the dashboard", () => {
  render(<NmgrApp />);
  expect(screen.queryByRole("button", { name: /Show Info alerts/ })).toBeNull();
  expect(screen.queryByText("Policy detection recorded")).toBeNull();
  expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Profile", "Mode", "Ctrl Unit", "Last Modified", "Action"]);
  expect(screen.getByRole("table", { name: "Enforce & Prevent" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Enforce & Prevent" })).toBeNull();
  expect(screen.queryByText("SLO Breach Alert")).toBeNull();
});
it("bypasses a Dashboard Profile and resumes the same configuration in Monitoring", async () => {
  render(<NmgrApp />);
  const open = "View operations for Customer Banking Assistant";
  fireEvent.click(screen.getByRole("button", { name: open }));
  expect(screen.getByRole("dialog", { name: "Customer Banking Assistant" })).toBeTruthy();
  expect(screen.queryByLabelText("Profile scan summary")).toBeNull();
  expect(screen.getAllByLabelText("Guardrail provider").every((badge) => ["NeMo", "F5"].includes(badge.textContent!))).toBe(true);
  expect(within(screen.getByRole("dialog", { name: "Customer Banking Assistant" })).queryByRole("table")).toBeNull();
  expect(screen.getByRole("article", { name: "Customer-Facing Banking Assistant Restrictions" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Bypass" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm bypass" })); });
  const saved = () => JSON.parse(localStorage.getItem("nmgr-v2-mock-state")!).entities.find((item: { id: string }) => item.id === "default-customer-assistant");
  expect(saved().runtime.bypass).toBe(true);
  expect(saved().mode).toBe("Pass all");
  act(() => {
    window.location.hash = "Profile/enforce/";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  fireEvent.click(screen.getByRole("button", { name: open }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Resume monitoring" })); });
  expect(saved().runtime.bypass).toBe(false);
  expect(Object.values(saved().runtime.modes).every((mode) => mode === "monitoring")).toBe(true);
  fireEvent.click(within(screen.getByRole("dialog", { name: "Customer Banking Assistant" })).getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
  await waitFor(() => expect(within(screen.getByRole("table", { name: "Enforce & Prevent" })).getByText("Monitoring")).toBeTruthy());
});

it("submits Dashboard mode changes for approval and lets the Approver apply them", async () => {
  const state = seed(), profile = state.entities.find((item) => item.id === "default-customer-assistant")!;
  const guard = state.entities.find((item) => item.id === profile.deployedRefs[0])!;
  render(<NmgrApp />);
  fireEvent.click(screen.getByRole("button", { name: `View operations for ${profile.name}` }));
  await act(async () => { fireEvent.keyDown(screen.getByRole("button", { name: `Actions for ${guard.name}` }), { key: "ArrowDown" }); });
  await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "Switch to Monitoring" })); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Submit for approval" })); });
  const saved = () => JSON.parse(localStorage.getItem("nmgr-v2-mock-state")!).entities.find((item: { id: string }) => item.id === profile.id);
  expect(saved().runtime.approval).toBe("pending");
  expect(screen.queryByRole("button", { name: "Approve Profile" })).toBeNull();
  fireEvent.click(within(screen.getByRole("dialog", { name: profile.name })).getByRole("button", { name: "Close" }));
  fireEvent.change(screen.getByLabelText("Workbench"), { target: { value: "User Admin" } });
  fireEvent.click(screen.getByRole("button", { name: `View operations for ${profile.name}` }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Approve Profile" })); });
  expect(saved().runtime.approval).toBe("approved");
  expect(saved().runtime.modes[guard.id]).toBe("monitoring");
});

it("adds live Dashboard logs on each traffic tick and pauses them during Bypass", async () => {
  vi.useFakeTimers();
  render(<NmgrApp />);
  fireEvent.click(screen.getByRole("button", { name: "View operations for Customer Banking Assistant" }));
  const saved = () => JSON.parse(localStorage.getItem("nmgr-v2-mock-state")!).entities.find((item: { id: string }) => item.id === "default-customer-assistant");
  await act(async () => { vi.advanceTimersByTime(6000); });
  const count = saved().runtime.events.length;
  await act(async () => { vi.advanceTimersByTime(6000); });
  expect(saved().runtime.events.length).toBeGreaterThan(count);
  fireEvent.click(screen.getByRole("button", { name: "Bypass" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Confirm bypass" })); });
  const bypassed = saved().runtime.events.length;
  await act(async () => { vi.advanceTimersByTime(10000); });
  expect(saved().runtime.events.length).toBe(bypassed);
});
it("validates full-page requests and keeps success feedback until dismissed", async () => {
  render(<NmgrApp />);
  fireEvent.click(screen.getByRole("button", { name: "New Guardrail" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(screen.getByRole("alert").textContent).toContain("required");
  fireEvent.change(screen.getByLabelText("Guardrail Name"), {
    target: { value: "Example protection" },
  });
  expect(screen.queryByLabelText("Guardrail ID (unique)")).toBeNull();
  expect(screen.queryByText("Custodian")).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Control Intent" }), {
    target: { value: "Protect personal information" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(screen.getByText(/Request submitted!/)).toBeTruthy();
  vi.useFakeTimers();
  await act(async () => {
    vi.advanceTimersByTime(6000);
  });
  expect(screen.getByText(/Request submitted!/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Guardrail Details/ }));
  expect(
    screen.getByRole("heading", { name: "Guardrail Details" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Dismiss notification" })).toBeNull();
  expect(screen.queryByText(/Request submitted!/)).toBeNull();
});
it.each(["RMG", "LCS", "Line 1.5", "Line 2"])("submits a new Guardrail to the selected %s Control Unit", (unit) => {
  window.location.hash = "Guardrail/request/";
  render(<NmgrApp />);
  const controlUnit = screen.getByRole("combobox", { name: "Control Unit" });
  expect(within(controlUnit).getAllByRole("option").map((option) => option.textContent)).toEqual(["ISS", "RMG", "LCS", "Line 1.5", "Line 2"]);
  fireEvent.change(controlUnit, { target: { value: unit } });
  fireEvent.change(screen.getByLabelText("Guardrail Name"), { target: { value: "Selected unit request" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Control Intent" }), { target: { value: "Protect customer information" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  const saved = JSON.parse(localStorage.getItem("nmgr-v2-mock-state")!);
  expect(saved.entities.find((item: { name: string }) => item.name === "Selected unit request").unit).toBe(unit);
  expect(screen.getByText(/Request submitted!/).textContent).toContain(unit);
  expect(screen.queryByRole("button", { name: /Guardrail Details/ })).toBeNull();
});
it("does not expose another department via a detail URL", () => {
  const state = seed();
  const item = state.entities[0]!;
  item.unit = "RMG";
  item.name = "Other department secret";
  localStorage.setItem("nmgr-v2-mock-state", JSON.stringify(state));
  window.location.hash = `Guardrail/repository/${item.id}`;
  render(<NmgrApp />);
  expect(screen.queryByText("Other department secret")).toBeNull();
});

it.each([
  ["User", "Guardrail/repository/"], ["User", "Profile/repository/"],
  ["User Admin", "Guardrail/signoff/"], ["User Admin", "Profile/signoff/"],
  ["IT Admin", "Guardrail/repository/"], ["IT Admin", "Guardrail/tests/"], ["IT Admin", "Guardrail/deploy/"],
] as const)("always exposes fixed Ctrl Unit filters for %s at %s", (role, route) => {
  localStorage.setItem("nmgr-v2-mock-owner", role);
  window.location.hash = route;
  render(<NmgrApp />);
  const units = within(screen.getByRole("group", { name: "Control unit" }));
  for (const name of ["ISS", "RMG", "LCS", "Line 1.5", "Line 2"]) expect(units.getByRole("checkbox", { name })).toBeTruthy();
});

it.each(["User", "User Admin", "IT Admin"] as const)("exposes dashboard Control Unit options for %s without relying on records", (role) => {
  localStorage.setItem("nmgr-v2-mock-owner", role);
  window.location.hash = "Profile/dashboard/";
  render(<NmgrApp />);
  const units = within(screen.getByRole("combobox", { name: "Control Unit" }));
  expect(units.getAllByRole("option").map((option) => option.textContent)).toEqual(["All", "ISS", "RMG", "LCS", "Line 1.5", "Line 2"]);
});

it("filters the signoff history alongside the queue without broadening departmental scope", () => {
  localStorage.setItem("nmgr-v2-mock-owner", "User Admin");
  window.location.hash = "Guardrail/signoff/";
  render(<NmgrApp />);
  fireEvent.click(screen.getByText("Operation History"));
  const history = screen.getByRole("table", { name: "Guardrail sign-off history" });
  expect(within(history).getAllByRole("row").length).toBeGreaterThan(1);
  fireEvent.click(within(screen.getByRole("group", { name: "Control unit" })).getByRole("checkbox", { name: "Line 2" }));
  expect(within(history).getAllByRole("row")).toHaveLength(1);
  expect(screen.getByText("No sign-offs yet.")).toBeTruthy();
});

it("uses title and arrow links to open the same signoff details", () => {
  const state = seed(), item = state.entities.find((item) => item.kind === "Guardrail")!;
  item.status = "SIGNOFF REQUESTED";
  localStorage.setItem("nmgr-v2-mock-state", JSON.stringify(state));
  localStorage.setItem("nmgr-v2-mock-owner", "User Admin");
  window.location.hash = "Guardrail/signoff/";
  render(<NmgrApp />);
  const queue = within(screen.getAllByRole("table")[0]!);
  const title = queue.getByRole("link", { name: item.name });
  const arrow = queue.getByRole("link", { name: `View ${item.name}` });
  expect(title.getAttribute("href")).toBe(arrow.getAttribute("href"));
  fireEvent.click(arrow);
  expect(window.location.hash).toBe(`#Guardrail/signoff/${item.id}`);
  expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
});

it("resets technical department filters when switching to a Control Unit workbench", () => {
  localStorage.setItem("nmgr-v2-mock-owner", "IT Admin");
  render(<NmgrApp />);
  fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
  fireEvent.change(screen.getByLabelText("Control Unit"), {
    target: { value: "RMG" },
  });
  expect(screen.getByText("No matching records.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Workbench"), {
    target: { value: "User" },
  });
  expect(screen.queryByText("No matching records.")).toBeNull();
});
