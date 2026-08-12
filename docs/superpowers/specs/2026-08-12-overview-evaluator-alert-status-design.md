# Overview Evaluator Alert and Status Design

## Goal

Simplify Evaluation Overview configuration and make Trace status reflect evaluator outcomes consistently.

The page will remove the Evaluators/Sampling tab switch, place Sampling controls inside the Evaluators section, add a global minimum evaluator threshold and optional alert behavior, and replace raw Score previews with an evaluator pass summary. Trace status, filters, KPI counts, and failure statistics will use the same derived evaluator result.

All settings and alerts remain frontend mock state. No external notification API is called.

## Evaluators Section

The tab list and both tab panels are removed. One always-visible **Evaluators** section contains, in order:

1. evaluator enablement table;
2. evaluation policy controls;
3. Sampling rate slider and what-if metrics;
4. dropped-failure warning when applicable.

The evaluator table retains Name, Source, Version, and Enabled columns. Its description continues to show enabled evaluators over total configured evaluators.

### Evaluation Policy Controls

Below the evaluator table, add a compact policy row with:

- `Minimum score threshold` numeric input and range control;
- current threshold displayed as a percentage;
- `Send alert` checkbox;
- explanatory text stating that enabled alerts trigger when a scored Trace does not pass every enabled evaluator at the configured threshold.

The threshold is clamped to `0–100` and defaults to `80`. Send alert defaults to disabled.

These fields live in `EvaluationLayerSettings` as:

```ts
minimumEvaluatorScore: number;
sendEvaluatorAlert: boolean;
```

The mock store exposes validated setters. Fixtures and fixture validation include both fields.

## Evaluator Score Normalization

Only enabled evaluators participate in pass totals and derived Trace status.

Each enabled evaluator is considered **evaluated** only when its corresponding score source exists:

- Built-in evaluator: `trace.deterministicScores` contains at least one value.
- Langfuse evaluator: `trace.judge.scores` contains at least one value.

Each evaluator score is the arithmetic mean of its available dimensions after normalization:

- Built-in values are interpreted on a `0–1` scale and multiplied by `100`.
- Langfuse judge values are interpreted on a `1–5` scale and multiplied by `20`.
- All normalized dimension values are clamped to `0–100` before averaging.

An evaluated evaluator passes when its normalized average is greater than or equal to `minimumEvaluatorScore`.

The score summary contains:

```ts
type TraceEvaluatorSummary = {
  passed: number;
  evaluated: number;
  totalEnabled: number;
  allPassed: boolean;
  evaluatedAny: boolean;
  details: Array<{
    evaluatorId: string;
    evaluatorName: string;
    normalizedScore: number | null;
    passed: boolean | null;
    rawScores: Record<string, number> | null;
  }>;
};
```

`allPassed` is true only when at least one enabled evaluator was evaluated, every enabled evaluator produced a score, and all enabled evaluators met the threshold. Disabled evaluators do not count toward either side of the displayed ratio.

## Score Column

Move Score immediately before Status in the Trace table.

Before opening the Score popover:

- all enabled evaluators passed: show `{passed}/{totalEnabled}` in green;
- one or more enabled evaluators failed or did not produce a result: show `{passed}/{totalEnabled}` in red;
- no enabled evaluator produced a result: show `Not evaluated` in muted text;
- when alerts are enabled and the scored Trace is below policy, show a small red `Alert triggered` label beneath the ratio.

Clicking a scored ratio opens the existing bounded popover. The popover shows each enabled evaluator, normalized percentage, Pass/Fail/Not evaluated state, and its original raw score JSON. It no longer displays only one undifferentiated JSON object.

## Derived Trace Status

Introduce one pure status function used everywhere on Overview:

```ts
function overviewTraceStatus(
  trace: EvaluationLayerTrace,
  evaluators: EvaluationLayerEvaluator[],
  threshold: number,
): "PASS" | "FAIL" | "ERROR";
```

Rules, in priority order:

1. If the recorded Trace status is `ERROR`, return `ERROR`.
2. If at least one enabled evaluator produced a result and not every enabled evaluator passed, return `FAIL`.
3. Otherwise return `PASS`.

Consequences:

- `markedFailed` no longer independently produces Overview FAIL.
- A recorded non-error FAIL is shown as PASS when all enabled evaluators pass.
- A recorded PASS becomes FAIL when an enabled evaluator is below threshold or missing while another enabled evaluator produced a result.
- A Trace with no evaluator output is not classified as FAIL; it remains PASS unless it is an execution ERROR.

The Overview status filter, trace rows, Failures KPI, PASS/FAIL/ERROR counts, quality distribution bar, dropped-failure estimate, and alert state all consume this same derived status.

Other pages may continue to show recorded Trace status. This design changes only Evaluation Overview.

## Alert Behavior

Send alert is a mock policy indicator, not an external action.

An alert is considered triggered when:

- `sendEvaluatorAlert` is true;
- at least one enabled evaluator produced a result;
- the derived evaluator policy is not fully passing.

Execution ERROR without evaluator output does not trigger this evaluator-score alert. No alert history, destination configuration, email, webhook, toast, or backend persistence is added.

## Sampling Integration

Sampling controls retain all current behavior:

- range `0–100`, step `5`;
- deterministic captured/dropped preview;
- Captured, Estimated capture cost, Estimated saving, and Dropped failures metrics;
- warning when failure traces would be dropped;
- no actual trace data is removed.

Dropped failures use the new derived Overview status rather than recorded status or `markedFailed`.

## Architecture

Create `overview-evaluator-policy.ts` for pure normalization, summary, derived status, and alert calculations. This keeps table rendering and KPI logic from duplicating evaluator rules.

`overview-page.tsx` owns layout and store bindings. It consumes the pure helpers for each scoped Trace. The existing `traceScoreJson` helper remains available to other pages but is no longer the Overview Score cell's primary model.

No new route, backend endpoint, persistence mechanism, or external dependency is introduced.

## Testing

Pure helper tests cover:

- Built-in `0–1` and judge `1–5` normalization;
- average calculation and clamping;
- disabled evaluator exclusion;
- missing evaluator results;
- threshold equality passing;
- ERROR priority;
- evaluator-derived PASS/FAIL;
- alert trigger conditions.

Overview component tests verify:

- Evaluators/Sampling tabs are absent;
- Sampling slider and metrics are inside the Evaluators section;
- threshold and Send alert controls update mock settings;
- Score appears before Status;
- closed Score cells display pass/total rather than raw JSON;
- incomplete or failed evaluator results render red;
- Score popover shows normalized and raw details;
- row Status, status filters, Failures KPI, quality bar, and dropped-failure metrics use derived status;
- Alert triggered appears only when enabled and below threshold;
- runtime ERROR remains ERROR.

Run focused policy, Overview, fixture, and mock-store tests, then the Control type check and browser verification.

## Out of Scope

- sending email, webhook, Slack, or other real notifications;
- configuring alert recipients or alert history;
- per-evaluator thresholds or weights;
- persisting Overview settings to a backend;
- changing recorded Trace status in fixtures or the mock store;
- changing Trace status presentation outside Evaluation Overview.
