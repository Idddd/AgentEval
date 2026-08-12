# Report Action Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a no-op Suggestion action and move embedded report approval/rejection controls into the sticky report navigation.

**Architecture:** Keep Suggestion rendering inside `EvaluationReportDetail`, using the existing Button component without a handler. Keep decision mutation in `WorkspaceDrawer`, reuse its existing `decideRevision` function for the navigation action, and render the embedded report decision section in `status-only` mode.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Tailwind CSS, existing AgentEval UI components

## Global Constraints

- `Action` remains enabled but has no click handler, state mutation, navigation, or API call.
- Embedded report decision controls move to `Report navigation`; the report body retains status-only decision context.
- Standalone report decision controls remain unchanged.
- No new API or dependency is introduced.

---

### Task 1: Suggestion Action

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/reports/report-page.tsx`
- Test: `web/apps/control/src/features/evaluation-layer/reports/report-page.test.tsx`

**Interfaces:**
- Consumes: existing `Button` component and `reflection.suggestion` rendering.
- Produces: an enabled `Action` button beside each rendered Suggestion with no event handler.

- [ ] **Step 1: Write the failing test**

Add an assertion to the natural-language Suggestion test:

```tsx
const action = screen.getByRole('button', { name: 'Action' }) as HTMLButtonElement;
expect(action.disabled).toBe(false);
await userEvent.click(action);
expect(screen.getByText('Run the permission guard before EmployeeQueryTool execution to prevent restricted data exposure.')).not.toBeNull();
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```powershell
npm.cmd test --workspace @tasklattice/control -- report-page.test.tsx
```

Expected: FAIL because no button named `Action` exists.

- [ ] **Step 3: Implement the minimal Suggestion layout**

For both hidden and interactive Suggestion rows, render the text block with:

```tsx
<Button type="button" size="sm" variant="outline">
  Action
</Button>
```

Place the button as a sibling of the text/checkbox content so clicking it does not toggle the checkbox. Do not add `onClick` or `disabled`.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```powershell
npm.cmd test --workspace @tasklattice/control -- report-page.test.tsx
```

Expected: all `report-page.test.tsx` tests pass.

### Task 2: Embedded Decision Navigation

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.tsx`
- Test: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx`

**Interfaces:**
- Consumes: `row.decisionStatus`, `row.decisionRecommendation`, `role`, and existing `decideRevision(status)`.
- Produces: one pending decision action in `Report navigation` and a status-only decision section in embedded report details.

- [ ] **Step 1: Write the failing Catalog test**

After opening the report, add scoped assertions:

```tsx
const navigation = within(drawer.getByRole('region', { name: 'Report navigation' }));
expect(navigation.getByRole('button', { name: 'Approve evaluation' })).not.toBeNull();
expect(report.queryByRole('button', { name: 'Approve evaluation' })).toBeNull();
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```powershell
npm.cmd test --workspace @tasklattice/control -- catalog-page.test.tsx
```

Expected: FAIL because the decision action is still inside `Report details` rather than `Report navigation`.

- [ ] **Step 3: Move the decision action**

In the sticky navigation, render the existing recommendation-dependent action when the decision is pending and the role is Admin:

```tsx
<Button
  size="sm"
  variant={approve ? 'default' : 'destructive'}
  onClick={() => decideRevision(approve ? 'APPROVED' : 'REJECTED')}
>
  {approve ? <Check /> : <XCircle />}
  {approve ? 'Approve evaluation' : 'Reject evaluation'}
</Button>
```

Pass `decisionMode="status-only"` to the embedded `EvaluationReportDetail` so the report keeps status context without a duplicate action.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```powershell
npm.cmd test --workspace @tasklattice/control -- catalog-page.test.tsx report-page.test.tsx
```

Expected: both focused test files pass.

- [ ] **Step 5: Run full verification**

Run:

```powershell
npm.cmd run typecheck
npm.cmd test
```

Expected: typecheck exits 0 and all non-skipped tests pass.

- [ ] **Step 6: Commit the implementation**

```powershell
git add web/apps/control/src/features/evaluation-layer/reports/report-page.tsx web/apps/control/src/features/evaluation-layer/reports/report-page.test.tsx web/apps/control/src/features/evaluation-layer/catalog/catalog-page.tsx web/apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx
git commit -m "feat: relocate evaluation report actions"
```
