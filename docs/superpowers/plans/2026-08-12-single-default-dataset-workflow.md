# Single Default Dataset Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Onboarding Assistant use one Published `Demo Default Dataset` and keep all Dataset cards and Guardrail Test Packs visible throughout the current Test coverage workflow.

**Architecture:** Migrate the mock fixture graph so the existing default Dataset becomes the single Published Dataset and the showcase Live Run references it. Simplify the Catalog drawer to pass all Target-owned Datasets to `DatasetCardSelector` and render `GuardrailTemplatePicker` unconditionally whenever Test coverage is visible. Preserve all run, trace, evaluator, permission, and review behavior.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, in-memory Evaluation fixtures

## Global Constraints

- `Demo Default Dataset` is the only initial Onboarding Assistant Dataset and has status `PUBLISHED`.
- Preserve existing Onboarding Assistant Overview and Trace showcase data.
- Keep `New Dataset`, `Next`, Evaluation setup, evaluation execution, and result review behavior unchanged.
- Do not add real APIs, database writes, object storage, or Dataset-level Guardrail persistence.

---

### Task 1: Migrate the Onboarding Fixture Graph

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/fixture-validation.test.ts`
- Modify: `web/apps/control/src/features/evaluation-layer/fixtures.ts`

**Interfaces:**
- Consumes: `evaluationLayerFixtures.datasets`, `datasetRevisions`, and `runs`
- Produces: one Onboarding Dataset with id `demo-default-dataset`, one Published revision `demo-default-dataset-r1`, and a valid `live-monitoring-demo-onboarding-assistant` Run reference

- [ ] **Step 1: Add a failing fixture contract test**

```ts
it("uses one published default Dataset for the Onboarding showcase", () => {
  const datasets = evaluationLayerFixtures.datasets.filter(
    (dataset) => dataset.targetId === "demo-onboarding-assistant",
  );
  expect(datasets.map((dataset) => dataset.id)).toEqual(["demo-default-dataset"]);

  const revision = evaluationLayerFixtures.datasetRevisions.find(
    (item) => item.id === "demo-default-dataset-r1",
  );
  expect(revision).toMatchObject({
    datasetId: "demo-default-dataset",
    status: "PUBLISHED",
  });

  const run = evaluationLayerFixtures.runs.find(
    (item) => item.id === "live-monitoring-demo-onboarding-assistant",
  );
  expect(run).toMatchObject({
    datasetId: "demo-default-dataset",
    datasetRevisionId: "demo-default-dataset-r1",
  });
  expect(validateEvaluationLayerState(evaluationLayerFixtures)).toEqual([]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `web/apps/control`:

```bash
npm.cmd test -- src/features/evaluation-layer/fixture-validation.test.ts
```

Expected: FAIL because a second Dataset exists and the default revision is Draft.

- [ ] **Step 3: Apply the minimal fixture migration**

In `fixtures.ts`:

- Remove the `demo-published-dataset` Dataset object.
- Remove the `demo-published-dataset-r1` revision.
- Change `demo-default-dataset-r1.status` to `PUBLISHED`.
- Update `Demo Default Dataset.description` to `Published default Dataset for the Onboarding Assistant evaluation workflow.`
- Change the Onboarding Live Run to `datasetId: "demo-default-dataset"` and `datasetRevisionId: "demo-default-dataset-r1"`.

- [ ] **Step 4: Re-run the fixture test and verify GREEN**

Run: `npm.cmd test -- src/features/evaluation-layer/fixture-validation.test.ts`

Expected: the file passes and `validateEvaluationLayerState` returns no reference errors.

### Task 2: Remove Old Catalog Visibility Logic

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx`
- Modify: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.tsx`

**Interfaces:**
- Consumes: every `state.datasets` entry whose `targetId === row.target.id`
- Produces: a persistent Dataset card list and an always-visible `GuardrailTemplatePicker` in Test coverage

- [ ] **Step 1: Update the Onboarding Test coverage regression test**

Replace the second-Dataset and Draft assertions in `configures a new Dataset with one required Guardrail and optional packs` with:

```tsx
expect(dataset.checked).toBe(true);
expect(coverage.queryByRole('radio', { name: /Published Demo Dataset/ })).toBeNull();
const defaultCard = within(dataset.closest('label')!);
expect(defaultCard.getByText('Published')).not.toBeNull();
expect(defaultCard.getByText('6 cases')).not.toBeNull();
expect(coverage.getByRole('group', { name: 'Guardrail Test Packs' })).not.toBeNull();
```

Add a separate test that opens Onboarding Assistant, creates `Persistent Dataset`, selects `Demo Default Dataset`, and asserts both radio cards still exist:

```tsx
await userEvent.click(coverage.getByRole('button', { name: 'New Dataset' }));
const createDialog = within(screen.getByRole('dialog', { name: 'Create dataset' }));
await userEvent.type(createDialog.getByRole('textbox', { name: 'Name *' }), 'Persistent Dataset');
await userEvent.click(createDialog.getByRole('button', { name: 'Create dataset' }));

await userEvent.click(coverage.getByRole('radio', { name: /Demo Default Dataset/ }));
expect(coverage.getByRole('radio', { name: /Demo Default Dataset/ })).not.toBeNull();
expect(coverage.getByRole('radio', { name: /Persistent Dataset/ })).not.toBeNull();
expect(coverage.getByRole('group', { name: 'Guardrail Test Packs' })).not.toBeNull();
```

- [ ] **Step 2: Run the focused Catalog test and verify RED**

Run:

```bash
npm.cmd test -- src/features/evaluation-layer/catalog/catalog-page.test.tsx
```

Expected: FAIL because Published Test coverage hides the Guardrail picker and the nonselected new Dataset is filtered out.

- [ ] **Step 3: Delete the old visibility branches**

Replace the filtered Dataset construction with:

```tsx
const targetDatasets = state.datasets.filter(
  (dataset) => dataset.targetId === row.target.id,
);
```

Render the picker directly:

```tsx
<GuardrailTemplatePicker
  targetKind={row.target.kind}
  selectedIds={selectedGuardrailTemplateIds}
  onSelectedIdsChange={setSelectedGuardrailTemplateIds}
  disabled={guardrailEvaluationRestricted}
/>
```

Remove `datasetIdsWithGuardrailCoverage` and the condition that depends on `detailsOpen`, `row.publishedRevision`, and `selectedGuardrailTemplateIds.length`.

- [ ] **Step 4: Re-run focused tests and verify GREEN**

Run:

```bash
npm.cmd test -- src/features/evaluation-layer/fixture-validation.test.ts src/features/evaluation-layer/catalog/catalog-page.test.tsx
```

Expected: both files pass.

### Task 3: Full Verification and Commit

**Files:**
- Verify all modified fixture, Catalog, Overview, and Trace behavior.

**Interfaces:**
- Verifies the fixture graph, Catalog workflow, and retained Onboarding showcase are consistent

- [ ] **Step 1: Run all workspace typechecks**

Run from `web`: `npm.cmd run typecheck`

Expected: all workspace typechecks exit with code 0.

- [ ] **Step 2: Run the complete test suite**

Run from `web`: `npm.cmd test`

Expected: all non-skipped tests pass.

- [ ] **Step 3: Validate in the authenticated local browser**

Open Onboarding Assistant in Catalog and confirm:

- Only `Demo Default Dataset` and `New Dataset` are initially shown.
- The default card shows Published and 6 cases.
- Guardrail Test Packs remains visible without opening Details.
- Creating and switching between Datasets does not remove either card.
- Overview and the Onboarding Trace detail still load their showcase records.

- [ ] **Step 4: Commit the implementation**

```bash
git add web/apps/control/src/features/evaluation-layer/fixtures.ts web/apps/control/src/features/evaluation-layer/fixture-validation.test.ts web/apps/control/src/features/evaluation-layer/catalog/catalog-page.tsx web/apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx
git commit -m "fix: simplify default Dataset workflow"
```
