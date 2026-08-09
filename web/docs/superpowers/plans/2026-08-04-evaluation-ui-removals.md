# Evaluation UI Removals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Evaluation reset button and legacy Observer Evaluations navigation item without deleting underlying logic or routes.

**Architecture:** Make two presentation-only changes in the existing shared page frame and navigation configuration. Preserve the mock store reset method and the legacy Evaluations route so no data or feature behavior is migrated.

**Tech Stack:** React, TypeScript, Vitest, TanStack Router

## Global Constraints

- Keep reset logic and legacy Evaluations routes intact.
- Do not modify the new Evaluation module navigation order.
- Do not use subagents.

---

### Task 1: Remove the two visible controls

**Files:**
- Modify: `apps/control/src/components/layout/app-shell-navigation.test.ts`
- Modify: `apps/control/src/components/layout/app-shell.tsx`
- Modify: `apps/control/src/features/evaluation-layer/shared/evaluation-page-frame.tsx`

**Interfaces:**
- Consumes: `projectNavGroups` and `EvaluationLayerPageFrame`.
- Produces: Observer navigation labels `Traces` and `Cost`; Evaluation headers with only their route-specific `action`.

- [ ] **Step 1: Update the focused navigation expectation**

```ts
expect(
  projectNavGroups
    .find((group) => group.label === "Observer")
    ?.items.map((item) => item.label),
).toEqual(["Traces", "Cost"]);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm.cmd test --workspace @tasklattice/control -- --run src/components/layout/app-shell-navigation.test.ts`

Expected: FAIL because Observer still contains `Evaluations`.

- [ ] **Step 3: Apply the minimal presentation changes**

Remove the `Evaluations` item from the Observer `items` array. In `EvaluationLayerPageFrame`, remove the reset button, its icon, button/store imports, and render `actions={action}` directly.

- [ ] **Step 4: Verify the implementation**

Run: `npm.cmd test --workspace @tasklattice/control -- --run src/components/layout/app-shell-navigation.test.ts`

Expected: PASS.

Run: `npm.cmd run typecheck --workspace @tasklattice/control`

Expected: PASS.

Reload `/individual/evaluation/targets` and confirm `Reset demo` and the Observer `Evaluations` entry are absent.

- [ ] **Step 5: Commit**

```powershell
git add apps/control/src/components/layout/app-shell-navigation.test.ts apps/control/src/components/layout/app-shell.tsx apps/control/src/features/evaluation-layer/shared/evaluation-page-frame.tsx
git commit -m "refactor(control): simplify evaluation navigation"
```
