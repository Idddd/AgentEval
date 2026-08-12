# Report Action and Tool Evidence Compact UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Suggestion actions explicitly blue and reduce Tool Evidence height by showing JSON output only through a one-row-at-a-time disclosure.

**Architecture:** Keep both changes inside `EvaluationReportDetail`, where the Suggestion and Tool Evidence UI already live. Use explicit Tailwind classes for the no-op action and one optional evidence key in local React state to control an accessible expanded table row. Reuse the existing `JsonPreview` so output formatting and null handling do not change.

**Tech Stack:** React, TypeScript, Tailwind CSS, shared Button and EvaluationTable components, Vitest, Testing Library.

## Global Constraints

- `Action` stays enabled and has no functional side effect.
- `Action` uses `bg-blue-600 text-white hover:bg-blue-700` rather than the theme primary color.
- Tool Evidence output is absent by default and complete JSON remains available on demand.
- At most one Tool Evidence output is expanded.
- No report data, store state, permissions, decisions, APIs, or mock fixtures change.

---

### Task 1: Make Suggestion actions explicitly blue

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/reports/report-page.tsx:386-430`
- Test: `web/apps/control/src/features/evaluation-layer/reports/report-page.test.tsx:114-127`

**Interfaces:**
- Consumes: existing shared `Button` component.
- Produces: enabled no-op buttons named `Action` with solid blue visual classes.

- [ ] **Step 1: Strengthen the existing failing style test**

Add literal assertions to `presents evidence-backed Suggestions with an enabled no-op Action`:

```tsx
expect(action.className).toContain('bg-blue-600');
expect(action.className).toContain('text-white');
expect(action.className).toContain('hover:bg-blue-700');
```

- [ ] **Step 2: Run the report test and verify RED**

Run:

```powershell
npm.cmd test --workspace @tasklattice/control -- report-page.test.tsx
```

Expected: FAIL because the Action button still uses the outline variant and has no explicit blue classes.

- [ ] **Step 3: Implement the minimal blue style**

Change both Suggestion branches to:

```tsx
<Button
  type="button"
  size="sm"
  className="shrink-0 bg-blue-600 text-white hover:bg-blue-700"
>
  Action
</Button>
```

Remove `variant="outline"` from those two buttons only.

- [ ] **Step 4: Run the report test and verify GREEN**

Run:

```powershell
npm.cmd test --workspace @tasklattice/control -- report-page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the blue action**

```powershell
git add web/apps/control/src/features/evaluation-layer/reports/report-page.tsx web/apps/control/src/features/evaluation-layer/reports/report-page.test.tsx
git commit -m "style: emphasize report suggestion actions"
```

### Task 2: Collapse Tool Evidence output by default

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/reports/report-page.tsx:1-610`
- Test: `web/apps/control/src/features/evaluation-layer/reports/report-page.test.tsx:60-75`

**Interfaces:**
- Consumes: `ToolEvidenceViewRow.key`, `ToolEvidenceViewRow.traceId`, and existing `JsonPreview`.
- Produces: local state `expandedToolEvidenceKey: string | undefined`; buttons named `View output for <trace ID>` and `Hide output for <trace ID>` with accurate `aria-expanded` state.

- [ ] **Step 1: Write the failing disclosure test**

Add a new test using the permission report fixture:

```tsx
it('keeps Tool Evidence compact and expands one output at a time', async () => {
  render(reportView('hidden'));
  const evidence = within(
    screen.getByText('Tool Evidence').closest('[data-slot="card"]')! as HTMLElement,
  );
  const firstTrace = 'demo-weather-guest-allow';
  const secondTrace = 'demo-employee-dept-hr-allow';

  expect(evidence.queryByText(/The weather in Paris is sunny/)).toBeNull();
  const first = evidence.getByRole('button', { name: `View output for ${firstTrace}` });
  expect(first.getAttribute('aria-expanded')).toBe('false');

  await userEvent.click(first);
  expect(evidence.getByText(/The weather in Paris is sunny/)).not.toBeNull();
  expect(evidence.getByRole('button', { name: `Hide output for ${firstTrace}` })).not.toBeNull();

  await userEvent.click(
    evidence.getByRole('button', { name: `View output for ${secondTrace}` }),
  );
  expect(evidence.queryByText(/The weather in Paris is sunny/)).toBeNull();
  expect(evidence.getByText(/Alice works in Platform Engineering/)).not.toBeNull();

  await userEvent.click(
    evidence.getByRole('button', { name: `Hide output for ${secondTrace}` }),
  );
  expect(evidence.queryByText(/Alice works in Platform Engineering/)).toBeNull();
});
```

- [ ] **Step 2: Run the report test and verify RED**

Run:

```powershell
npm.cmd test --workspace @tasklattice/control -- report-page.test.tsx
```

Expected: FAIL because full JSON is rendered immediately and no disclosure buttons exist.

- [ ] **Step 3: Add the single-expanded-row state**

Inside `EvaluationReportDetail`, add:

```tsx
const [expandedToolEvidenceKey, setExpandedToolEvidenceKey] = useState<string>();
```

- [ ] **Step 4: Replace the Output cell with a disclosure and detail row**

Render each item as a keyed Fragment containing the compact data row and an optional detail row:

```tsx
const expanded = expandedToolEvidenceKey === evidence.key;
return (
  <Fragment key={evidence.key}>
    <tr>
      <td>
        <div className="flex items-center gap-2">
          <span>{evidence.traceId}</span>
          {evidence.simulated ? (
            <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 dark:text-cyan-300">
              Demo
            </span>
          ) : null}
        </div>
      </td>
      <td>{evidence.toolId}</td>
      <td>{evidence.requested ? 'Yes' : 'No'}</td>
      <td>{evidence.executed ? 'Yes' : 'No'}</td>
      <td>{evidence.succeeded ? 'Yes' : 'No'}</td>
      <td>
        {evidence.effectVerified === null
          ? 'Not available'
          : evidence.effectVerified ? 'Yes' : 'No'}
      </td>
      <td>
        <Button
          type="button"
          size="xs"
          className="bg-blue-600 text-white hover:bg-blue-700"
          aria-expanded={expanded}
          onClick={() => setExpandedToolEvidenceKey(expanded ? undefined : evidence.key)}
        >
          {expanded ? 'Hide output' : 'View output'}
          <span className="sr-only"> for {evidence.traceId}</span>
        </Button>
      </td>
    </tr>
    {expanded ? (
      <tr>
        <td colSpan={7} className="bg-muted/20 p-3">
          <JsonPreview value={evidence.output} />
        </td>
      </tr>
    ) : null}
  </Fragment>
);
```

Import `Fragment` from React and keep the complete trace ID in its existing cell.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test --workspace @tasklattice/control -- report-page.test.tsx catalog-page.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Verify types, all tests, and browser behavior**

Run from `web`:

```powershell
npm.cmd run typecheck
npm.cmd test
```

Then reload the Catalog report drawer and verify:

- Suggestion `Action` is solid blue.
- Tool Evidence rows are compact by default.
- Clicking `View output` reveals only that row's JSON.
- Opening another output closes the first.
- Clicking `Hide output` restores the compact state.

- [ ] **Step 7: Commit the compact evidence UI**

```powershell
git add web/apps/control/src/features/evaluation-layer/reports/report-page.tsx web/apps/control/src/features/evaluation-layer/reports/report-page.test.tsx
git commit -m "feat: collapse report tool evidence output"
```
