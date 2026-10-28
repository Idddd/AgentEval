import { useEffect, useRef, useState } from "react";
import { accounts, seed, type State } from "./model";
import { completeDemoState } from "./mock-data";

// Mock data never migrates from the legacy workspace or uses live credentials.
export const demoStorageKey = "nmgr-v2-mock-state";
export const ownerStorageKey = "nmgr-v2-mock-owner";

export function readDemoState(raw: string): State {
  const state = JSON.parse(raw);
  if (!Array.isArray(state.entities) || !Array.isArray(state.audit))
    throw new Error("Invalid workspace data");
  return completeDemoState(state);
}

export function initialOwner(): string {
  try {
    const requested = new URLSearchParams(window.location.search).get("role");
    const roles: Record<string, string> = {
      user: "User",
      approver: "User Admin",
      tech: "IT Admin",
    };
    const linked = roles[requested ?? ""];
    const value =
      linked ??
      sessionStorage.getItem(ownerStorageKey) ??
      localStorage.getItem(ownerStorageKey);
    return value && accounts.some((account) => account === value)
      ? value
      : "User";
  } catch {
    return "User";
  }
}

export function saveOwner(owner: string) {
  try {
    sessionStorage.setItem(ownerStorageKey, owner);
    const url = new URL(window.location.href);
    url.searchParams.set(
      "role",
      owner === "IT Admin"
        ? "tech"
        : owner === "User Admin"
          ? "approver"
          : "user",
    );
    window.history.replaceState(null, "", url);
  } catch {}
}

// Persist only local mutations. Incoming storage events must never write back,
// otherwise open tabs can overwrite each other or enter a storage-event loop.
export function useDemoState(onNotice: (message: string) => void) {
  const [state, setState] = useState<State>(() => seed());
  const [ready, setReady] = useState(false);
  const current = useRef(state);
  const notice = useRef(onNotice);
  notice.current = onNotice;

  useEffect(() => {
    let next = current.current;
    try {
      const raw = localStorage.getItem(demoStorageKey);
      if (raw) next = readDemoState(raw);
      const serialized = JSON.stringify(next);
      if (raw !== serialized) localStorage.setItem(demoStorageKey, serialized);
    } catch {
      notice.current("Saved workspace data could not be read. Default records loaded.");
    }
    current.current = next;
    setState(next);
    setReady(true);
    const receive = (event: StorageEvent) => {
      if (
        event.key !== demoStorageKey ||
        (event.storageArea && event.storageArea !== localStorage)
      )
        return;
      try {
        // Read the latest value, even when several events have been queued.
        const raw = localStorage.getItem(demoStorageKey);
        if (!raw) return;
        const incoming = readDemoState(raw);
        current.current = incoming;
        setState(incoming);
      } catch {
        notice.current(
          "Changes from another tab could not be loaded. Please refresh this page.",
        );
      }
    };
    window.addEventListener("storage", receive);
    return () => window.removeEventListener("storage", receive);
  }, []);

  function updateState(change: (latest: State) => State, requirePersistence = false) {
    let latest = current.current;
    try {
      const raw = localStorage.getItem(demoStorageKey);
      if (requirePersistence && raw === null) {
        notice.current("Workspace storage was reset. Refresh before importing configurations.");
        return false;
      }
      if (raw) latest = readDemoState(raw);
    } catch {
      if (requirePersistence) {
        notice.current("The latest workspace could not be read. Existing data was retained.");
        return false;
      }
    }
    const next = change(latest);
    let persisted = true;
    try {
      localStorage.setItem(demoStorageKey, JSON.stringify(next));
    } catch {
      persisted = false;
      notice.current(
        "Browser storage is unavailable. Changes in this tab cannot be synchronized.",
      );
    }
    if (requirePersistence && !persisted) return false;
    current.current = next;
    setState(next);
    return persisted;
  }
  return { state, ready, updateState };
}
