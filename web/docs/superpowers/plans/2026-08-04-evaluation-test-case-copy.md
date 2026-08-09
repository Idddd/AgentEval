# Evaluation Test Case Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename all user-visible Policy copy in the new Evaluation module to Test Case while preserving internal dataset behavior.

**Architecture:** Replace rendered strings only in Evaluation navigation, breadcrumbs, routes, pages, mock errors, and descriptions. Keep Security policy terminology, dataset identifiers, commands, fixtures, and `/evaluation/datasets` URLs unchanged.

**Tech Stack:** React, TypeScript, Vitest, TanStack Router

## Global Constraints

- Map singular `Policy` to `Test Case` and plural `Policies` to `Test Cases` only inside the new Evaluation module.
- Preserve `Access Policies` and `Runtime Policies`.
- Preserve internal dataset identifiers and URLs.
- Skip the full test suite; use focused tests, typecheck, and browser verification.
- Do not use subagents or request further confirmation.

---

### Task 1: Replace Evaluation Policy copy

**Files:**
- Modify: `apps/control/src/components/layout/app-shell-navigation.test.ts`
- Modify: `apps/control/src/components/layout/app-shell.tsx`
- Modify: `apps/control/src/components/layout/header-breadcrumb.test.ts`
- Modify: `apps/control/src/components/layout/header-breadcrumb.tsx`
- Modify: `apps/control/src/routes/$projectId/evaluation/datasets/index.tsx`
- Modify: `apps/control/src/routes/$projectId/evaluation/datasets/$datasetId.tsx`
- Modify: `apps/control/src/routes/$projectId/evaluation/runs/new.tsx`
- Modify: `apps/control/src/features/evaluation-layer/datasets/dataset-pages.tsx`
- Modify: `apps/control/src/features/evaluation-layer/runs/run-pages.tsx`
- Modify: `apps/control/src/features/evaluation-layer/reports/report-page.tsx`
- Modify: `apps/control/src/features/evaluation-layer/mock-store.ts`
- Modify: `apps/control/src/features/evaluation-layer/fixtures.ts`

**Interfaces:**
- Consumes: existing Evaluation dataset UI and mock commands.
- Produces: Test Case terminology with unchanged data and route behavior.

- [ ] **Step 1: Update focused test expectations**

```ts
expect(evaluationLabels).toEqual(["Agent", "Test Case", "Evaluation", "Overview", "Trace"]);
expect(testCaseBreadcrumb.label).toBe("Test Case");
expect(testCaseDetailBreadcrumb.label).toBe("Test Case detail");
```

- [ ] **Step 2: Confirm the tests fail on existing Policy copy**

```powershell
npm.cmd test --workspace @tasklattice/control -- --run src/components/layout/app-shell-navigation.test.ts src/components/layout/header-breadcrumb.test.ts
```

Expected: both focused assertions report `Policy` instead of `Test Case`.

- [ ] **Step 3: Replace rendered Evaluation strings**

Change `Policy` to `Test Case` in the listed Evaluation files. Do not change `Access Policies`, `Runtime Policies`, identifiers such as `datasetId`, or route strings containing `/datasets`.

- [ ] **Step 4: Run lightweight verification**

```powershell
npm.cmd test --workspace @tasklattice/control -- --run src/components/layout/app-shell-navigation.test.ts src/components/layout/header-breadcrumb.test.ts src/features/evaluation-layer/mock-store.test.ts
npm.cmd run typecheck --workspace @tasklattice/control
```

Expected: all focused tests and typecheck pass. Reload `/individual/evaluation/datasets` and verify `Test Case` in the sidebar, breadcrumb, title, and create button.

- [ ] **Step 5: Commit**

```powershell
git add apps/control/src/components/layout apps/control/src/routes/'$projectId'/evaluation apps/control/src/features/evaluation-layer
git commit -m "refactor(control): rename evaluation policies to test cases"
```
