# Evaluation Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an isolated `Evaluation` sidebar layer whose information formats, field order, control placement, workflows, and mock behavior match AgentEval commit `a78031f`, while every concrete component uses TaskLattice styling.

**Architecture:** A dedicated `apps/control/src/features/evaluation-layer` feature owns typed fixtures, an external-store provider, deterministic scenarios, and all six page domains. A route-layout provider under `/$projectId/evaluation` keeps mock state across the six routes without mounting it on existing pages. Existing shared visual primitives are reused, but existing `features/evaluations` and `features/traces` business components and state are not imported.

**Tech Stack:** React 19, TypeScript, TanStack Router, Vitest, Testing Library, existing TaskLattice shadcn/Radix components, Tailwind CSS, Lucide icons.

## Global Constraints

- The new sidebar group label is exactly `Evaluation`.
- Child labels and order are exactly `Target`, `Dataset`, `Evaluation`, `Overview`, `Trace`, `Settings`.
- Displayed data formats, field names, field order, column order, section order, control placement, panel placement, and relative layout match AgentEval commit `a78031f`.
- Concrete typography, color, spacing, borders, controls, tables, cards, tabs, sheets, dialogs, responsive behavior, and dark mode use TaskLattice primitives and tokens.
- All records and actions are frontend-only deterministic mock behavior; do not call APIs, Prisma, databases, websocket endpoints, model providers, Langfuse, Tools, MCP servers, environment files, or browser storage.
- Do not import business components or mutable state from `apps/control/src/features/evaluations` or `apps/control/src/features/traces`.
- Existing `Agentic`, `Security`, `Observer`, `Traces`, `Evaluations`, and `Cost` behavior must remain unchanged.
- Initial labels and explanatory copy follow AgentEval; copy changes are a later task.
- Each task starts with a failing focused test, finishes with focused verification, and commits only its own files.

---

## File Structure

Create the following focused feature tree:

```text
apps/control/src/features/evaluation-layer/
  model.ts
  fixtures.ts
  fixture-validation.ts
  fixture-validation.test.ts
  mock-store.ts
  mock-store.test.ts
  mock-provider.tsx
  scenario-engine.ts
  scenario-engine.test.ts
  evaluation-layer-error-boundary.tsx
  shared/evaluation-page-frame.tsx
  shared/evaluation-status.tsx
  targets/target-view-model.ts
  targets/target-view-model.test.ts
  targets/target-list.tsx
  targets/target-detail.tsx
  targets/target-editor-sheet.tsx
  datasets/dataset-view-model.ts
  datasets/dataset-view-model.test.ts
  datasets/dataset-list.tsx
  datasets/dataset-detail.tsx
  datasets/case-editor-sheet.tsx
  datasets/import-cases-dialog.tsx
  runs/run-view-model.ts
  runs/run-view-model.test.ts
  runs/evaluation-list.tsx
  runs/evaluation-setup.tsx
  runs/evaluation-progress.tsx
  runs/evaluation-run-detail.tsx
  reports/report-view-model.ts
  reports/report-view-model.test.ts
  reports/report-list.tsx
  reports/report-detail.tsx
  reports/report-comparison.tsx
  reports/reflection-editor.tsx
  overview/overview-view-model.ts
  overview/overview-view-model.test.ts
  overview/overview-page.tsx
  traces/trace-analysis.ts
  traces/trace-analysis.test.ts
  traces/trace-view-model.ts
  traces/trace-view-model.test.ts
  traces/trace-list.tsx
  traces/trace-detail.tsx
  traces/span-tree.tsx
  traces/trace-analysis-panel.tsx
  settings/settings-page.tsx
  settings/settings-page.test.tsx
```

Create thin route files under `apps/control/src/routes/$projectId/evaluation*` and modify only the sidebar and breadcrumb maps outside the new feature.

---

### Task 1: Typed fixture graph and validation

**Files:**
- Create: `apps/control/src/features/evaluation-layer/model.ts`
- Create: `apps/control/src/features/evaluation-layer/fixtures.ts`
- Create: `apps/control/src/features/evaluation-layer/fixture-validation.ts`
- Create: `apps/control/src/features/evaluation-layer/fixture-validation.test.ts`
- Read completely for parity: `../AgentEval/src/workbench_models.py`
- Read completely for fixture values: `../AgentEval/src/demo_workspace.py`

**Interfaces:**
- Produces: `EvaluationLayerState`, `EvaluationLayerTarget`, `EvaluationLayerTargetRevision`, `EvaluationLayerDataset`, `EvaluationLayerDatasetRevision`, `EvaluationLayerCase`, `EvaluationLayerRun`, `EvaluationLayerReport`, `EvaluationLayerReflection`, `EvaluationLayerTrace`, `EvaluationLayerSpan`, `EvaluationLayerSettings`.
- Produces: `evaluationLayerFixtures`, `cloneEvaluationLayerFixtures()`, `validateEvaluationLayerState(state): string[]`.

- [ ] **Step 1: Write the failing connected-graph test**

```ts
import { describe, expect, it } from "vitest";
import { evaluationLayerFixtures } from "./fixtures";
import {
  cloneEvaluationLayerFixtures,
  validateEvaluationLayerState,
} from "./fixture-validation";

describe("Evaluation layer fixtures", () => {
  it("form one valid Target-to-Trace graph", () => {
    expect(validateEvaluationLayerState(evaluationLayerFixtures)).toEqual([]);
    expect(evaluationLayerFixtures.targets).not.toHaveLength(0);
    expect(evaluationLayerFixtures.traces.some((trace) => trace.spans.length > 0)).toBe(true);
  });

  it("clone into isolated in-memory graphs", () => {
    const first = cloneEvaluationLayerFixtures();
    const second = cloneEvaluationLayerFixtures();
    first.targets[0]!.name = "Changed only here";
    expect(second.targets[0]!.name).not.toBe("Changed only here");
  });

  it("reports a broken trace-to-run reference with a stable path", () => {
    const state = cloneEvaluationLayerFixtures();
    state.traces[0]!.runId = "missing-run";
    expect(validateEvaluationLayerState(state)).toContain(
      `traces.${state.traces[0]!.id}.runId: missing-run`,
    );
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/fixture-validation.test.ts`

Expected: FAIL because `fixtures.ts` and `fixture-validation.ts` do not exist.

- [ ] **Step 3: Define the complete state contract**

Add exact domain types with this root shape:

```ts
export interface EvaluationLayerState {
  targets: EvaluationLayerTarget[];
  targetRevisions: EvaluationLayerTargetRevision[];
  datasets: EvaluationLayerDataset[];
  datasetRevisions: EvaluationLayerDatasetRevision[];
  runs: EvaluationLayerRun[];
  reports: EvaluationLayerReport[];
  reflections: EvaluationLayerReflection[];
  traces: EvaluationLayerTrace[];
  evaluators: EvaluationLayerEvaluator[];
  settings: EvaluationLayerSettings;
}
```

The trace contract must include `result` evidence and raw spans so Analysis is
fully frontend-derived:

```ts
export interface EvaluationLayerTrace {
  id: string;
  runId: string;
  caseId: string;
  targetId: string;
  status: "PASS" | "FAIL" | "ERROR";
  startedAt: string;
  latencyMs?: number;
  costUsd: number;
  response: string;
  deterministicScores: Record<string, number>;
  deterministicReasons: Record<string, string>;
  toolEvidence: EvaluationLayerToolEvidence[];
  judge?: EvaluationLayerJudge;
  spans: EvaluationLayerSpan[];
  markedFailed: boolean;
}
```

- [ ] **Step 4: Build source-faithful fixtures and reference validation**

Encode the AgentEval demo graph with at least two Targets, version history, two
Datasets, draft and published revisions, completed and failed Runs, Reports,
Reflection suggestions, built-in and Langfuse evaluator fixtures, one clean
trace, one deterministic failure, one Tool failure, and one error span. Implement
deep clone with `structuredClone` and validate every foreign key plus current
revision pointer.

```ts
export function cloneEvaluationLayerFixtures(): EvaluationLayerState {
  return structuredClone(evaluationLayerFixtures);
}
```

- [ ] **Step 5: Run focused validation**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/fixture-validation.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 6: Commit the fixture foundation**

```powershell
git add apps/control/src/features/evaluation-layer/model.ts apps/control/src/features/evaluation-layer/fixtures.ts apps/control/src/features/evaluation-layer/fixture-validation.ts apps/control/src/features/evaluation-layer/fixture-validation.test.ts
git commit -m "feat(control): add evaluation layer fixtures"
```

---

### Task 2: Independent mock store, provider, and scenario engine

**Files:**
- Create: `apps/control/src/features/evaluation-layer/mock-store.ts`
- Create: `apps/control/src/features/evaluation-layer/mock-store.test.ts`
- Create: `apps/control/src/features/evaluation-layer/mock-provider.tsx`
- Create: `apps/control/src/features/evaluation-layer/scenario-engine.ts`
- Create: `apps/control/src/features/evaluation-layer/scenario-engine.test.ts`
- Create: `apps/control/src/features/evaluation-layer/evaluation-layer-error-boundary.tsx`

**Interfaces:**
- Consumes: `EvaluationLayerState` and `cloneEvaluationLayerFixtures()` from Task 1.
- Produces: `createEvaluationLayerStore(initialState, dependencies?)`.
- Produces: `EvaluationLayerStore` with `getState`, `subscribe`, `resetDemo`, and typed commands.
- Produces: `EvaluationLayerProvider`, `useEvaluationLayerStore()`, `useEvaluationLayerState()`.
- Produces: `advanceEvaluationScenario(store, runId)`.

- [ ] **Step 1: Write failing store-isolation and flow tests**

```ts
import { describe, expect, it } from "vitest";
import { cloneEvaluationLayerFixtures } from "./fixture-validation";
import { createEvaluationLayerStore } from "./mock-store";

describe("EvaluationLayerStore", () => {
  it("publishes a Dataset revision without mutating the previous revision", () => {
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => "dataset-revision-new",
      now: () => "2026-08-04T10:00:00.000Z",
    });
    const dataset = store.getState().datasets[0]!;
    const oldRevision = store.getState().datasetRevisions.find(
      (revision) => revision.id === dataset.currentRevisionId,
    )!;
    const result = store.publishDatasetRevision(dataset.id);
    expect(result.ok).toBe(true);
    expect(oldRevision.cases).toEqual(
      cloneEvaluationLayerFixtures().datasetRevisions.find(
        (revision) => revision.id === oldRevision.id,
      )!.cases,
    );
  });

  it("resetDemo restores fixtures without touching another store", () => {
    const first = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
    const second = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
    first.markTraceFailed(first.getState().traces[0]!.id, true);
    first.resetDemo();
    expect(first.getState()).toEqual(cloneEvaluationLayerFixtures());
    expect(second.getState()).toEqual(cloneEvaluationLayerFixtures());
  });
});
```

- [ ] **Step 2: Run store tests and confirm the export failure**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/mock-store.test.ts`

Expected: FAIL because `createEvaluationLayerStore` is missing.

- [ ] **Step 3: Implement the public store interface**

```ts
export interface EvaluationLayerStore {
  getState(): EvaluationLayerState;
  subscribe(listener: () => void): () => void;
  createTarget(input: CreateTargetInput): CommandResult<{ targetId: string }>;
  createTargetRevision(targetId: string, input: TargetRevisionInput): CommandResult<{ revisionId: string }>;
  createDataset(input: CreateDatasetInput): CommandResult<{ datasetId: string }>;
  updateDatasetDraft(datasetId: string, input: DatasetDraftInput): CommandResult;
  createCase(datasetId: string, input: DatasetCaseInput): CommandResult<{ caseId: string }>;
  updateCase(datasetId: string, caseId: string, input: DatasetCaseInput): CommandResult;
  duplicateCase(datasetId: string, caseId: string): CommandResult<{ caseId: string }>;
  deleteCase(datasetId: string, caseId: string): CommandResult;
  importCases(datasetId: string, json: string): CommandResult<{ imported: number }>;
  generateCases(datasetId: string): CommandResult<{ generated: number }>;
  publishDatasetRevision(datasetId: string): CommandResult<{ revisionId: string }>;
  createRun(input: CreateRunInput): CommandResult<{ runId: string }>;
  advanceRun(runId: string): CommandResult<{ complete: boolean }>;
  submitReflection(reportId: string, suggestionIds: string[]): CommandResult<{ revisionId: string }>;
  finishReflectionWithoutChanges(reportId: string): CommandResult;
  markTraceFailed(traceId: string, marked: boolean): CommandResult;
  testSettingsConnection(): CommandResult<{ latencyMs: number }>;
  saveSettings(input: EvaluationLayerSettings): CommandResult;
  resetDemo(): void;
}
```

Use immutable state replacement and stable typed failures:

```ts
export type CommandResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE" };
```

- [ ] **Step 4: Write and run failing scenario tests**

Test that successive `advanceRun` calls progress one case at a time, create one
Report and associated traces exactly once, and enable Reflection only after the
Report exists.

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/scenario-engine.test.ts`

Expected: FAIL before `scenario-engine.ts` is implemented.

- [ ] **Step 5: Implement deterministic scenario generation and provider**

Use injected dependencies:

```ts
export interface EvaluationLayerDependencies {
  id(): string;
  now(): string;
}
```

Mount the store with `useMemo`, expose it with `useSyncExternalStore`, and make
the error boundary render TaskLattice's existing `EmptyState` plus a `Reset
Evaluation demo` action that calls only `resetDemo()`.

- [ ] **Step 6: Run store and scenario tests**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/mock-store.test.ts src/features/evaluation-layer/scenario-engine.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the mock engine**

```powershell
git add apps/control/src/features/evaluation-layer/mock-store.ts apps/control/src/features/evaluation-layer/mock-store.test.ts apps/control/src/features/evaluation-layer/mock-provider.tsx apps/control/src/features/evaluation-layer/scenario-engine.ts apps/control/src/features/evaluation-layer/scenario-engine.test.ts apps/control/src/features/evaluation-layer/evaluation-layer-error-boundary.tsx
git commit -m "feat(control): add isolated evaluation mock engine"
```

---

### Task 3: Sidebar group, route layout, breadcrumbs, and shared frame

**Files:**
- Modify: `apps/control/src/components/layout/app-shell.tsx`
- Modify: `apps/control/src/components/layout/header-breadcrumb.tsx`
- Modify: `apps/control/src/components/layout/header-breadcrumb.test.ts`
- Create: `apps/control/src/components/layout/app-shell-navigation.test.ts`
- Create: `apps/control/src/features/evaluation-layer/shared/evaluation-page-frame.tsx`
- Create: `apps/control/src/features/evaluation-layer/shared/evaluation-status.tsx`
- Create: `apps/control/src/routes/$projectId/evaluation.tsx`
- Create: `apps/control/src/routes/$projectId/evaluation/index.tsx`
- Create: `apps/control/src/routes/-evaluation-layer-routing.test.ts`

**Interfaces:**
- Consumes: `EvaluationLayerProvider` and `EvaluationLayerErrorBoundary` from Task 2.
- Produces: exported `projectNavGroups` and `ProjectRoute` entries for the six new routes.
- Produces: an `/$projectId/evaluation` layout route whose provider wraps only its descendants.
- Produces: `EvaluationLayerPageFrame` and `EvaluationLayerStatusBadge`.

- [ ] **Step 1: Write the failing navigation-order test**

```ts
import { describe, expect, it } from "vitest";
import { projectNavGroups } from "./app-shell";

describe("Evaluation navigation", () => {
  it("adds an isolated group in AgentEval order", () => {
    const group = projectNavGroups.find((item) => item.label === "Evaluation");
    expect(group?.items.map((item) => item.label)).toEqual([
      "Target",
      "Dataset",
      "Evaluation",
      "Overview",
      "Trace",
      "Settings",
    ]);
    expect(projectNavGroups.find((item) => item.label === "Observer")?.items.map((item) => item.label))
      .toEqual(["Traces", "Evaluations", "Cost"]);
  });
});
```

- [ ] **Step 2: Run and confirm the missing export/group failure**

Run: `npm test --workspace @tasklattice/control -- --run src/components/layout/app-shell-navigation.test.ts`

Expected: FAIL because `projectNavGroups` is not exported and `Evaluation` does not exist.

- [ ] **Step 3: Add the exact sidebar group without editing Observer**

Extend `ProjectRoute` with the six list routes and insert this group after
`Security` and before `Observer`:

```ts
{
  label: "Evaluation",
  items: [
    { icon: Target, label: "Target", to: "/$projectId/evaluation/targets" },
    { icon: Database, label: "Dataset", to: "/$projectId/evaluation/datasets" },
    { icon: FlaskConical, label: "Evaluation", to: "/$projectId/evaluation/runs" },
    { icon: ChartNoAxesCombined, label: "Overview", to: "/$projectId/evaluation/overview" },
    { icon: Waypoints, label: "Trace", to: "/$projectId/evaluation/traces" },
    { icon: Settings2, label: "Settings", to: "/$projectId/evaluation/settings" },
  ],
}
```

Treat every `/$projectId/evaluation/*` child as active only for its own prefix.

- [ ] **Step 4: Add the provider layout and default redirect**

```tsx
export const Route = createFileRoute("/$projectId/evaluation")({
  component: EvaluationLayerLayout,
});

function EvaluationLayerLayout() {
  const { projectId } = Route.useParams();
  return (
    <EvaluationLayerProvider projectId={projectId}>
      <EvaluationLayerErrorBoundary>
        <Outlet />
      </EvaluationLayerErrorBoundary>
    </EvaluationLayerProvider>
  );
}
```

The index route throws a TanStack `redirect` to
`/$projectId/evaluation/targets` with the current `projectId`.

- [ ] **Step 5: Add breadcrumb and route behavior tests**

Assert that `/individual/evaluation/traces/trace-1` resolves labels
`Evaluation`, `Trace`, `trace-1`. Exercise the exported active-route helper
with every list and detail path, and verify that only the matching child item
is active. Route file registration itself is verified by TanStack route-tree
generation during typecheck/build and by direct browser navigation in Task 11;
do not grep route source text.

Run: `npm test --workspace @tasklattice/control -- --run src/components/layout/header-breadcrumb.test.ts src/routes/-evaluation-layer-routing.test.ts`

Expected: PASS after implementation.

- [ ] **Step 6: Run all navigation-focused tests**

Run: `npm test --workspace @tasklattice/control -- --run src/components/layout/app-shell-navigation.test.ts src/components/layout/header-breadcrumb.test.ts src/routes/-evaluation-layer-routing.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit navigation and layout**

```powershell
git add apps/control/src/components/layout/app-shell.tsx apps/control/src/components/layout/app-shell-navigation.test.ts apps/control/src/components/layout/header-breadcrumb.tsx apps/control/src/components/layout/header-breadcrumb.test.ts apps/control/src/features/evaluation-layer/shared 'apps/control/src/routes/$projectId/evaluation.tsx' 'apps/control/src/routes/$projectId/evaluation/index.tsx' apps/control/src/routes/-evaluation-layer-routing.test.ts
git commit -m "feat(control): add evaluation sidebar layer"
```

---

### Task 4: Target list, detail, and revision editor

**Files:**
- Create: `apps/control/src/features/evaluation-layer/targets/target-view-model.ts`
- Create: `apps/control/src/features/evaluation-layer/targets/target-view-model.test.ts`
- Create: `apps/control/src/features/evaluation-layer/targets/target-list.tsx`
- Create: `apps/control/src/features/evaluation-layer/targets/target-detail.tsx`
- Create: `apps/control/src/features/evaluation-layer/targets/target-editor-sheet.tsx`
- Create: `apps/control/src/routes/$projectId/evaluation/targets/index.tsx`
- Create: `apps/control/src/routes/$projectId/evaluation/targets/$targetId.tsx`
- Read completely for parity: `../AgentEval/src/ui/agents.py`

**Interfaces:**
- Consumes: target records, revisions, Reports, and `createTarget` / `createTargetRevision` commands.
- Produces: `targetListRows(state)`, `targetDetailView(state, targetId)`.
- Produces: `EvaluationTargetList`, `EvaluationTargetDetail`, `EvaluationTargetEditorSheet`.

- [ ] **Step 1: Write failing view-model tests for source field order**

```ts
it("projects the AgentEval Target list columns in order", () => {
  const row = targetListRows(cloneEvaluationLayerFixtures())[0]!;
  expect(Object.keys(row)).toEqual([
    "id", "name", "model", "revision", "tools", "mcpServers",
    "knowledgeBases", "lastStatus", "passRate", "evaluationCost",
  ]);
});
```

Also assert quality trend, cost trend, Report history, and immutable revisions
in `targetDetailView`.

- [ ] **Step 2: Run and confirm missing view-model failure**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/targets/target-view-model.test.ts`

Expected: FAIL because `target-view-model.ts` is missing.

- [ ] **Step 3: Implement view models and source-faithful component placement**

Build the Target list with TaskLattice `Card`/table primitives but keep
AgentEval's data fields and order. Build detail sections in this order: identity
and status, quality/cost metrics, current revision, Model, Tools, MCP Servers,
Knowledge Bases, revision history, trends, Report history. Use a TaskLattice
`Sheet` for create/revise while preserving AgentEval's form field order.

- [ ] **Step 4: Wire thin routes and invalid-ID state**

The list route renders `EvaluationTargetList`. The detail route reads
`$targetId`, renders `EvaluationTargetDetail`, and shows an `EmptyState` with a
link to `/$projectId/evaluation/targets` for missing IDs.

- [ ] **Step 5: Run Target tests and typecheck the feature**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/targets/target-view-model.test.ts`

Run: `npm run typecheck --workspace @tasklattice/control`

Expected: PASS.

- [ ] **Step 6: Commit Target parity**

```powershell
git add apps/control/src/features/evaluation-layer/targets 'apps/control/src/routes/$projectId/evaluation/targets'
git commit -m "feat(control): add evaluation target workspace"
```

---

### Task 5: Dataset list, draft, schema, history, import, generation, and publish

**Files:**
- Create: `apps/control/src/features/evaluation-layer/datasets/dataset-view-model.ts`
- Create: `apps/control/src/features/evaluation-layer/datasets/dataset-view-model.test.ts`
- Create: `apps/control/src/features/evaluation-layer/datasets/dataset-list.tsx`
- Create: `apps/control/src/features/evaluation-layer/datasets/dataset-detail.tsx`
- Create: `apps/control/src/features/evaluation-layer/datasets/case-editor-sheet.tsx`
- Create: `apps/control/src/features/evaluation-layer/datasets/import-cases-dialog.tsx`
- Create: `apps/control/src/routes/$projectId/evaluation/datasets/index.tsx`
- Create: `apps/control/src/routes/$projectId/evaluation/datasets/$datasetId.tsx`
- Read completely for parity: `../AgentEval/src/ui/datasets.py`

**Interfaces:**
- Consumes: Dataset records/revisions/Cases/Runs/Reports and all Dataset commands from Task 2.
- Produces: `datasetListRows(state)`, `datasetDetailView(state, datasetId)`.
- Produces: `EvaluationDatasetList`, `EvaluationDatasetDetail`, `EvaluationCaseEditorSheet`, `EvaluationImportCasesDialog`.

- [ ] **Step 1: Write failing Dataset projection tests**

Assert list fields in AgentEval order and detail local views exactly
`Draft cases`, `Schema`, `Evaluation history`. Assert the history projection
contains status, pass rate, total cases, evaluation cost, and Report ID.

```ts
expect(datasetDetailView(state, dataset.id)?.tabs).toEqual([
  "Draft cases",
  "Schema",
  "Evaluation history",
]);
```

- [ ] **Step 2: Run and confirm missing Dataset implementation**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/datasets/dataset-view-model.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement source-positioned Dataset screens with TaskLattice components**

Keep the list columns and detail action locations from AgentEval. Use
TaskLattice `Tabs`, `Table`, `Sheet`, `Dialog`, form controls, badges, and
toasts. Preserve field order for create/edit Case, JSON import, generation
review, schema, publish, Evaluate, and Report navigation.

- [ ] **Step 4: Wire every visible action to the mock store**

Verify create, edit, duplicate, delete, import, generate, publish, Evaluate, and
open-Report actions mutate only `EvaluationLayerStore`. Invalid JSON and
duplicate inputs render the exact typed command error; generated cases are
deterministic fixtures.

- [ ] **Step 5: Run Dataset and store regression tests**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/datasets/dataset-view-model.test.ts src/features/evaluation-layer/mock-store.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Dataset parity**

```powershell
git add apps/control/src/features/evaluation-layer/datasets 'apps/control/src/routes/$projectId/evaluation/datasets'
git commit -m "feat(control): add evaluation dataset workspace"
```

---

### Task 6: Evaluation configuration, evaluator selection, progress, and history

**Files:**
- Create: `apps/control/src/features/evaluation-layer/runs/run-view-model.ts`
- Create: `apps/control/src/features/evaluation-layer/runs/run-view-model.test.ts`
- Create: `apps/control/src/features/evaluation-layer/runs/evaluation-list.tsx`
- Create: `apps/control/src/features/evaluation-layer/runs/evaluation-setup.tsx`
- Create: `apps/control/src/features/evaluation-layer/runs/evaluation-progress.tsx`
- Create: `apps/control/src/features/evaluation-layer/runs/evaluation-run-detail.tsx`
- Create: `apps/control/src/routes/$projectId/evaluation/runs/index.tsx`
- Create: `apps/control/src/routes/$projectId/evaluation/runs/new.tsx`
- Create: `apps/control/src/routes/$projectId/evaluation/runs/$runId.tsx`
- Read completely for parity: `../AgentEval/src/ui/runs.py`

**Interfaces:**
- Consumes: Targets, Dataset revisions, evaluator fixtures, Runs, `createRun`, and `advanceRun`.
- Produces: `evaluationListRows(state)`, `evaluationSetupOptions(state)`, `evaluationProgressView(state, runId)`.

- [ ] **Step 1: Write failing setup and progress tests**

Assert immutable revision labels, evaluator source choices `Built-in` and
`Langfuse`, selected evaluator IDs, judge model copy, history field order, and
one-case-at-a-time progress.

```ts
expect(evaluationSetupOptions(state).evaluatorSources).toEqual([
  "Built-in",
  "Langfuse",
]);
expect(evaluationProgressView(state, run.id)?.recentResults.map((item) => item.caseId))
  .toEqual(run.results.filter((item) => item.status !== "PENDING").map((item) => item.caseId));
```

- [ ] **Step 2: Run and confirm missing Run view models**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/runs/run-view-model.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement AgentEval field/layout parity**

Keep run history columns, `New evaluation` placement, dialog field order,
immutable context summary, evaluator source control, evaluator multiselect,
judge display, start button availability, progress metrics, current Case, and
completion feedback in AgentEval positions. Render them with TaskLattice cards,
tables, dialogs, progress, selects, and badges.

- [ ] **Step 4: Wire routes and deterministic progress**

The new route creates a run and navigates to its detail. The detail route
advances through public store commands and navigates to its Report after
completion. No timer, API, worker, or network call controls results.

- [ ] **Step 5: Run focused Run tests**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/runs/run-view-model.test.ts src/features/evaluation-layer/scenario-engine.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Evaluation run parity**

```powershell
git add apps/control/src/features/evaluation-layer/runs 'apps/control/src/routes/$projectId/evaluation/runs'
git commit -m "feat(control): add evaluation run workflow"
```

---

### Task 7: Reports, comparison, evidence, cost, and Reflection

**Files:**
- Create: `apps/control/src/features/evaluation-layer/reports/report-view-model.ts`
- Create: `apps/control/src/features/evaluation-layer/reports/report-view-model.test.ts`
- Create: `apps/control/src/features/evaluation-layer/reports/report-list.tsx`
- Create: `apps/control/src/features/evaluation-layer/reports/report-detail.tsx`
- Create: `apps/control/src/features/evaluation-layer/reports/report-comparison.tsx`
- Create: `apps/control/src/features/evaluation-layer/reports/reflection-editor.tsx`
- Create: `apps/control/src/routes/$projectId/evaluation/reports/$reportId.tsx`
- Read completely for parity: `../AgentEval/src/ui/reports.py`

**Interfaces:**
- Consumes: Reports, Runs, Cases, traces, Reflection records, `submitReflection`, and `finishReflectionWithoutChanges`.
- Produces: `reportListRows(state)`, `reportDetailView(state, reportId)`, `reportComparisonView(state, reportId, baselineId)`, `reflectionView(state, reportId)`.

- [ ] **Step 1: Write failing Report ordering and comparison tests**

Assert source section order:

```ts
expect(reportDetailView(state, report.id)?.sections).toEqual([
  "Summary",
  "Test Results",
  "Failure reasons",
  "Tool Evidence",
  "LLM Judge",
  "Comparison",
  "Usage & Cost",
  "Reflection",
]);
```

Also assert shared-case pass-rate delta, regressions, resolved failures,
unchanged failures, added/removed Cases, configuration diff, and cost delta.

- [ ] **Step 2: Run and confirm missing Report implementation**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/reports/report-view-model.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement source-positioned Report presentation**

Render sections in the asserted order. Preserve AgentEval value formats,
optional-evidence `Not available` states, case evidence, Langfuse trace caption,
comparison control location, cost labels, and Reflection selection/preview
placement. Use TaskLattice cards, tables, badges, tabs, and checkboxes.

- [ ] **Step 4: Wire Reflection outcomes**

Submitting selected suggestions creates one immutable Target revision and marks
the Reflection `SUBMITTED`. Finishing without changes marks it `NO_CHANGES` and
creates no revision. Repeating either action returns `CONFLICT` and leaves state
unchanged.

- [ ] **Step 5: Run Report and store tests**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/reports/report-view-model.test.ts src/features/evaluation-layer/mock-store.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Report parity**

```powershell
git add apps/control/src/features/evaluation-layer/reports 'apps/control/src/routes/$projectId/evaluation/reports'
git commit -m "feat(control): add evaluation reports and reflection"
```

---

### Task 8: Overview metrics

**Files:**
- Create: `apps/control/src/features/evaluation-layer/overview/overview-view-model.ts`
- Create: `apps/control/src/features/evaluation-layer/overview/overview-view-model.test.ts`
- Create: `apps/control/src/features/evaluation-layer/overview/overview-page.tsx`
- Create: `apps/control/src/routes/$projectId/evaluation/overview.tsx`
- Read completely for parity: `../AgentEval/src/ui/observations.py` lines 1-36.

**Interfaces:**
- Consumes: current Target selection, traces, and mock state.
- Produces: `overviewView(state, targetId?)` and `EvaluationOverviewPage`.

- [ ] **Step 1: Write failing metric-format tests**

```ts
expect(overviewView(state, target.id)).toEqual({
  traceCount: 2,
  observationCount: expect.any(Number),
  failureCount: expect.any(Number),
  totalCost: expect.stringMatching(/^\$\d+\.\d{4}$/),
  empty: false,
});
```

Add an empty-target test whose view uses AgentEval's empty-state copy.

- [ ] **Step 2: Run and confirm missing Overview implementation**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/overview/overview-view-model.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement metric placement with TaskLattice cards**

Keep AgentEval order `Traces`, `Observations`, `Failures`, `Cost`. Use
TaskLattice metric cards and page frame, with populated and empty states derived
only from the new fixture graph.

- [ ] **Step 4: Run Overview tests and commit**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/overview/overview-view-model.test.ts`

Expected: PASS.

```powershell
git add apps/control/src/features/evaluation-layer/overview 'apps/control/src/routes/$projectId/evaluation/overview.tsx'
git commit -m "feat(control): add evaluation overview"
```

---

### Task 9: Trace list, span detail, waterfall, and latest Analysis

**Files:**
- Create: `apps/control/src/features/evaluation-layer/traces/trace-analysis.ts`
- Create: `apps/control/src/features/evaluation-layer/traces/trace-analysis.test.ts`
- Create: `apps/control/src/features/evaluation-layer/traces/trace-view-model.ts`
- Create: `apps/control/src/features/evaluation-layer/traces/trace-view-model.test.ts`
- Create: `apps/control/src/features/evaluation-layer/traces/trace-list.tsx`
- Create: `apps/control/src/features/evaluation-layer/traces/trace-detail.tsx`
- Create: `apps/control/src/features/evaluation-layer/traces/span-tree.tsx`
- Create: `apps/control/src/features/evaluation-layer/traces/trace-analysis-panel.tsx`
- Create: `apps/control/src/routes/$projectId/evaluation/traces/index.tsx`
- Create: `apps/control/src/routes/$projectId/evaluation/traces/$traceId.tsx`
- Read completely for parity: `../AgentEval/src/ui/observations.py`

**Interfaces:**
- Consumes: `EvaluationLayerTrace`, `markTraceFailed`, and Task 1 evidence types.
- Produces: `traceListRows(state, targetId?)`, `traceDetailView(state, traceId)`, `buildSpanRows(trace)`, `traceImprovementSuggestions(trace)`.
- Produces: `TraceImprovementSuggestion` with `title`, `evidence`, `target`, and `change`.

- [ ] **Step 1: Write failing span ordering and recommendation tests**

```ts
it("preserves parent-child order and keeps orphan spans", () => {
  expect(buildSpanRows(trace).map(({ span, depth }) => [span.id, depth])).toEqual([
    ["root", 0],
    ["tool-child", 1],
    ["orphan", 0],
  ]);
});

it("turns failed evidence into conservative changes", () => {
  const suggestions = traceImprovementSuggestions(failedTrace);
  expect(suggestions.some((item) => item.target === "Target tool policy")).toBe(true);
  expect(suggestions.some((item) => item.target === "Runtime error handling")).toBe(true);
});

it("does not invent changes for a clean trace", () => {
  expect(traceImprovementSuggestions(cleanTrace)).toEqual([]);
});
```

- [ ] **Step 2: Run and confirm missing Trace helpers**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/traces/trace-analysis.test.ts src/features/evaluation-layer/traces/trace-view-model.test.ts`

Expected: FAIL.

- [ ] **Step 3: Port the exact evidence rules into pure TypeScript**

Match AgentEval `_trace_improvement_suggestions` from commit `e446dc1`:

```ts
export interface TraceImprovementSuggestion {
  title: string;
  evidence: string;
  target:
    | "Target tool policy"
    | "Target system prompt / guard policy"
    | "Target system prompt"
    | "Tool binding / execution policy"
    | "Runtime error handling"
    | "Agent response contract";
  change: string;
}
```

Implement failed deterministic checks, permission/safety classification, Tool
not-executed/failed/invalid-receipt cases, judge dimensions below 4, error spans,
empty response, and title/target de-duplication.

- [ ] **Step 4: Implement source layout with TaskLattice styling**

Keep list columns `Trace`, `Case`, `Status`, `Started`, `Observations`,
`Latency`, `Cost`, action. Keep detail actions `Mark fail`, `Analysis`, `Close`.
Keep metric positions `Status`, `Observations`, `Latency`, `Cost`; then Analysis,
Span tree, Response, Tool observations, Judge observation, Deterministic scores.
Use TaskLattice tables, cards, tabs, badges, buttons, and responsive layout.

Analysis shows `Spans`, `Errors`, `Tool calls`, `Judge`, deterministic findings,
and `Recommended changes`. Its active action reads `Close analysis`; the panel
contains `Back to trace detail`. Clean traces render `No evidence-backed change
is recommended for this trace.`

- [ ] **Step 5: Wire detail routes and mark-fail state**

List selection navigates to `/$projectId/evaluation/traces/$traceId`. Closing
navigates back to the list. Marking failure updates only the new mock store.
Unknown trace IDs render feature-local not-found state.

- [ ] **Step 6: Run Trace tests and typecheck**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/traces/trace-analysis.test.ts src/features/evaluation-layer/traces/trace-view-model.test.ts`

Run: `npm run typecheck --workspace @tasklattice/control`

Expected: PASS.

- [ ] **Step 7: Commit Trace parity**

```powershell
git add apps/control/src/features/evaluation-layer/traces 'apps/control/src/routes/$projectId/evaluation/traces'
git commit -m "feat(control): add evaluation trace analysis"
```

---

### Task 10: Mock Settings page

**Files:**
- Create: `apps/control/src/features/evaluation-layer/settings/settings-page.tsx`
- Create: `apps/control/src/features/evaluation-layer/settings/settings-page.test.tsx`
- Create: `apps/control/src/routes/$projectId/evaluation/settings.tsx`
- Read completely for parity: `../AgentEval/src/ui/settings_page.py`

**Interfaces:**
- Consumes: `EvaluationLayerSettings`, `testSettingsConnection`, and `saveSettings`.
- Produces: `EvaluationSettingsPage`.

- [ ] **Step 1: Write failing form-order and mock-action tests**

Render under `EvaluationLayerProvider`, mark the four controls with
`data-evaluation-settings-field`, assert their DOM order, then submit the mock
test action and assert deterministic latency feedback.

```tsx
const fields = Array.from(
  container.querySelectorAll("[data-evaluation-settings-field]"),
).map((item) => item.getAttribute("data-evaluation-settings-field"));
expect(fields).toEqual(["Provider", "Base URL", "Model", "API key"]);
expect(screen.getByRole("button", { name: "Test connection" })).toBeEnabled();
expect(screen.getByRole("button", { name: "Save and use" })).toBeDisabled();
```

- [ ] **Step 2: Run and confirm missing Settings page**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/settings/settings-page.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement the source-positioned form with TaskLattice inputs**

Preserve AgentEval status rows `LLM`, `Langfuse`, `Database`, `Demo fixture`,
then form fields `Provider`, `Base URL`, `Model`, `API key`, and the
`Test connection` / `Save and use` button placement. The API-key input is a
password field whose transient value stays only in the new in-memory provider;
it is never transmitted, logged, written to browser storage, or written to an
environment file. The mock test returns fixture latency or the fixture error,
and save writes only the provider state after a successful test fingerprint.

- [ ] **Step 4: Run Settings tests and commit**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/settings/settings-page.test.tsx`

Expected: PASS.

```powershell
git add apps/control/src/features/evaluation-layer/settings 'apps/control/src/routes/$projectId/evaluation/settings.tsx'
git commit -m "feat(control): add evaluation mock settings"
```

---

### Task 11: Full parity audit, regression verification, and browser smoke flow

**Files:**
- Modify only when audit finds a concrete gap: files under `apps/control/src/features/evaluation-layer/**`
- Modify: `apps/control/src/routes/-evaluation-layer-routing.test.ts`
- Create: `apps/control/src/features/evaluation-layer/evaluation-layer-parity.test.tsx`
- Verify unchanged: `apps/control/src/features/evaluations/**`
- Verify unchanged: `apps/control/src/features/traces/**`

**Interfaces:**
- Consumes: the six real page components under `features/evaluation-layer` and
  the real `EvaluationLayerProvider`.
- Produces: behavior-level parity coverage for the visible data formats,
  section order, control placement, and mock actions.

- [ ] **Step 1: Write failing behavior-level parity tests**

```ts
it("renders Report sections in AgentEval order through the real page", () => {
  renderWithEvaluationLayer(<EvaluationReportDetail reportId="report-failed" />);
  expect(screen.getAllByRole("heading", { level: 2 }).map((item) => item.textContent))
    .toEqual([
      "Summary",
      "Test Results",
      "Failure reasons",
      "Tool Evidence",
      "LLM Judge",
      "Comparison",
      "Usage & Cost",
      "Reflection",
    ]);
});

it("keeps Settings actions frontend-only and gates save on the real mock test", async () => {
  renderWithEvaluationLayer(<EvaluationSettingsPage />);
  await userEvent.click(screen.getByRole("button", { name: "Test connection" }));
  expect(screen.getByRole("button", { name: "Save and use" })).toBeEnabled();
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

Add equivalent real-component assertions for Target columns, Dataset local-tab
order, Evaluation setup field order, Overview metric order, and Trace detail /
Analysis placement. Each assertion must name the user-visible break it catches;
do not test a manifest constant or source text.

- [ ] **Step 2: Run and confirm the missing manifest failure**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/evaluation-layer-parity.test.tsx`

Expected: FAIL before the missing parity behavior or test harness is completed.

- [ ] **Step 3: Audit the rendered behavior against AgentEval**

Compare the rendered headings, columns, fields, value formats, local tabs, and
actions against `agents.py`, `datasets.py`, `runs.py`, `reports.py`,
`observations.py`, and `settings_page.py`. Fix any discovered missing surface
inside the new feature only, and keep assertions on real rendered components
and state transitions.

- [ ] **Step 4: Run focused and full automated verification**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer`

Expected: all Evaluation-layer tests PASS.

Run: `npm test --workspace @tasklattice/control`

Expected: full control suite PASS with zero failures.

Run: `npm run typecheck --workspace @tasklattice/control`

Expected: exit 0.

Run: `npm run build --workspace @tasklattice/control`

Expected: exit 0.

- [ ] **Step 5: Prove original feature files were not changed**

Run:

```powershell
git diff 00ddfa1 --name-only -- apps/control/src/features/evaluations apps/control/src/features/traces
```

Expected: no output.

- [ ] **Step 6: Browser-smoke the complete new layer**

With the local app running, verify at desktop and narrow widths:

1. Sidebar group order and the six Evaluation child items.
2. Target list -> Target detail -> create revision.
3. Dataset list -> draft -> edit/import/generate -> schema -> publish -> history.
4. Evaluation setup -> evaluator selection -> progress -> completed Report.
5. Report sections -> comparison -> Reflection -> new Target revision.
6. Overview metric order and formatted values.
7. Trace list -> detail -> span -> Analysis -> recommended changes -> back.
8. Settings test/save success and mock failure feedback.
9. Existing Observer Traces, Evaluations, and Cost still open and behave as before.
10. No Evaluation-layer request appears in the browser network log.

- [ ] **Step 7: Commit the parity audit and any isolated corrections**

```powershell
git add apps/control/src/features/evaluation-layer apps/control/src/routes/-evaluation-layer-routing.test.ts
git commit -m "test(control): verify evaluation layer parity"
```

---

## Final Verification Gate

Before reporting completion, run the following from the repository root and
read the complete output:

```powershell
npm test --workspace @tasklattice/control
npm run typecheck --workspace @tasklattice/control
npm run build --workspace @tasklattice/control
git status --short
git diff 00ddfa1 --name-only -- apps/control/src/features/evaluations apps/control/src/features/traces
```

Completion requires zero test failures, typecheck exit 0, build exit 0, no
unexpected working-tree files, and no changes under the original Evaluations or
Traces feature directories.
