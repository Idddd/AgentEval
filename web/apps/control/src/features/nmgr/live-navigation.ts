import type { Kind } from "./model";
import type { View } from "./workbench";
import type { RouterHistory } from "@tanstack/react-router";

export type LiveLocation = { kind: Kind; view: View; selected: string };
const views = new Set<View>(["repository", "tests", "signoff", "deploy", "dashboard", "operations", "audit", "logs"]);
export function readLiveLocation(): LiveLocation {
  const fallback: LiveLocation = { kind: "Guardrail", view: "repository", selected: "" };
  if (typeof window === "undefined") return fallback;
  const [kind, view, rawId = ""] = window.location.hash.slice(1).split("/");
  if (!["Guardrail", "Profile"].includes(kind ?? "") || !views.has(view as View)) return fallback;
  return { kind: kind as Kind, view: view as View, selected: /^[a-z][a-z0-9-]{2,63}$/.test(rawId) ? rawId : "" };
}
export function writeLiveLocation(location: LiveLocation, history?: RouterHistory) {
  const url = new URL(window.location.href);
  url.hash = `${location.kind}/${location.view}/${location.selected}`;
  if (url.href !== window.location.href) {
    if (history) history.push(url.pathname + url.search + url.hash, window.history.state);
    else window.history.pushState(window.history.state, "", url); // Standalone component hosts without TanStack.
  }
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
