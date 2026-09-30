/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import userEvent from '@testing-library/user-event';
import { GuardrailDetails } from "./guardrail-detail";
import { BusinessDemoProvider } from "./provider";
import { saveEntity, seedEntities, STORAGE_KEY } from "./model";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
async function selectMode(value:'monitoring'|'active') {
 await userEvent.click(screen.getByRole('button',{name:/Actions for/}));
 const menu = screen.getByRole('menu');
 expect(within(menu).getByText('Current')).toBeTruthy();
 await userEvent.click(within(menu).getByRole('menuitem',{name:value==='active'?'Switch to Preventing':'Switch to Monitoring'}));
}
const show = (id = "customer-interaction") => {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? JSON.stringify({version: 3, items: seedEntities()}));
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, statusDemosVersion: 1, failureDemoVersion: 1, balancedStatusesVersion: 1 }));
  const result = render(
    <BusinessDemoProvider
      config={{ mode: "mock", sourceId: "mock", policyAuthoring: true }}
    >
      <GuardrailDetails id={id} />
    </BusinessDemoProvider>,
  );
  const config = screen.queryByRole("button", { name: "Configuration" });
  if(config) fireEvent.click(config);
  return result;
};

it('locks mandatory guardrail removal and deselection',()=>{
 const items=seedEntities();
 const profile=items.find(p=>p.id==='customer-interaction')!;
 const policyId=profile.policies[0]!.policyId;
 localStorage.setItem(STORAGE_KEY,JSON.stringify({version:3,items:items.map(p=>p.id===profile.id?{...p,status:'Ready',location:'SG'}:p.id===policyId?{...p,mandatory:true,mandatoryLocations:['SG']}:p)}));
 show();
 const ref=profile.policies[0]!;
 expect((screen.getByRole('button',{name:`Remove ${ref.name}`}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:`Edit ${ref.name}`}));
 const required=screen.getByRole('checkbox',{name:new RegExp(ref.name)}) as HTMLInputElement;
 expect(required.checked).toBe(true);expect(required.disabled).toBe(true);
});

it("approves the whole profile after the final mode selection", async()=>{
 show();
 fireEvent.click(screen.getByRole("button",{name:"Overview & activity"}));
 await selectMode('monitoring');
 await selectMode('active');
 expect((screen.getByRole("button",{name:"Submit for approval"}) as HTMLButtonElement).disabled).toBe(true);
 await selectMode('monitoring');
 await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Submit for approval"}))});
 const read=()=>JSON.parse(localStorage.getItem(STORAGE_KEY)!).items.find((x:{id:string})=>x.id==="customer-interaction");
 expect(read().status).toBe("Active");
 expect(read().runtime.approval).toBe("pending");
 expect(screen.getByLabelText("Profile approval configuration")).toBeTruthy();
 await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Approve Profile"}))});
 expect(read().status).toBe("Ready");
 expect(read().runtime.approval).toBe("approved");
});
it("unlocks configuration after the entire Monitoring configuration is approved",async()=>{
 show();expect(screen.queryByRole("button",{name:"Edit Name"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Overview & activity"}));
 await selectMode('monitoring');
 await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Submit for approval"}))});
 await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Approve Profile"}))});
 fireEvent.click(screen.getByRole("button",{name:"Configuration"}));
 expect(screen.getByRole("button",{name:"Edit Name"})).toBeTruthy();
});

it("opens a full detail page with policy versions, status and actions", () => {
  show();
  expect(screen.getByRole('region',{name:'Profile use case'}).textContent).toContain('Customer-facing conversations');
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

it("opens the Guardrail picker from the row edit action",()=>{
 localStorage.setItem(STORAGE_KEY,JSON.stringify({version:2,items:seedEntities().map(x=>x.id==="customer-interaction"?{...x,status:"Ready"}:x)}));
 show();fireEvent.click(screen.getByRole("button",{name:"Edit Customer Interaction rules"}));
 expect(screen.getByRole("combobox",{name:"Version for Customer Interaction rules"})).toBeTruthy();
 expect(screen.queryByRole("dialog")).toBeNull();
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
  expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
  expect(screen.getByText("Processing")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Customer Interaction rules" }),
  );
  expect(within(screen.getByRole("dialog")).queryByRole("textbox")).toBeNull();
});

it("can edit a Profile draft and protects unsaved changes", () => {
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
  expect(screen.getByText("Profile not found")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Profiles" }).getAttribute("href"),
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
  fireEvent.click(screen.getByRole("button", { name: "Edit Guardrails" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Add Guardrail" }));
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
  expect(screen.queryByText("Requirement")).toBeNull();
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
  fireEvent.click(screen.getByRole("button", { name: "Add Guardrail" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Add Guardrail" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Add Guardrail" }));
  const versions = screen.getByRole("combobox", { name: `Version for ${policy.name}` }) as HTMLSelectElement;
  expect(versions.value).toBe("1");
  expect((within(versions).getByRole("option", { name: "v2 ✦ · Processing (not ready)" }) as HTMLOptionElement).disabled).toBe(true);
});

it("generates traffic automatically while mounted and stops after leaving", async () => {
 vi.useFakeTimers();
 try {
  const view=show();
  fireEvent.click(screen.getByRole("button",{name:"Overview & activity"}));
  expect(screen.queryByRole("button",{name:"Send test request"})).toBeNull();
  const events=()=>JSON.parse(localStorage.getItem(STORAGE_KEY)!).items.find((x:{id:string})=>x.id==="customer-interaction").runtime.events;
  const before=events().length;
  await act(async()=>{await vi.advanceTimersByTimeAsync(15000)});
  const generated=events().slice(0,events().length-before);
  expect(generated.some((e:{decision:string})=>e.decision==="allow")).toBe(true);
  expect(generated.some((e:{decision:string})=>e.decision==="error")).toBe(true);
  expect(generated.some((e:{decision:string,enforced:boolean})=>e.decision==="block"&&e.enforced)).toBe(true);
  view.unmount();
  const after=events().length;
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000)});
  expect(events().length).toBe(after);
 } finally { vi.useRealTimers(); }
});

it("shows traces beneath the clicked guardrail and removes the period picker",()=>{
 show();fireEvent.click(screen.getByRole("button",{name:"Overview & activity"}));
 expect(screen.queryByRole("combobox",{name:"Statistics period"})).toBeNull();
 expect(screen.queryByRole("region",{name:"Trace list"})).toBeNull();
 const mode=screen.getByRole("button",{name:/Actions for/});
 const row=mode.closest("tr")!;
 fireEvent.click(row);
 expect(screen.getByRole("region",{name:"Trace list"})).toBeTruthy();
 expect(row.nextElementSibling?.contains(screen.getByRole("region",{name:"Trace list"}))).toBe(true);
 fireEvent.click(mode);
 expect(screen.getByRole("region",{name:"Trace list"})).toBeTruthy();
 fireEvent.click(row);
 expect(screen.queryByRole("region",{name:"Trace list"})).toBeNull();
});

it("pauses automatic scans for the whole bypassed profile and resumes them",async()=>{
 vi.useFakeTimers();
 try{
  show();fireEvent.click(screen.getByRole("button",{name:"Overview & activity"}));
  const events=()=>JSON.parse(localStorage.getItem(STORAGE_KEY)!).items.find((x:{id:string})=>x.id==="customer-interaction").runtime.events.length;
  await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Bypass"}))});
  expect(screen.getByRole("dialog",{name:"Bypass this profile?"})).toBeTruthy();
  expect(screen.queryByText("Current: Bypass")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("Current: Bypass")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Bypass"}));
  await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Confirm bypass"}))});
  const before=events();
  expect(screen.getByText("Current: Bypass")).toBeTruthy();
  expect((screen.getByRole("button",{name:/Actions for/}) as HTMLButtonElement).disabled).toBe(true);
  await act(async()=>{await vi.advanceTimersByTimeAsync(15000)});
  expect(events()).toBe(before);
  await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Resume monitoring"}))});
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000)});
  expect(events()).toBeGreaterThan(before);
 }finally{vi.useRealTimers()}
});

vi.mock("./shared-state",()=>import("./shared-state.test-support"));
