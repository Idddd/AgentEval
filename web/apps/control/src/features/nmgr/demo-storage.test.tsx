/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  demoStorageKey,
  initialOwner,
  saveOwner,
  useDemoState,
} from "./demo-storage";
import { seed, transition } from "./model";
import { importConfigurationJson } from "./configuration-import";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/guardrails");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("refuses persistent imports when the latest workspace cannot be read, retaining another tab's records", () => {
  const { result } = renderHook(() => useDemoState(() => {}));
  const incoming = importConfigurationJson(result.current.state, JSON.stringify([
    { kind: "Guardrail", id: "gr-other-tab", name: "Another tab", description: "Another tab's new record" },
  ]));
  localStorage.setItem(demoStorageKey, JSON.stringify(incoming));
  vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => { throw new Error("read blocked"); });
  let saved: boolean | undefined;
  act(() => {
    saved = result.current.updateState((latest) => importConfigurationJson(latest, JSON.stringify([
      { kind: "Guardrail", id: "gr-confirmed-import", name: "Import", description: "New imported record" },
    ])), true);
  });
  expect(saved).toBe(false);
  expect(JSON.parse(localStorage.getItem(demoStorageKey)!)).toEqual(incoming);
  expect(result.current.state.entities.some((item) => item.id === "gr-confirmed-import")).toBe(false);
});

it("isolates mock state and roles from legacy browser records and live credentials", () => {
  const legacy = seed();
  legacy.entities[0]!.name = "Legacy workspace record";
  localStorage.setItem("nmgr-three-role-v2", JSON.stringify(legacy));
  localStorage.setItem("nmgr-owner", "IT Admin");
  sessionStorage.setItem("marketplace-v2-token", "real-token");
  const { result } = renderHook(() => useDemoState(() => {}));
  expect(result.current.state.entities[0]!.name).not.toBe("Legacy workspace record");
  expect(initialOwner()).toBe("User");
  act(() => result.current.updateState((state) => ({ ...state, entities: [] })));
  saveOwner("User Admin");
  expect(JSON.parse(localStorage.getItem("nmgr-three-role-v2")!).entities[0].name).toBe("Legacy workspace record");
  expect(localStorage.getItem("nmgr-owner")).toBe("IT Admin");
  expect(sessionStorage.getItem("marketplace-v2-token")).toBe("real-token");
});

it("keeps role selection per tab and allows three direct role links", () => {
  for (const [query, role] of [
    ["user", "User"],
    ["approver", "User Admin"],
    ["tech", "IT Admin"],
  ]) {
    window.history.replaceState(null, "", `/guardrails?role=${query}`);
    expect(initialOwner()).toBe(role);
  }
  saveOwner("User Admin");
  expect(sessionStorage.getItem("nmgr-v2-mock-owner")).toBe("User Admin");
  expect(localStorage.getItem("nmgr-v2-mock-owner")).toBeNull();
  expect(window.location.search).toBe("?role=approver");
  localStorage.setItem("nmgr-v2-mock-owner", "IT Admin");
  expect(initialOwner()).toBe("User Admin");
});

it("receives changes without echoing them, and applies actions to the latest shared state", () => {
  const { result } = renderHook(() => useDemoState(() => {}));
  const initial = seed();
  const profile = initial.entities.find((item) => item.kind === "Profile")!;
  const changed = transition(initial, profile.id, "Pass all", "User");
  localStorage.setItem(demoStorageKey, JSON.stringify(changed));
  const writes = vi.spyOn(Storage.prototype, "setItem");
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: demoStorageKey,
        newValue: JSON.stringify(changed),
        storageArea: localStorage,
      }),
    ),
  );
  expect(
    result.current.state.entities.find((item) => item.id === profile.id)?.mode,
  ).toBe("Pass all");
  expect(writes).not.toHaveBeenCalled();
  expect(result.current.state).toEqual(changed);
  // Another tab writes before this tab has processed its storage event.
  const another = changed.entities.find(
    (item) => item.kind === "Profile" && item.id !== profile.id,
  )!;
  const latest = transition(changed, another.id, "Block all", "User");
  localStorage.setItem(demoStorageKey, JSON.stringify(latest));
  act(() =>
    result.current.updateState((state) =>
      transition(state, profile.id, "Normal", "User"),
    ),
  );
  expect(
    result.current.state.entities.find((item) => item.id === another.id)?.mode,
  ).toBe("Block all");
  expect(result.current.state.audit).toHaveLength(latest.audit.length + 1);
});
