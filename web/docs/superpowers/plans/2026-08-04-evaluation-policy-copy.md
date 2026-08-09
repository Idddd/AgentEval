# Evaluation Policy Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename all user-visible Dataset copy in the new Evaluation module to Policy and remove every shared Mock demo badge while preserving internal behavior.

**Architecture:** Update only rendered strings in navigation, breadcrumbs, route frames, Evaluation pages, fixture descriptions, and surfaced mock errors. Remove the badge once in the shared Evaluation page frame. Keep existing TypeScript identifiers, store commands, fixture keys, tests for internal validation, and `/evaluation/datasets` routes unchanged.

**Tech Stack:** React, TypeScript, Vitest, TanStack Router

## Global Constraints

- Map singular `Dataset` to `Policy` and plural `Datasets` to `Policies`.
- Do not modify the legacy Evaluations module.
- Do not rename internal dataset identifiers or URLs.
- Skip the full test suite; use focused tests, typecheck, and browser verification.
- Do not use subagents.

---

### Task 1: Rename Evaluation Dataset copy to Policy

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
- Modify: `apps/control/src/features/evaluation-layer/shared/evaluation-page-frame.tsx`

**Interfaces:**
- Consumes: existing Evaluation dataset routes, components, mock store, and fixture graph.
- Produces: Policy terminology and badge-free Evaluation headers in every user-visible location with unchanged route and data behavior.

- [ ] **Step 1: Update focused navigation and breadcrumb expectations**

```ts
expect(evaluationLabels).toEqual(["Agent", "Policy", "Evaluation", "Overview", "Trace"]);
expect(datasetBreadcrumb).toEqual({ href: "/individual/evaluation/datasets", label: "Policy" });
expect(datasetDetailBreadcrumb.label).toBe("Policy detail");
```

- [ ] **Step 2: Run focused tests and confirm they fail on Dataset copy**

Run: `npm.cmd test --workspace @tasklattice/control -- --run src/components/layout/app-shell-navigation.test.ts src/components/layout/header-breadcrumb.test.ts`

Expected: FAIL because the UI still returns `Dataset` and `Dataset detail`.

- [ ] **Step 3: Replace rendered strings only**

Change visible singular and plural Dataset labels to Policy and Policies in the files listed above. Remove the `Badge` import and `badge` prop from `EvaluationLayerPageFrame`. Keep identifiers such as `datasetId`, `EvaluationDatasetList`, `createDataset`, and route strings containing `/datasets` unchanged.

- [ ] **Step 4: Run lightweight verification**

Run the focused tests from Step 2 and expect PASS.

Run: `npm.cmd run typecheck --workspace @tasklattice/control`

Expected: PASS.

Reload `/individual/evaluation/datasets` and confirm the sidebar, breadcrumb, page title, and create button use Policy terminology, and that `Mock demo` is absent.

- [ ] **Step 5: Commit**

```powershell
git add apps/control/src/components/layout apps/control/src/routes/'$projectId'/evaluation apps/control/src/features/evaluation-layer
git commit -m "refactor(control): rename evaluation datasets to policies"
```
