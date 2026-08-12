# Evaluation UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the four approved layout and navigation refinements without changing mock evaluation behavior or Dataset card selection.

**Architecture:** Reuse `EvaluationSection.action` for the compact Sampling control, update the static project navigation definition, and remove the two obsolete Catalog render branches. Protect each consumer-visible change with component or navigation tests before production edits.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Preserve all mock data and evaluator behavior.
- Preserve Dataset card selection, New Dataset, and Guardrail test packs.
- Do not modify or stage unrelated existing Dataset card-selector work.

---

### Task 1: Compact Sampling Header

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/overview/overview-page.test.tsx`
- Modify: `web/apps/control/src/features/evaluation-layer/overview/overview-page.tsx`

**Interfaces:**
- Consumes: `EvaluationSection.action: ReactNode`
- Produces: one `Sampling rate` slider inside the Evaluators card header

- [ ] Add a failing test that locates the Evaluators card header, asserts the Sampling heading and slider are inside it, and asserts there is no second Sampling heading.
- [ ] Run `npm.cmd test -- apps/control/src/features/evaluation-layer/overview/overview-page.test.tsx` and verify the header-location assertion fails.
- [ ] Move the existing Sampling markup into `EvaluationSection`'s `action` prop and remove the lower Sampling block.
- [ ] Re-run the focused test and verify it passes.

### Task 2: Consolidated Guardrails Navigation

**Files:**
- Modify: `web/apps/control/src/components/layout/app-shell-navigation.test.ts`
- Modify: `web/apps/control/src/components/layout/app-shell.tsx`

**Interfaces:**
- Produces: Security Guardrails route `/$projectId/governance/guardrails`; no `Guard Governance` group

- [ ] Replace the existing governance navigation expectations with failing assertions that the group is absent, Security Guardrails uses the governance route, and the Security item is active on governance detail routes.
- [ ] Run `npm.cmd test -- apps/control/src/components/layout/app-shell-navigation.test.ts` and verify those assertions fail.
- [ ] Change the Security Guardrails route, remove the Guard Governance group, and retain governance route prefix handling in `itemIsActive`.
- [ ] Re-run the focused test and verify it passes.

### Task 3: Simplified Catalog Test Coverage

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx`
- Modify: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.tsx`

**Interfaces:**
- Preserves: `DatasetCardSelector`
- Removes: Generate Dataset action and embedded `EvaluationDatasetDetail` placeholder in Test coverage

- [ ] Update Catalog tests to assert Generate Dataset is absent while Dataset cards, New Dataset, and Guardrail Test Packs remain available.
- [ ] Run the focused Catalog test and verify it fails because Generate Dataset still renders.
- [ ] Remove the action row, embedded Dataset detail row, unused generation handler, and imports made unused by those removals.
- [ ] Re-run the focused Catalog test and verify it passes.

### Task 4: Verification and Commit

**Files:**
- Verify all files above plus preserved Dataset card-selector files.

- [ ] Run the three focused test files.
- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd test`.
- [ ] Reload Overview and Catalog in the local browser and inspect the approved changes.
- [ ] Stage only this plan and the scoped implementation/test hunks, then commit with `feat: polish Evaluation navigation and layout`.
