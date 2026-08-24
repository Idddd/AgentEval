# Dataset Card Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Evaluation Catalog Dataset dropdown with an accessible, responsive card selector while preserving all existing Dataset workflow behavior.

**Architecture:** Extract a focused `DatasetCardSelector` plus a pure revision-summary helper in the Catalog feature. `EvaluationWorkspace` continues to own store mutations and pending-selection state; it passes existing eligible Datasets and revisions into the selector and translates card callbacks into the same mutation calls currently used by the `<select>`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, TanStack application state, Vitest, Testing Library.

## Global Constraints

- Preserve Dataset eligibility, creation, generation, publishing, Guardrail pack selection, Next behavior, and evaluation transitions.
- Use a native radio group for existing Dataset cards and a native button for New Dataset.
- Render two columns when space permits and one column on narrow screens.
- Do not change Evaluation models, fixtures, or store interfaces.
- Do not add search, sorting, pagination, editing, deletion, or overflow actions.

---

### Task 1: Dataset Card Selector Component

**Files:**
- Create: `web/apps/control/src/features/evaluation-layer/catalog/dataset-card-selector.tsx`
- Create: `web/apps/control/src/features/evaluation-layer/catalog/dataset-card-selector.test.tsx`

**Interfaces:**
- Produces: `datasetCardSummary(dataset, revisions): DatasetCardSummary`.
- Produces: `DatasetCardSelector(props: DatasetCardSelectorProps)`.
- Consumes: `EvaluationLayerDataset` and `EvaluationLayerDatasetRevision` from `../model`.

- [ ] **Step 1: Write the failing summary and interaction tests**

The production changes these tests catch are: selecting the wrong revision, failing to report missing revisions, rendering cards without radio semantics, failing to invoke selection, and treating New Dataset as a selectable Dataset.

```tsx
/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EvaluationLayerDataset, EvaluationLayerDatasetRevision } from "../model";
import { DatasetCardSelector, datasetCardSummary } from "./dataset-card-selector";

const datasets: EvaluationLayerDataset[] = [
  {
    id: "dataset-a",
    targetId: "target-a",
    name: "Support Dataset",
    description: "Approved support conversations.",
    currentRevisionId: "revision-2",
    createdAt: "2026-08-12T00:00:00.000Z",
  },
  {
    id: "dataset-b",
    targetId: "target-a",
    name: "Empty Dataset",
    description: "",
    currentRevisionId: "",
    createdAt: "2026-08-12T00:00:00.000Z",
  },
];

const revisions: EvaluationLayerDatasetRevision[] = [
  { id: "revision-1", datasetId: "dataset-a", targetId: "target-a", revision: 1, status: "PUBLISHED", cases: [{ id: "case-1", input: {}, expectedOutput: {}, tags: [], source: "custom" }], createdAt: "2026-08-11T00:00:00.000Z" },
  { id: "revision-2", datasetId: "dataset-a", targetId: "target-a", revision: 2, status: "DRAFT", cases: [{ id: "case-2", input: {}, expectedOutput: {}, tags: [], source: "custom" }, { id: "case-3", input: {}, expectedOutput: {}, tags: [], source: "custom" }], createdAt: "2026-08-12T00:00:00.000Z" },
];

afterEach(cleanup);

describe("DatasetCardSelector", () => {
  it("summarizes the current revision with literal state and case count", () => {
    expect(datasetCardSummary(datasets[0]!, revisions)).toEqual({
      revisionLabel: "R2",
      statusLabel: "Draft",
      caseLabel: "2 cases",
    });
    expect(datasetCardSummary(datasets[1]!, revisions)).toEqual({
      revisionLabel: "No revisions",
      statusLabel: "",
      caseLabel: "0 cases",
    });
  });

  it("selects an existing Dataset and opens New Dataset as a separate action", async () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    render(<DatasetCardSelector datasets={datasets} revisions={revisions} selectedDatasetId="dataset-a" onSelect={onSelect} onCreate={onCreate} />);

    expect(screen.getByRole("radiogroup", { name: "Dataset" })).toBeVisible();
    expect(screen.getByRole("radio", { name: /Support Dataset/ })).toBeChecked();
    expect(screen.getByText("Approved support conversations.")).toBeVisible();
    expect(screen.getByText("R2")).toBeVisible();
    expect(screen.getByText("Draft")).toBeVisible();
    expect(screen.getByText("2 cases")).toBeVisible();
    expect(screen.getByText("No description")).toBeVisible();

    await userEvent.click(screen.getByRole("radio", { name: /Empty Dataset/ }));
    expect(onSelect).toHaveBeenCalledWith("dataset-b");
    await userEvent.click(screen.getByRole("button", { name: "New Dataset" }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("radio", { name: /New Dataset/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/catalog/dataset-card-selector.test.tsx`

Expected: FAIL because `dataset-card-selector.tsx` does not exist.

- [ ] **Step 3: Implement the pure summary helper**

```ts
export type DatasetCardSummary = {
  revisionLabel: string;
  statusLabel: string;
  caseLabel: string;
};

export function datasetCardSummary(
  dataset: EvaluationLayerDataset,
  revisions: EvaluationLayerDatasetRevision[],
): DatasetCardSummary {
  const candidates = revisions.filter((item) => item.datasetId === dataset.id);
  const revision = candidates.find((item) => item.id === dataset.currentRevisionId)
    ?? [...candidates].sort((left, right) => right.revision - left.revision)[0];
  if (!revision) return { revisionLabel: "No revisions", statusLabel: "", caseLabel: "0 cases" };
  return {
    revisionLabel: `R${revision.revision}`,
    statusLabel: revision.status === "PUBLISHED" ? "Published" : "Draft",
    caseLabel: `${revision.cases.length} case${revision.cases.length === 1 ? "" : "s"}`,
  };
}
```

- [ ] **Step 4: Implement accessible radio cards and New Dataset action**

```tsx
export type DatasetCardSelectorProps = {
  datasets: EvaluationLayerDataset[];
  revisions: EvaluationLayerDatasetRevision[];
  selectedDatasetId: string;
  onSelect(datasetId: string): void;
  onCreate(): void;
};

export function DatasetCardSelector(props: DatasetCardSelectorProps) {
  return (
    <fieldset className="grid gap-3">
      <legend className="text-xs font-medium text-muted-foreground">Dataset</legend>
      <div role="radiogroup" aria-label="Dataset" className="grid gap-3 md:grid-cols-2">
        {props.datasets.map((dataset) => {
          const selected = dataset.id === props.selectedDatasetId;
          const summary = datasetCardSummary(dataset, props.revisions);
          return (
            <label key={dataset.id} className={cn("relative min-h-32 cursor-pointer rounded-lg border bg-background p-4", selected && "border-cyan-500 bg-cyan-500/5 ring-1 ring-cyan-500/30")}>
              <input className="peer sr-only" type="radio" name="evaluation-dataset" value={dataset.id} checked={selected} onChange={() => props.onSelect(dataset.id)} />
              <span className="flex items-start justify-between gap-3"><strong>{dataset.name}</strong><CircleCheck className={cn("size-4", selected ? "text-cyan-600" : "text-muted-foreground")} /></span>
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">{dataset.description.trim() || "No description"}</span>
              <span className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span>{summary.revisionLabel}</span>{summary.statusLabel ? <span>{summary.statusLabel}</span> : null}<span>{summary.caseLabel}</span></span>
            </label>
          );
        })}
        <button type="button" className="min-h-32 rounded-lg border border-dashed bg-muted/10 p-4 text-left hover:border-cyan-500 hover:bg-cyan-500/5" onClick={props.onCreate}>
          <Plus className="size-5 text-cyan-600" /><strong className="mt-3 block">New Dataset</strong><span className="mt-1 block text-xs text-muted-foreground">Create a Dataset for this evaluation target.</span>
        </button>
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 5: Run the component test and verify GREEN**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/catalog/dataset-card-selector.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the component**

```powershell
git add web/apps/control/src/features/evaluation-layer/catalog/dataset-card-selector.tsx web/apps/control/src/features/evaluation-layer/catalog/dataset-card-selector.test.tsx
git commit -m "feat: add Dataset card selector"
```

---

### Task 2: Integrate Cards into Test Coverage

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.tsx`
- Modify: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx`

**Interfaces:**
- Consumes: `DatasetCardSelector` from Task 1.
- Preserves: `store.selectActiveDataset`, `setDatasetSelectionPending`, `onCreateDataset`, and the `targetDatasets` eligibility filter.

- [ ] **Step 1: Replace combobox assertions with failing card-workflow assertions**

The production changes these tests catch are: retaining the dropdown, losing the current selection, bypassing the existing selection mutation, and breaking the existing creation dialog/auto-selection flow.

Update the Test coverage tests to assert:

```tsx
const coverage = within(screen.getByRole("region", { name: "Current step: Test coverage" }));
expect(coverage.queryByRole("combobox", { name: "Dataset" })).not.toBeInTheDocument();
expect(coverage.getByRole("radiogroup", { name: "Dataset" })).toBeVisible();
expect(coverage.getByRole("radio", { name: /Demo Default Dataset/ })).toBeChecked();
expect(coverage.getByRole("button", { name: "New Dataset" })).toBeVisible();
```

In the new-Dataset test, replace selection of the `__create_dataset__` option with:

```tsx
await userEvent.click(coverage.getByRole("button", { name: "New Dataset" }));
const createDialog = within(screen.getByRole("dialog"));
await userEvent.type(createDialog.getByRole("textbox", { name: "Name *" }), "One-stop Eval Dataset");
await userEvent.click(createDialog.getByRole("button", { name: "Create Dataset" }));
expect(coverage.getByRole("radio", { name: /One-stop Eval Dataset/ })).toBeChecked();
```

For the no-selection state, assert that each eligible Dataset is an unchecked radio and select `Demo Default Dataset` by clicking its radio before continuing.

- [ ] **Step 2: Run focused Catalog tests and verify RED**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/catalog/catalog-page.test.tsx`

Expected: FAIL because the production page still renders a Dataset combobox.

- [ ] **Step 3: Replace the `<select>` block with the card selector**

```tsx
<div className="rounded-lg border bg-muted/10 p-3">
  <DatasetCardSelector
    datasets={targetDatasets}
    revisions={state.datasetRevisions}
    selectedDatasetId={row.selectedDataset?.id ?? ""}
    onSelect={(datasetId) => {
      const result = store.selectActiveDataset(datasetId);
      if (result.ok) setDatasetSelectionPending(true);
    }}
    onCreate={onCreateDataset}
  />
</div>
```

Delete `CREATE_DATASET_VALUE` if no remaining consumer uses it. Do not modify the surrounding notice, Generate Dataset row, `EvaluationDatasetDetail`, or Guardrail picker.

- [ ] **Step 4: Run Catalog tests and verify GREEN**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/catalog/catalog-page.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run the Control type check**

Run: `npm run typecheck --workspace @tasklattice/control`

Expected: exit code 0.

- [ ] **Step 6: Run browser verification**

Open `http://localhost:8080/individual/evaluation/catalog`, open a Target at Test coverage, and verify:

- selected card appearance and metadata;
- selecting another Dataset updates the active Dataset details;
- New Dataset opens the existing dialog and the created Dataset becomes selected;
- Generate Dataset and Next still work;
- card grid becomes one column at narrow width and returns to normal after viewport reset.

- [ ] **Step 7: Commit the integration**

```powershell
git add web/apps/control/src/features/evaluation-layer/catalog/catalog-page.tsx web/apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx
git commit -m "feat: use Dataset cards in Evaluation coverage"
```

---

### Task 3: Final Verification

**Files:**
- Test: files changed in Tasks 1-2.

- [ ] **Step 1: Run fresh focused tests**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/catalog/dataset-card-selector.test.tsx src/features/evaluation-layer/catalog/catalog-page.test.tsx`

Expected: all selected tests PASS with zero unhandled errors.

- [ ] **Step 2: Run fresh type checking**

Run: `npm run typecheck --workspace @tasklattice/control`

Expected: exit code 0.

- [ ] **Step 3: Inspect changes**

Run: `git diff --check 486ca02..HEAD` and `git status --short`.

Expected: no whitespace errors and a clean workspace.
