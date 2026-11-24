/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IndependentEvaluation } from "./independent-evaluation";

const setup = { revision: "7:1", target: "smoke", endpoint: "mock-guardrail", demo: true, datasets: [{ id: "demo", version: 1, name: "Synthetic cases" }] };
const completed = { id: "run-1", status: "COMPLETED", total: 1, completed: 1, createdAt: "2026-11-24T00:00:00Z" };
const report = { status: "COMPLETED", total: 1, offset: 0, matched: 0, mismatches: 1, errors: 0, rows: [{ id: "sample", status: "FAIL", labels: [{ expected: "safe", observed: "unsafe" }] }] };
const error = { error: { code: "evaluation_unreachable", message: "Cannot reach the evaluation service." } };
beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows a service failure in Marketplace and can reopen a persisted report after retry", async () => {
  let healthy = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (!healthy) return Response.json(error, { status: 503 });
    if (url.includes("report=true")) return Response.json({ report });
    if (url.includes("run=run-1")) return Response.json({ run: completed });
    return Response.json({ setup, history: [completed] });
  }));
  render(<IndependentEvaluation guardrail="banking" version={1} demo />);
  expect((await screen.findByRole("alert")).textContent).toContain(error.error.message);
  expect(screen.queryByRole("button", { name: "Run evaluation" })).toBeNull();
  healthy = true;
  fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
  const table = await screen.findByRole("table", { name: "Evaluation case results" });
  expect(within(table).getByRole("row", { name: /sample.*Fail.*safe.*unsafe/ })).toBeTruthy();
  expect(screen.getByText("Completed with mismatches")).toBeTruthy();
});

it("recovers an unacknowledged submission using the same idempotency key", async () => {
  const keys: (string | null)[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      keys.push(new Headers(init.headers).get("Idempotency-Key"));
      return keys.length === 1 ? Response.json(error, { status: 503 }) : Response.json({ run: completed }, { status: 202 });
    }
    if (url.includes("report=true")) return Response.json({ report });
    if (url.includes("run=")) return Response.json({ run: completed });
    return Response.json({ setup, history: [] });
  }));
  const first = render(<IndependentEvaluation guardrail="banking" version={1} demo />);
  fireEvent.click(await screen.findByRole("button", { name: "Run evaluation" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  first.unmount();
  render(<IndependentEvaluation guardrail="banking" version={1} demo />);
  fireEvent.click(await screen.findByRole("button", { name: "Retry submission" }));
  expect(await screen.findByRole("table", { name: "Evaluation case results" })).toBeTruthy();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toEqual(keys[0]);
});
