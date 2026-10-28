/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConfigurationImportPage } from "./configuration-import-page";
import { demoStorageKey } from "./demo-storage";
import { Route } from "@/routes/__root";

const json = JSON.stringify([{ kind: "Guardrail", id: "gr-hidden-json", name: "Hidden JSON Guardrail", description: "Imported requirement" }]);
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each(["/import", "/import/"])("allows the local %s utility only under Mock V2", (pathname) => {
  const load = Route.options.beforeLoad;
  if (typeof load !== "function") throw new Error("Missing root routing policy");
  expect(() => load({ location: { pathname, publicHref: `/v2-mock${pathname}` } } as never)).not.toThrow();
  expect(() => load({ location: { pathname, publicHref: `/v2${pathname}` } } as never)).not.toThrow();
  expect(() => load({ location: { pathname, publicHref: `/v3${pathname}` } } as never)).toThrow();
  expect(() => load({ location: { pathname, publicHref: `/v1${pathname}` } } as never)).toThrow();
});

it("labels imported drafts as browser-local mock data and returns to the mock workspace", () => {
  render(<ConfigurationImportPage />);
  expect(screen.getByText("Mock V2")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to Mock V2" }).getAttribute("href")).toBe("/v2/guardrails");
});

it("previews configurations and writes them only after confirmation", () => {
  render(<ConfigurationImportPage />);
  const before = localStorage.getItem(demoStorageKey);
  fireEvent.change(screen.getByLabelText("Configuration JSON"), { target: { value: json } });
  fireEvent.click(screen.getByRole("button", { name: "Validate and preview" }));
  expect(screen.getByText("Hidden JSON Guardrail")).toBeTruthy();
  expect(localStorage.getItem(demoStorageKey)).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
  expect(JSON.parse(localStorage.getItem(demoStorageKey)!).entities[0]).toMatchObject({ id: "gr-hidden-json", status: "DRAFT" });
  expect(screen.getByRole("status").textContent).toContain("Imported 1 configuration");
});

it("cancels a preview and rejects invalid input without changing stored data", () => {
  render(<ConfigurationImportPage />);
  const before = localStorage.getItem(demoStorageKey);
  fireEvent.change(screen.getByLabelText("Configuration JSON"), { target: { value: json } });
  fireEvent.click(screen.getByRole("button", { name: "Validate and preview" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel preview" }));
  expect(screen.queryByRole("button", { name: "Confirm import" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Configuration JSON"), { target: { value: "{broken" } });
  fireEvent.click(screen.getByRole("button", { name: "Validate and preview" }));
  expect(screen.getByRole("alert").textContent).toContain("Invalid JSON");
  expect(localStorage.getItem(demoStorageKey)).toBe(before);
});

it("reads a selected JSON file and previews it without saving it", async () => {
  render(<ConfigurationImportPage />);
  const before = localStorage.getItem(demoStorageKey);
  const file = new File([json], "configurations.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(json) });
  fireEvent.change(screen.getByLabelText("Choose JSON file"), { target: { files: [file] } });
  expect(await screen.findByText("Hidden JSON Guardrail")).toBeTruthy();
  expect(localStorage.getItem(demoStorageKey)).toBe(before);
});

it("retains the workspace and preview when browser storage refuses confirmation", () => {
  render(<ConfigurationImportPage />);
  const before = localStorage.getItem(demoStorageKey);
  fireEvent.change(screen.getByLabelText("Configuration JSON"), { target: { value: json } });
  fireEvent.click(screen.getByRole("button", { name: "Validate and preview" }));
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
  expect(screen.getByRole("alert").textContent).toContain("not saved");
  expect(screen.getByRole("button", { name: "Confirm import" })).toBeTruthy();
  expect(localStorage.getItem(demoStorageKey)).toBe(before);
  write.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
  expect(screen.getByRole("status").textContent).toContain("Imported 1 configuration");
});
