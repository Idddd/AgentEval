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

it("selects a live configuration and displays its report on the active Guardrail revision", async () => {
  const calls: URL[] = [];
  const start = vi.fn();
  const option = { id: "smoke", name: "Release suite", version: 6 };
  const row = { ...completed, target: option.id, targetName: option.name, targetVersion: 6 };
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    const url = new URL(path, "http://localhost"); calls.push(url);
    const params = url.searchParams;
    if (init?.method === "POST") {
      start(params.get("target"), params.get("revision"));
      return Response.json({ run: row }, { status: 202 });
    }
    if (params.has("report")) return Response.json({ report });
    if (params.has("run")) return Response.json({ run: row });
    if (params.get("target") === "empty") return Response.json({ error: { code: "evaluation_datasets_missing", message: "Publish a dataset." } }, { status: 422 });
    if (params.has("target")) return Response.json({ setup, history: [] });
    return Response.json({ configurations: [{ id: "empty", name: "Draft" }, option], history: start.mock.calls.length ? [row] : [] });
  }));
  const first = render(<IndependentEvaluation guardrail="banking" version={2} />);
  const select = await screen.findByRole("combobox", { name: "Evaluation configuration" });
  expect((select as HTMLSelectElement).value).toBe("");
  fireEvent.change(select, { target: { value: "empty" } });
  expect((await screen.findByRole("alert")).textContent).toContain("Publish a dataset");
  fireEvent.change(select, { target: { value: option.id } });
  await screen.findByText(setup.endpoint);
  fireEvent.click(screen.getByRole("button", { name: "Run evaluation" }));
  expect(await screen.findByRole("table", { name: "Evaluation case results" })).toBeTruthy();
  expect(start).toHaveBeenCalledWith("smoke", "7:1");
  expect(screen.getByText("Demo evaluation · Release suite · v6")).toBeTruthy();
  first.unmount();
  render(<IndependentEvaluation guardrail="banking" version={2} />);
  expect(await screen.findByRole("table", { name: "Evaluation case results" })).toBeTruthy();
  expect(start).toHaveBeenCalledTimes(1);
  expect(calls.every(u => u.searchParams.get("guardrail") === "banking" && u.searchParams.get("version") === "2")).toBe(true);
});

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
