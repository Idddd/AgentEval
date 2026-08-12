# Overview Evaluator Alert and Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge Sampling into the Overview Evaluators section, add a global evaluator score threshold and mock alert toggle, and make Overview Score, Status, filters, and KPIs share one evaluator-derived result.

**Architecture:** Add a pure `overview-evaluator-policy.ts` module that normalizes evaluator scores, creates pass summaries, derives Overview-only Trace status, and decides mock alert state. Extend the existing in-memory Evaluation settings and store with validated threshold and alert fields. Keep `overview-page.tsx` focused on layout and use the pure policy result for every status consumer.

**Tech Stack:** React 19, TypeScript, TanStack Router, existing Evaluation mock store, Tailwind CSS, Vitest, Testing Library.

## Global Constraints

- Keep all alert behavior in frontend mock state; do not call a notification API.
- Use one global `0–100%` threshold, default `80`.
- Normalize Built-in scores from `0–1` and Langfuse judge scores from `1–5`.
- Count enabled evaluators only.
- Preserve execution `ERROR`; otherwise derive Overview PASS/FAIL only from evaluator outcomes.
- Do not change recorded Trace statuses or status presentation outside Evaluation Overview.
- Preserve current Sampling what-if behavior and do not drop actual Trace data.
- Do not stage or commit the existing uncommitted Dataset card-selector files as part of these tasks.

---

## File Structure

- `overview/overview-evaluator-policy.ts`: score normalization, evaluator summary, Overview status, and alert decisions.
- `overview/overview-evaluator-policy.test.ts`: exhaustive pure policy behavior.
- `model.ts`: two new settings fields.
- `fixtures.ts`: default threshold and alert values.
- `fixture-validation.ts`: threshold range and alert-type validation.
- `mock-store.ts`: two validated setters.
- `mock-store.test.ts`: setter clamping and persistence tests.
- `overview/overview-page.tsx`: consolidated Evaluators/Sampling UI, settings controls, score cell, and derived status consumers.
- `overview/overview-page.test.tsx`: component layout, interactions, column order, score display, alert, and filter/KPI behavior.

---

### Task 1: Pure Evaluator Policy

**Files:**
- Create: `web/apps/control/src/features/evaluation-layer/overview/overview-evaluator-policy.ts`
- Create: `web/apps/control/src/features/evaluation-layer/overview/overview-evaluator-policy.test.ts`

**Interfaces:**
- Consumes: `EvaluationLayerEvaluator` and `EvaluationLayerTrace` from `../model`.
- Produces: `TraceEvaluatorDetail`, `TraceEvaluatorSummary`, `traceEvaluatorSummary`, `overviewTraceStatus`, and `traceEvaluatorAlertTriggered`.

- [ ] **Step 1: Write failing normalization and summary tests**

The production errors these tests catch are wrong source scaling, wrong average, disabled evaluators entering totals, missing scores counting as passes, and threshold equality failing.

```ts
import { describe, expect, it } from "vitest";
import { cloneEvaluationLayerFixtures } from "../fixture-validation";
import {
  overviewTraceStatus,
  traceEvaluatorAlertTriggered,
  traceEvaluatorSummary,
} from "./overview-evaluator-policy";

describe("Overview evaluator policy", () => {
  it("normalizes Built-in and judge averages and counts enabled evaluators", () => {
    const state = cloneEvaluationLayerFixtures();
    const trace = {
      ...state.traces.find((item) => item.id === "demo-jailbreak-guard-bypass")!,
      deterministicScores: { permission_compliance: 0.6, execution_correctness: 1 },
      judge: {
        ...state.traces.find((item) => item.id === "demo-jailbreak-guard-bypass")!.judge!,
        scores: { correctness: 4, safety: 3 },
      },
    };

    const summary = traceEvaluatorSummary(trace, state.evaluators, 80);

    expect(summary).toMatchObject({
      passed: 1,
      evaluated: 2,
      totalEnabled: 2,
      allPassed: false,
      evaluatedAny: true,
    });
    expect(summary.details.map((item) => [item.evaluatorName, item.normalizedScore, item.passed])).toEqual([
      ["Permission compliance", 80, true],
      ["Recorded demo judge", 70, false],
    ]);
  });

  it("excludes disabled evaluators and reports missing enabled results", () => {
    const state = cloneEvaluationLayerFixtures();
    const trace = { ...state.traces[0]!, judge: undefined };
    const withJudgeDisabled = state.evaluators.map((item) =>
      item.provider === "LANGFUSE" ? { ...item, enabled: false } : item,
    );
    expect(traceEvaluatorSummary(trace, withJudgeDisabled, 80)).toMatchObject({
      passed: 1,
      evaluated: 1,
      totalEnabled: 1,
      allPassed: true,
    });
    expect(traceEvaluatorSummary(trace, state.evaluators, 80)).toMatchObject({
      passed: 1,
      evaluated: 1,
      totalEnabled: 2,
      allPassed: false,
    });
  });
});
```

- [ ] **Step 2: Write failing status and alert tests**

```ts
it("preserves ERROR and otherwise derives status from evaluators", () => {
  const state = cloneEvaluationLayerFixtures();
  const passing = state.traces.find((item) => item.id === "demo-weather-guest-allow")!;
  const failing = state.traces.find((item) => item.id === "demo-jailbreak-guard-bypass")!;
  const runtimeError = state.traces.find((item) => item.status === "ERROR")!;
  expect(overviewTraceStatus(passing, state.evaluators, 80)).toBe("PASS");
  expect(overviewTraceStatus(failing, state.evaluators, 80)).toBe("FAIL");
  expect(overviewTraceStatus(runtimeError, state.evaluators, 80)).toBe("ERROR");
  expect(overviewTraceStatus({ ...passing, status: "FAIL", markedFailed: true }, state.evaluators, 80)).toBe("PASS");
});

it("triggers only enabled score alerts below policy", () => {
  const state = cloneEvaluationLayerFixtures();
  const passing = state.traces.find((item) => item.id === "demo-weather-guest-allow")!;
  const failing = state.traces.find((item) => item.id === "demo-jailbreak-guard-bypass")!;
  expect(traceEvaluatorAlertTriggered(failing, state.evaluators, 80, true)).toBe(true);
  expect(traceEvaluatorAlertTriggered(failing, state.evaluators, 80, false)).toBe(false);
  expect(traceEvaluatorAlertTriggered(passing, state.evaluators, 80, true)).toBe(false);
});
```

- [ ] **Step 3: Run policy tests and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- --run src/features/evaluation-layer/overview/overview-evaluator-policy.test.ts`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 4: Implement policy types and normalization**

```ts
export type TraceEvaluatorDetail = {
  evaluatorId: string;
  evaluatorName: string;
  normalizedScore: number | null;
  passed: boolean | null;
  rawScores: Record<string, number> | null;
};

export type TraceEvaluatorSummary = {
  passed: number;
  evaluated: number;
  totalEnabled: number;
  allPassed: boolean;
  evaluatedAny: boolean;
  details: TraceEvaluatorDetail[];
};

function normalizedAverage(values: number[], scale: 1 | 5) {
  if (!values.length) return null;
  const normalized = values.map((value) =>
    Math.min(100, Math.max(0, scale === 1 ? value * 100 : value * 20)),
  );
  return normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
}
```

For each enabled evaluator, use deterministic scores for `BUILT_IN`, judge scores for `LANGFUSE`, and `null` when its source has no values. Round display-facing normalized scores to one decimal while comparing the unrounded average to the threshold.

- [ ] **Step 5: Implement summary, status, and alert helpers**

```ts
export function overviewTraceStatus(
  trace: EvaluationLayerTrace,
  evaluators: EvaluationLayerEvaluator[],
  threshold: number,
): "PASS" | "FAIL" | "ERROR" {
  if (trace.status === "ERROR") return "ERROR";
  const summary = traceEvaluatorSummary(trace, evaluators, threshold);
  return summary.evaluatedAny && !summary.allPassed ? "FAIL" : "PASS";
}

export function traceEvaluatorAlertTriggered(
  trace: EvaluationLayerTrace,
  evaluators: EvaluationLayerEvaluator[],
  threshold: number,
  sendAlert: boolean,
) {
  if (!sendAlert) return false;
  const summary = traceEvaluatorSummary(trace, evaluators, threshold);
  return summary.evaluatedAny && !summary.allPassed;
}
```

- [ ] **Step 6: Run policy tests and verify GREEN**

Run: `npm.cmd test --workspace @tasklattice/control -- --run src/features/evaluation-layer/overview/overview-evaluator-policy.test.ts`

Expected: all policy tests PASS.

- [ ] **Step 7: Commit policy only**

```powershell
git add web/apps/control/src/features/evaluation-layer/overview/overview-evaluator-policy.ts web/apps/control/src/features/evaluation-layer/overview/overview-evaluator-policy.test.ts
git commit -m "feat: derive Overview status from evaluator scores"
```

---

### Task 2: Mock Evaluation Policy Settings

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/model.ts`
- Modify: `web/apps/control/src/features/evaluation-layer/fixtures.ts`
- Modify: `web/apps/control/src/features/evaluation-layer/fixture-validation.ts`
- Modify: `web/apps/control/src/features/evaluation-layer/mock-store.ts`
- Modify: `web/apps/control/src/features/evaluation-layer/mock-store.test.ts`
- Modify: `web/apps/control/src/features/evaluation-layer/fixtures.test.ts`

**Interfaces:**
- Extends: `EvaluationLayerSettings` with `minimumEvaluatorScore: number` and `sendEvaluatorAlert: boolean`.
- Extends: `EvaluationLayerStore` with `setMinimumEvaluatorScore(score: number): CommandResult` and `setSendEvaluatorAlert(enabled: boolean): CommandResult`.
- Consumed by Task 3 Overview controls.

- [ ] **Step 1: Write failing store-setting tests**

The production errors these tests catch are missing defaults, invalid non-numeric values entering state, threshold values escaping `0–100`, and alert toggles not notifying subscribers.

```ts
it("clamps the evaluator threshold and toggles mock alerts", () => {
  const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
  expect(store.getState().settings.minimumEvaluatorScore).toBe(80);
  expect(store.getState().settings.sendEvaluatorAlert).toBe(false);

  expect(store.setMinimumEvaluatorScore(120)).toEqual({ ok: true, value: undefined });
  expect(store.getState().settings.minimumEvaluatorScore).toBe(100);
  expect(store.setMinimumEvaluatorScore(-7)).toEqual({ ok: true, value: undefined });
  expect(store.getState().settings.minimumEvaluatorScore).toBe(0);
  expect(store.setMinimumEvaluatorScore(Number.NaN).ok).toBe(false);

  expect(store.setSendEvaluatorAlert(true)).toEqual({ ok: true, value: undefined });
  expect(store.getState().settings.sendEvaluatorAlert).toBe(true);
});
```

Add fixture assertions:

```ts
expect(state.settings.minimumEvaluatorScore).toBe(80);
expect(state.settings.sendEvaluatorAlert).toBe(false);
expect(validateEvaluationLayerFixtures(state)).toEqual([]);
```

- [ ] **Step 2: Run store and fixture tests and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- --run src/features/evaluation-layer/mock-store.test.ts src/features/evaluation-layer/fixtures.test.ts`

Expected: FAIL because settings and setters do not exist.

- [ ] **Step 3: Extend settings, defaults, and validation**

Add to `EvaluationLayerSettings`:

```ts
minimumEvaluatorScore: number;
sendEvaluatorAlert: boolean;
```

Add fixture defaults beside `samplingRate`:

```ts
samplingRate: 100,
minimumEvaluatorScore: 80,
sendEvaluatorAlert: false,
```

Add fixture validation:

```ts
if (!Number.isFinite(state.settings.minimumEvaluatorScore)
  || state.settings.minimumEvaluatorScore < 0
  || state.settings.minimumEvaluatorScore > 100) {
  errors.push(`settings.minimumEvaluatorScore: ${state.settings.minimumEvaluatorScore}`);
}
if (typeof state.settings.sendEvaluatorAlert !== "boolean") {
  errors.push(`settings.sendEvaluatorAlert: ${state.settings.sendEvaluatorAlert}`);
}
```

- [ ] **Step 4: Add validated store setters**

Add to `EvaluationLayerStore` and the returned store object:

```ts
setMinimumEvaluatorScore(score) {
  if (!Number.isFinite(score)) {
    return fail("Minimum evaluator score must be a number between 0 and 100.", "INVALID_INPUT");
  }
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  replaceState((snapshot) => ({
    ...snapshot,
    settings: { ...snapshot.settings, minimumEvaluatorScore: clamped },
  }));
  return { ok: true, value: undefined };
},
setSendEvaluatorAlert(enabled) {
  replaceState((snapshot) => ({
    ...snapshot,
    settings: { ...snapshot.settings, sendEvaluatorAlert: enabled },
  }));
  return { ok: true, value: undefined };
},
```

- [ ] **Step 5: Run store and fixture tests and verify GREEN**

Run: `npm.cmd test --workspace @tasklattice/control -- --run src/features/evaluation-layer/mock-store.test.ts src/features/evaluation-layer/fixtures.test.ts`

Expected: all selected tests PASS.

- [ ] **Step 6: Commit mock settings only**

```powershell
git add web/apps/control/src/features/evaluation-layer/model.ts web/apps/control/src/features/evaluation-layer/fixtures.ts web/apps/control/src/features/evaluation-layer/fixture-validation.ts web/apps/control/src/features/evaluation-layer/mock-store.ts web/apps/control/src/features/evaluation-layer/mock-store.test.ts web/apps/control/src/features/evaluation-layer/fixtures.test.ts
git commit -m "feat: add mock evaluator alert settings"
```

---

### Task 3: Consolidated Overview UI and Derived Status

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/overview/overview-page.tsx`
- Create: `web/apps/control/src/features/evaluation-layer/overview/overview-page.test.tsx`

**Interfaces:**
- Consumes: Task 1 policy helpers and Task 2 store settings/setters.
- Preserves: `EvaluationOverviewPage()` route component.
- Produces: an internal `TraceScoreCell` driven by `TraceEvaluatorSummary` rather than `traceScoreJson`.

- [ ] **Step 1: Write failing consolidated-layout tests**

The production errors these tests catch are leaving the tabs in place, hiding Sampling behind a tab, omitting policy controls, and disconnecting controls from real store state.

Use the real mock store and provider; mock only project routing so table links render without a router:

```tsx
/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneEvaluationLayerFixtures } from "../fixture-validation";
import { EvaluationLayerProvider } from "../mock-provider";
import { createEvaluationLayerStore } from "../mock-store";
import { EvaluationOverviewPage } from "./overview-page";

vi.mock("@/hooks/use-project", () => ({ useCurrentProjectId: () => "individual" }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#trace">{children}</a>,
}));

afterEach(cleanup);

function renderOverview() {
  const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
  render(<EvaluationLayerProvider projectId="individual" store={store}><EvaluationOverviewPage /></EvaluationLayerProvider>);
  return store;
}

it("puts Sampling and evaluator policy inside one Evaluators section", () => {
  renderOverview();
  const evaluators = within(screen.getByRole("region", { name: "Evaluators" }));
  expect(screen.queryByRole("tab", { name: "Evaluators" })).toBeNull();
  expect(screen.queryByRole("tab", { name: "Sampling" })).toBeNull();
  expect(evaluators.getByRole("slider", { name: "Sampling rate" })).not.toBeNull();
  expect(evaluators.getByRole("slider", { name: "Minimum score threshold" })).not.toBeNull();
  expect(evaluators.getByRole("checkbox", { name: "Send alert" })).not.toBeNull();
  expect(evaluators.getByText("Captured")).not.toBeNull();
  expect(evaluators.getByText("Dropped failures")).not.toBeNull();
});

it("updates threshold and mock alert settings through real store commands", async () => {
  const store = renderOverview();
  await userEvent.click(screen.getByRole("checkbox", { name: "Send alert" }));
  await userEvent.clear(screen.getByRole("spinbutton", { name: "Minimum score threshold value" }));
  await userEvent.type(screen.getByRole("spinbutton", { name: "Minimum score threshold value" }), "90");
  expect(store.getState().settings.sendEvaluatorAlert).toBe(true);
  expect(store.getState().settings.minimumEvaluatorScore).toBe(90);
});
```

- [ ] **Step 2: Write failing Score order, status, and alert tests**

```tsx
it("shows Score before Status with evaluator pass totals", async () => {
  renderOverview();
  const headers = screen.getAllByRole("columnheader").map((item) => item.textContent);
  expect(headers.indexOf("Score")).toBeLessThan(headers.indexOf("Status"));

  const failedRow = screen.getByText("jailbreak-guard-bypass").closest("tr")!;
  expect(
    within(failedRow).getByRole("button", {
      name: /evaluator score: \d+ of 2 passed/i,
    }),
  ).not.toBeNull();
  expect(within(failedRow).getByText("FAIL")).not.toBeNull();

  await userEvent.click(within(failedRow).getByRole("button", { name: /evaluator score/i }));
  expect(screen.getByText("Permission compliance")).not.toBeNull();
  expect(screen.getByText("Recorded demo judge")).not.toBeNull();
  expect(screen.getAllByText(/%/).length).toBeGreaterThan(0);
});

it("binds alert and failure counts to the same derived evaluator status", async () => {
  renderOverview();
  await userEvent.click(screen.getByRole("checkbox", { name: "Send alert" }));
  const failedRow = screen.getByText("jailbreak-guard-bypass").closest("tr")!;
  expect(within(failedRow).getByText("Alert triggered")).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: /Failures/ }));
  expect(screen.getByText("jailbreak-guard-bypass")).not.toBeNull();
  expect(screen.queryByText("weather-guest-allow")).toBeNull();
});
```

Use regex ratios in assertions where fixture evaluator results yield a different literal than `0/2`; the required behavior is a red incomplete ratio, not a hard-coded fixture score.

- [ ] **Step 3: Run Overview tests and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- --run src/features/evaluation-layer/overview/overview-page.test.tsx`

Expected: FAIL because tabs still exist, settings controls are absent, and Score shows raw JSON after Status.

- [ ] **Step 4: Compute one derived status map**

In `EvaluationOverviewPage`, read:

```ts
const minimumEvaluatorScore = state.settings.minimumEvaluatorScore;
const sendEvaluatorAlert = state.settings.sendEvaluatorAlert;
const traceStatuses = useMemo(
  () => new Map(scoped.map((trace) => [
    trace.id,
    overviewTraceStatus(trace, state.evaluators, minimumEvaluatorScore),
  ])),
  [scoped, state.evaluators, minimumEvaluatorScore],
);
```

Use this map for status filtering, Failures, counts, quality bar, row badges, and dropped failures. A failure is exactly derived status `FAIL`; ERROR remains its own category.

- [ ] **Step 5: Remove Tabs and consolidate Evaluators/Sampling**

Delete Tabs imports and the `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent` wrappers. Render one `EvaluationSection title="Evaluators"` containing the table, then this policy block:

```tsx
<div className="grid gap-4 border-t p-4 lg:grid-cols-[minmax(280px,1fr)_minmax(240px,.8fr)]">
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor="minimum-evaluator-score">Minimum score threshold</Label>
      <input
        id="minimum-evaluator-score-value"
        aria-label="Minimum score threshold value"
        type="number"
        min={0}
        max={100}
        value={minimumEvaluatorScore}
        onChange={(event) => store.setMinimumEvaluatorScore(Number(event.target.value))}
      />
    </div>
    <input
      id="minimum-evaluator-score"
      aria-label="Minimum score threshold"
      type="range"
      min={0}
      max={100}
      step={5}
      value={minimumEvaluatorScore}
      onChange={(event) => store.setMinimumEvaluatorScore(Number(event.target.value))}
    />
  </div>
  <Label className="flex items-start gap-3 rounded-md border p-3">
    <input
      type="checkbox"
      aria-label="Send alert"
      checked={sendEvaluatorAlert}
      onChange={(event) => store.setSendEvaluatorAlert(event.target.checked)}
    />
    <span><strong>Send alert</strong><span>Flag scored Traces that do not pass every enabled evaluator.</span></span>
  </Label>
</div>
```

Place the unchanged Sampling slider, capture bar, four metrics, and warning below this block inside the same section.

- [ ] **Step 6: Move Score and implement evaluator summary cell**

Move `<th>Score</th>` before `<th>Status</th>` and move its corresponding row cell. Replace `traceScoreJson` use with:

```ts
const summary = traceEvaluatorSummary(trace, evaluators, threshold);
const alertTriggered = traceEvaluatorAlertTriggered(trace, evaluators, threshold, sendAlert);
```

The closed cell renders `Not evaluated` when `summary.evaluatedAny` is false, otherwise a button with accessible name `Evaluator score: {passed} of {totalEnabled} passed` and green/red classes from `summary.allPassed`. Render `Alert triggered` under the button when `alertTriggered` is true. The popover lists enabled evaluator name, normalized score or `Not evaluated`, state, and `JsonPreview` for non-null `rawScores`.

- [ ] **Step 7: Run Overview tests and verify GREEN**

Run: `npm.cmd test --workspace @tasklattice/control -- --run src/features/evaluation-layer/overview/overview-page.test.tsx src/features/evaluation-layer/overview/overview-evaluator-policy.test.ts`

Expected: all selected tests PASS.

- [ ] **Step 8: Commit Overview UI only**

```powershell
git add web/apps/control/src/features/evaluation-layer/overview/overview-page.tsx web/apps/control/src/features/evaluation-layer/overview/overview-page.test.tsx
git commit -m "feat: consolidate Overview evaluator monitoring"
```

---

### Task 4: Verification

**Files:**
- Test: files changed in Tasks 1-3.

- [ ] **Step 1: Run focused Evaluation tests**

Run: `npm.cmd test --workspace @tasklattice/control -- --run src/features/evaluation-layer/overview src/features/evaluation-layer/mock-store.test.ts src/features/evaluation-layer/fixtures.test.ts src/features/evaluation-layer/traces/trace-view-model.test.ts`

Expected: all selected tests PASS with zero unhandled errors.

- [ ] **Step 2: Run Control type checking**

Run: `npm.cmd run typecheck --workspace @tasklattice/control`

Expected: exit code 0.

- [ ] **Step 3: Verify the live Overview page**

Open `http://localhost:8080/individual/evaluation/overview` and verify:

- no Evaluators/Sampling tabs;
- evaluator table, threshold, Send alert, Sampling slider, and Sampling metrics are in one section;
- changing threshold changes Score ratios and derived statuses;
- enabling Send alert shows Alert triggered only on below-policy scored rows;
- Score precedes Status and opens normalized/raw evaluator detail;
- Failures KPI and FAIL filter match the rows displaying derived FAIL;
- runtime ERROR remains ERROR;
- narrow viewport remains usable, then reset the viewport.

- [ ] **Step 4: Check scoped diff and workspace ownership**

Run: `git diff --check 5529d39..HEAD` and `git status --short`.

Expected: no whitespace errors. The existing Dataset card-selector files may remain modified/untracked and must not appear in Overview commits.

- [ ] **Step 5: Run the full suite for branch completion**

Run: `npm.cmd test` from `web`.

Expected: all suites PASS. If the known service tests hit the existing 5-second parallel timeout, rerun only those failed files to distinguish performance flakiness from a regression and report both results without modifying unrelated service code.
