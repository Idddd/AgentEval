# Direct Evaluation Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start an Evaluation with one click from the ready Test coverage step and remove the intermediate Start evaluation confirmation state.

**Architecture:** Extend the existing `startEvaluation` handler to accept the Dataset revision selected or published by the current click. Make `continueWithSelectedDataset` complete Dataset preparation and immediately invoke that handler, preserving all existing validation and mock Run creation behavior.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing AgentEval mock store

## Global Constraints

- The ready Test coverage primary action is labeled `Run evaluation`.
- One click completes required Dataset publication/confirmation and creates the Run.
- The direct path does not render `Start evaluation` as an intermediate current step.
- Existing validation messages, role restrictions, Run progress, logs, and Result details remain unchanged.
- No API or dependency is introduced.

---

### Task 1: Direct Run Creation From Test Coverage

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.tsx`
- Test: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx`

**Interfaces:**
- Consumes: `continueWithSelectedDataset()`, `startEvaluation(datasetRevisionId?)`, `store.publishDatasetRevision()`, and `store.createRun()`.
- Produces: a single ready-state `Run evaluation` action that creates a Run without a confirmation transition.

- [ ] **Step 1: Write the failing direct-start tests**

Replace the existing Onboarding transition expectations with observable direct-run behavior:

```tsx
expect(nextStep.getByRole('button', { name: 'Run evaluation' })).not.toBeNull();
expect(nextStep.queryByRole('button', { name: 'Next' })).toBeNull();

await userEvent.click(nextStep.getByRole('button', { name: 'Run evaluation' }));

await waitFor(() => {
  expect(nextStep.getByLabelText(/Evaluation \d+% complete/)).not.toBeNull();
  expect(drawer.getByRole('region', { name: 'Current step: Result' })).not.toBeNull();
});
expect(drawer.queryByRole('region', { name: 'Current step: Evaluation' })).toBeNull();
expect(nextStep.queryByText('Start evaluation')).toBeNull();
```

For the expanded-details path, click the same action while Test coverage details are open and assert Result details appear immediately.

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```powershell
npm.cmd test --workspace @tasklattice/control -- catalog-page.test.tsx
```

Expected: FAIL because ready Test coverage still exposes `Next` and transitions to `Start evaluation`.

- [ ] **Step 3: Implement the minimal direct-start handler**

Change `startEvaluation` to accept an optional revision ID and use it for Run creation:

```tsx
const startEvaluation = (datasetRevisionId = row.publishedRevision?.id) => {
  if (guardrailEvaluationRestricted) {
    setWorkspaceNotice({
      message: 'Guardrail evaluation is restricted to the Admin role.',
      section: 'run',
    });
    focusSection('run');
    return;
  }
  if (!row.currentRevision) {
    setWorkspaceNotice({
      message: 'Create a Target revision before starting an Evaluation.',
      section: 'agent',
    });
    focusSection('agent');
    return;
  }
  if (!datasetRevisionId) {
    setWorkspaceNotice({
      message: 'Publish the selected Test Cases before starting an Evaluation.',
      section: 'dataset',
    });
    focusSection('dataset');
    return;
  }
  if (!selectedGuardrailTemplateIds.length) {
    setWorkspaceNotice({
      message: 'Select at least one Guardrail test pack before starting the Evaluation.',
      section: 'dataset',
    });
    focusSection('dataset');
    return;
  }
  const evaluatorIds = state.evaluators
    .filter((evaluator) => evaluator.enabled)
    .map((evaluator) => evaluator.id);
  if (!evaluatorIds.length) {
    setWorkspaceNotice({
      message: 'Enable at least one Evaluator before starting the Evaluation.',
      section: 'run',
    });
    focusSection('run');
    return;
  }
  if (state.settings.testOutcome === 'FAILURE') {
    setWorkspaceNotice({
      message: 'The Judge connection is unavailable. Verify Evaluation settings before starting the run.',
      section: 'run',
    });
    focusSection('run');
    return;
  }
  const result = store.createRun({
    targetRevisionId: row.currentRevision.id,
    datasetRevisionId,
    evaluatorIds,
    guardrailTemplateIds: selectedGuardrailTemplateIds,
  });
  if (!result.ok) {
    setWorkspaceNotice({ message: result.error, section: 'run' });
    focusSection('run');
    return;
  }
  setWorkspaceNotice(undefined);
  focusSection('run');
};
```

In `continueWithSelectedDataset`, retain the selected published revision ID or take `published.value.revisionId`, clear the pending selection state, then call `startEvaluation(datasetRevisionId)` instead of `advanceToWorkflowSection('run')`.

Render the ready Test coverage action as:

```tsx
<Button onClick={continueWithSelectedDataset}>
  <Play />
  Run evaluation
</Button>
```

Wrap other `startEvaluation` button handlers in `() => startEvaluation()` so React click events are not treated as revision IDs.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```powershell
npm.cmd test --workspace @tasklattice/control -- catalog-page.test.tsx
```

Expected: all Catalog tests pass.

- [ ] **Step 5: Run full verification**

Run:

```powershell
npm.cmd run typecheck
npm.cmd test
```

Expected: typecheck exits 0 and all non-skipped tests pass.

- [ ] **Step 6: Commit the implementation**

```powershell
git add web/apps/control/src/features/evaluation-layer/catalog/catalog-page.tsx web/apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx
git commit -m "feat: start evaluation directly from coverage"
```
