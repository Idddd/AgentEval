# Remove Report LLM Judge UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the complete LLM Judge presentation from evaluation reports while preserving recorded Judge data and every surrounding report section.

**Architecture:** Delete the single `LLM Judge` `EvaluationSection` from `EvaluationReportDetail`; do not alter trace or fixture data. Protect the display boundary with a report-level test that uses a fixture containing Judge data and verifies Tool Evidence flows directly to Usage & Cost.

**Tech Stack:** React, TypeScript, Vitest, Testing Library.

## Global Constraints

- Remove the `LLM Judge` heading, description, model labels, score grids, summaries, and unavailable placeholders from report rendering.
- Preserve all Judge data in fixtures, traces, models, stores, and other pages.
- Preserve Summary, Suggestion, Test Results, Tool Evidence, Usage & Cost, and Evaluation decision rendering.
- Do not add a feature flag, replacement section, API change, or data migration.

---

### Task 1: Remove the LLM Judge report section

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/reports/report-page.tsx:661-693`
- Test: `web/apps/control/src/features/evaluation-layer/reports/report-page.test.tsx`

**Interfaces:**
- Consumes: existing `EvaluationReportDetail` and recorded report fixtures.
- Produces: a report DOM with no LLM Judge section while all adjacent sections remain intact.

- [ ] **Step 1: Write the failing display-boundary test**

Add this test inside the existing report describe block:

```tsx
it('omits LLM Judge presentation while keeping adjacent report sections', () => {
  render(reportView('hidden'));

  const toolEvidence = screen.getByText('Tool Evidence').closest('[data-slot="card"]');
  const usage = screen.getByText('Usage & Cost').closest('[data-slot="card"]');

  expect(screen.queryByText('LLM Judge')).toBeNull();
  expect(screen.queryByText('Recorded Langfuse-compatible judge evidence; no live model request is made.')).toBeNull();
  expect(screen.queryByText('Recorded demo judge')).toBeNull();
  expect(toolEvidence).not.toBeNull();
  expect(usage).not.toBeNull();
  expect(
    toolEvidence!.compareDocumentPosition(usage!) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

From `web`, run:

```powershell
npm.cmd test --workspace @tasklattice/control -- report-page.test.tsx
```

Expected: FAIL because `LLM Judge`, its description, and `Recorded demo judge` are still rendered.

- [ ] **Step 3: Remove only the presentation section**

Delete the complete block beginning with:

```tsx
<EvaluationSection
  title="LLM Judge"
  description="Recorded Langfuse-compatible judge evidence; no live model request is made."
>
```

and ending at that section's matching `</EvaluationSection>`. If TypeScript reports that `KeyValueGrid` is unused afterward, remove `KeyValueGrid` from the `evaluation-ui` import list. Do not modify `trace.judge` data or other report sections.

- [ ] **Step 4: Run focused report and Catalog tests and verify GREEN**

From `web`, run:

```powershell
npm.cmd test --workspace @tasklattice/control -- report-page.test.tsx catalog-page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Verify the full workspace and browser**

From `web`, run:

```powershell
npm.cmd run typecheck
npm.cmd test
```

Then reload the completed Office Assistant report in Catalog and verify Tool Evidence is followed by Usage & Cost with no LLM Judge content.

- [ ] **Step 6: Commit**

```powershell
git add web/apps/control/src/features/evaluation-layer/reports/report-page.tsx web/apps/control/src/features/evaluation-layer/reports/report-page.test.tsx
git commit -m "refactor: remove report LLM Judge UI"
```

