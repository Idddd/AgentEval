/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { seed, type Entity, type Run } from "./model";
import { mockBenchmarkResults, TestResultsReview } from "./test-results-review";

afterEach(cleanup);
const run = (version = 1): Run => ({ id: `run-${version}`, version, base: null, dataset: `acceptance-v${version}.json`, passed: true, start: "2026-10-14T01:00:00Z", end: "2026-10-14T01:05:00Z", cases: 24 });
const guard = (): Entity => ({ ...seed().entities.find((item) => item.kind === "Guardrail")!, name: "Banking assistant", description: "Restrict financial advice and protect customer data.", policies: [], version: 1, revisions: {}, runs: [run()] });

it("expands and collapses the run's benchmarks with grouped metrics", () => {
  render(<TestResultsReview item={guard()} />);
  expect(screen.queryByText(/mock results/i)).toBeNull();
  expect(screen.getByRole("heading", { name: "Results" })).toBeTruthy();
  expect(screen.queryByRole("table", { name: "Benchmark Results" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Results for acceptance-v1.json" }));
  const table = within(screen.getByRole("table", { name: "Benchmark Results" }));
  expect(table.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Benchmark", "Evaluation Scope", "DataSet", "Guardrail", "Accuracy", "Precision", "Recall"]);
  expect(table.getByText("Personalized financial advice")).toBeTruthy();
  expect(table.queryByText("Unauthorized tool access")).toBeNull();
  expect(table.getAllByRole("row").length).toBeGreaterThan(3);
  fireEvent.click(screen.getByRole("button", { name: "Results for acceptance-v1.json" }));
  expect(screen.queryByRole("table", { name: "Benchmark Results" })).toBeNull();
});

it("reviews the selected historical version using its saved requirement", () => {
  const item = guard();
  item.version = 2;
  item.name = "Internal governance";
  item.description = "Restrict unauthorized tools and enforce least privilege.";
  item.runs = [run(2), run(1)];
  item.revisions = { 1: { name: "PII protection", description: "Detect personal identifiers and PII.", policies: [], refs: [], unit: "ISS", location: "ALL", mandatory: false, attributes: item.attributes } };
  render(<TestResultsReview item={item} />);
  fireEvent.click(screen.getByRole("button", { name: "Results for acceptance-v2.json" }));
  expect(screen.getByText("Unauthorized tool access")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Evaluation result version"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Results for acceptance-v1.json" }));
  expect(screen.getByText("Direct PII disclosure")).toBeTruthy();
  expect(screen.queryByText("Unauthorized tool access")).toBeNull();
  expect(screen.getByText("acceptance-v1.json")).toBeTruthy();
});

it("keeps metrics stable for a run and distinguishes a failed mock scenario", () => {
  const item = guard(), passed = run();
  expect(mockBenchmarkResults(item, passed)).toEqual(mockBenchmarkResults(item, passed));
  const failed = mockBenchmarkResults(item, { ...passed, passed: false });
  expect(failed[0]!.accuracy).toBeLessThan(80);
  for (const row of failed) for (const value of [row.accuracy, row.precision, row.recall]) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  }
});

it("does not create benchmark results when no test was recorded", () => {
  render(<TestResultsReview item={{ ...guard(), runs: [] }} />);
  expect(screen.getByText("No evaluations recorded for this version.")).toBeTruthy();
  expect(screen.queryByRole("table", { name: "Benchmark Results" })).toBeNull();
});
