/** @vitest-environment jsdom */
import { expect, it } from "vitest";
import { createBrowserHistory } from "@tanstack/react-router";
import { writeLiveLocation } from "./live-navigation";

it("creates distinct TanStack history indexes and keys while preserving application state", () => {
  window.history.replaceState({ marker: "preserved" }, "", "/v3/guardrails?role=user");
  const history = createBrowserHistory();
  try {
    history.replace(history.location.href, { ...history.location.state, marker: "preserved" });
    history.flush();
    const start = history.location.state.__TSR_index;
    writeLiveLocation({ kind: "Profile", view: "repository", selected: "" }, history);
    history.flush();
    const first = { ...window.history.state };
    writeLiveLocation({ kind: "Profile", view: "repository", selected: "my-profile" }, history);
    history.flush();
    expect(first.__TSR_index).toBe(start + 1);
    expect(window.history.state.__TSR_index).toBe(start + 2);
    expect(window.history.state.__TSR_key).not.toBe(first.__TSR_key);
    expect(window.history.state.marker).toBe("preserved");
    expect(history.canGoBack()).toBe(true);
  } finally { history.destroy(); }
});
