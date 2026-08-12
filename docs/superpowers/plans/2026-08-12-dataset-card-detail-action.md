# Dataset Card Detail Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible `+` action to every existing Dataset card that selects that Dataset and opens its embedded detail view.

**Architecture:** `DatasetCardSelector` owns only the visual action and reports the Dataset ID through a new callback. `WorkspaceDrawer` performs the workflow transition by selecting the Dataset, switching to Details mode, expanding Test coverage, and focusing that section. The action is a sibling of the radio label so clicking it cannot also trigger the card's normal selection handler.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react, Vitest, Testing Library.

## Global Constraints

- Keep the existing card-body radio selection behavior unchanged.
- Add the action to existing Dataset cards only; do not change the New Dataset card.
- Use the accessible name `Open <Dataset name> details`.
- Use existing mock/local state only; do not add API calls.
- The upper-right selection indicator remains unchanged.

---

### Task 1: Add and connect the Dataset-card detail action

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/catalog/dataset-card-selector.tsx`
- Test: `web/apps/control/src/features/evaluation-layer/catalog/dataset-card-selector.test.tsx`
- Modify: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.tsx`
- Test: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx`

**Interfaces:**
- Consumes: `store.selectActiveDataset(datasetId: string)` and `openDetailsSection("dataset")` from `WorkspaceDrawer`.
- Produces: `DatasetCardSelectorProps.onOpenDetails(datasetId: string): void` and a button named `Open <Dataset name> details`.

- [ ] **Step 1: Write the failing component test**

Add an `onOpenDetails` spy to existing renders and this test:

```tsx
it("opens a Dataset detail without triggering card selection", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const onOpenDetails = vi.fn();
  render(
    <DatasetCardSelector
      datasets={datasets}
      revisions={revisions}
      selectedDatasetId="dataset-a"
      onSelect={onSelect}
      onOpenDetails={onOpenDetails}
      onCreate={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Open Empty Dataset details" }));
  expect(onOpenDetails).toHaveBeenCalledWith("dataset-b");
  expect(onSelect).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Write the failing Catalog integration test**

Open the Onboarding Assistant drawer, click `Open Demo Default Dataset details`, then assert that `Test coverage details` is expanded and the embedded Dataset tabs such as `Draft cases` and `Evaluation history` are visible.

- [ ] **Step 3: Run focused tests and confirm the RED state**

Run:

```powershell
npm.cmd test --workspace @tasklattice/control -- dataset-card-selector.test.tsx catalog-page.test.tsx
```

Expected: FAIL because `onOpenDetails` and the accessible detail buttons do not exist.

- [ ] **Step 4: Implement the card action**

Extend the props and render each existing Dataset inside a relative wrapper. Keep the `<label>` as the radio card body and add this sibling button inside the wrapper:

```tsx
<button
  type="button"
  aria-label={`Open ${dataset.name} details`}
  className="absolute bottom-3 right-3 z-10 grid size-8 place-items-center rounded-md border bg-background text-cyan-600 shadow-sm transition-colors hover:border-cyan-500 hover:bg-cyan-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
  onClick={() => onOpenDetails(dataset.id)}
>
  <Plus className="size-4" aria-hidden="true" />
</button>
```

Give the radio label `h-full` so the wrapper preserves the existing card height.

- [ ] **Step 5: Connect the workflow transition**

Pass `onOpenDetails` in `WorkspaceDrawer`:

```tsx
onOpenDetails={(datasetId) => {
  const result = store.selectActiveDataset(datasetId);
  if (!result.ok) {
    setWorkspaceNotice({ message: result.error, section: "dataset" });
    focusSection("dataset");
    return;
  }
  setDatasetSelectionPending(true);
  setWorkspaceNotice(undefined);
  openDetailsSection("dataset");
}}
```

- [ ] **Step 6: Run focused tests and confirm the GREEN state**

Run:

```powershell
npm.cmd test --workspace @tasklattice/control -- dataset-card-selector.test.tsx catalog-page.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Verify types, full tests, and browser behavior**

Run from `web`:

```powershell
npm.cmd run typecheck
npm.cmd test
```

Then reload `http://localhost:8080/individual/evaluation/catalog`, open Onboarding Assistant, click a Dataset-card `+`, and verify that the clicked Dataset remains selected while its embedded detail is shown in expanded Test coverage.

- [ ] **Step 8: Commit the implementation**

```powershell
git add web/apps/control/src/features/evaluation-layer/catalog/dataset-card-selector.tsx web/apps/control/src/features/evaluation-layer/catalog/dataset-card-selector.test.tsx web/apps/control/src/features/evaluation-layer/catalog/catalog-page.tsx web/apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx
git commit -m "feat: add Dataset card detail action"
```

