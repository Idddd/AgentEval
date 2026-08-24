# Evaluation Demo UI Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the mock Evaluation demo so evaluator alert settings are row-scoped, the Onboarding Assistant is the main cross-page example, report guidance uses natural language, and demo role switching is consolidated into the account menu.

**Architecture:** Keep the feature entirely in the existing client-side fixture and mock-store layer. Extend evaluator records with their own threshold and alert values, derive Overview status from those records, and add a small demo-persona adapter that maps the three user-facing roles onto existing project permissions without changing backend authorization.

**Tech Stack:** React 19, TypeScript, TanStack Router, Vitest, Testing Library, Tailwind CSS, lucide-react.

## Global Constraints

- All data and interactions remain mock-only; do not add API calls or database changes.
- Preserve existing functionality and the existing Catalog lifecycle classification.
- The three visible demo personas are exactly `Admin`, `Agent Wizard`, and `End user`.
- `Agent Wizard` maps to the existing ADA permissions; `End user` only sees all six items in the Agentic navigation group.
- Keep the existing uncommitted Dataset card-selector files and edits out of this work's commits.
- Use tests first for each behavior change and make focused commits.

---

### Task 1: Move threshold and alert configuration onto evaluator records

**Files:**
- Modify: `apps/control/src/features/evaluation-layer/model.ts`
- Modify: `apps/control/src/features/evaluation-layer/fixtures.ts`
- Modify: `apps/control/src/features/evaluation-layer/fixture-validation.ts`
- Test: `apps/control/src/features/evaluation-layer/fixture-validation.test.ts`
- Modify: `apps/control/src/features/evaluation-layer/mock-store.ts`
- Test: `apps/control/src/features/evaluation-layer/mock-store.test.ts`
- Modify: `apps/control/src/features/evaluation-layer/overview/overview-evaluator-policy.ts`
- Test: `apps/control/src/features/evaluation-layer/overview/overview-evaluator-policy.test.ts`

**Interfaces:**
- Produces: `EvaluationLayerEvaluator.minimumScore: number` and `EvaluationLayerEvaluator.sendAlert: boolean`.
- Produces: `setEvaluatorMinimumScore(evaluatorId: string, score: number): void` and `setEvaluatorSendAlert(evaluatorId: string, enabled: boolean): void` on the mock-store context.
- Produces: evaluator policy functions that derive pass/fail and alert state from each enabled evaluator's own configuration.

- [ ] **Step 1: Write failing model, validation, and store tests**

Add assertions that every fixture evaluator has a score in `0..100`, that invalid per-row values are rejected, and that both setters update only the evaluator with the matching ID.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
npm test --workspace @tasklattice/control -- --run apps/control/src/features/evaluation-layer/fixture-validation.test.ts apps/control/src/features/evaluation-layer/mock-store.test.ts
```

Expected: FAIL because the evaluator fields and setters do not exist.

- [ ] **Step 3: Implement the evaluator fields and immutable setters**

Extend the evaluator interface and both fixture rows with `minimumScore: 80` and `sendAlert: false`. Remove the corresponding global settings properties, validate the new row fields, and update only the selected evaluator through immutable state replacement.

- [ ] **Step 4: Write failing evaluator-policy tests**

Cover these cases with two enabled evaluators: all passing yields `PASS`; one score below that evaluator's threshold yields `FAIL`; a failing evaluator with `sendAlert: true` raises an alert; enabling alert on a passing evaluator does not; runtime `ERROR` remains `ERROR`; and no evaluator data remains the existing neutral/pass demo state.

- [ ] **Step 5: Implement and verify the policy**

Change policy inputs to consume evaluator records directly and compare each judge score against its own `minimumScore`. Compute alert state only from failing evaluators whose own `sendAlert` is true.

Run:

```powershell
npm test --workspace @tasklattice/control -- --run apps/control/src/features/evaluation-layer/fixture-validation.test.ts apps/control/src/features/evaluation-layer/mock-store.test.ts apps/control/src/features/evaluation-layer/overview/overview-evaluator-policy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit evaluator-scoped configuration**

Stage only the files listed in this task and commit with `feat: scope alert settings to evaluators`.

---

### Task 2: Simplify the Overview evaluator and Sampling UI

**Files:**
- Modify: `apps/control/src/features/evaluation-layer/overview/overview-page.tsx`
- Test: `apps/control/src/features/evaluation-layer/overview/overview-page.test.tsx`

**Interfaces:**
- Consumes: evaluator row fields and mock-store setters from Task 1.
- Produces: evaluator table columns ordered `Name`, `Source`, `Version`, `Enabled`, `Minimum score`, `Send alert`.

- [ ] **Step 1: Write failing UI tests**

Assert each evaluator row has its own numeric/range threshold control and alert checkbox after Enabled. Assert changing one row does not change the other. Assert the old global setting cards, Sampling green progress bar, and Captured/Estimated cost/Estimated saving/Dropped failures metrics are absent while the Sampling slider and percentage remain.

- [ ] **Step 2: Run the Overview test and verify failure**

Run:

```powershell
npm test --workspace @tasklattice/control -- --run apps/control/src/features/evaluation-layer/overview/overview-page.test.tsx
```

Expected: FAIL on missing row-scoped controls and still-visible global/metric UI.

- [ ] **Step 3: Implement the table controls and compact Sampling section**

Render an accessible per-row threshold slider/value and alert checkbox, wired to Task 1 setters. Delete the global threshold and alert cards. Retain the Sampling heading, explanatory copy, slider, and current percentage; remove the green bar and four calculated metric cards.

- [ ] **Step 4: Run the Overview tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit the Overview refinement**

Stage the two Overview files and commit with `feat: refine Overview evaluator controls`.

---

### Task 3: Make Onboarding Assistant the cross-page showcase

**Files:**
- Modify: `apps/control/src/components/agent-garden/agent-garden-icon.tsx`
- Create: `apps/control/src/components/agent-garden/agent-garden-icon.test.tsx`
- Modify: `apps/control/src/features/evaluation-layer/fixtures.ts`
- Modify: `apps/control/src/features/evaluation-layer/fixture-validation.test.ts`
- Modify: `apps/control/src/features/evaluation-layer/overview/overview-page.tsx`
- Test: `apps/control/src/features/evaluation-layer/overview/overview-page.test.tsx`
- Modify: `apps/control/src/features/evaluation-layer/traces/trace-pages.tsx`
- Test: `apps/control/src/features/evaluation-layer/traces/trace-pages.test.tsx`
- Modify if needed: `apps/control/src/features/evaluation-layer/catalog/workspace-view-model.ts`
- Test if needed: `apps/control/src/features/evaluation-layer/catalog/workspace-view-model.test.ts`

**Interfaces:**
- Produces: `user-plus` in the shared Agent Garden icon registry with a visually stronger cyan-accent treatment.
- Produces: fixture-valid live-monitoring traces for `demo-onboarding-assistant` that are excluded from Catalog lifecycle state.

- [ ] **Step 1: Write failing icon and fixture tests**

Assert `user-plus` renders a distinct icon and accent class. Add fixture assertions that Onboarding Assistant has trace records and that the Catalog view model still reports its prior not-evaluated lifecycle state.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```powershell
npm test --workspace @tasklattice/control -- --run apps/control/src/components/agent-garden/agent-garden-icon.test.tsx apps/control/src/features/evaluation-layer/fixture-validation.test.ts apps/control/src/features/evaluation-layer/catalog/workspace-view-model.test.ts
```

Expected: FAIL because `user-plus` is unresolved and no Onboarding traces exist.

- [ ] **Step 3: Implement icon and fixture-safe showcase traces**

Register lucide `UserPlus`. Add an Onboarding live-monitoring run and several traces using existing evaluator IDs and revisions. If the lifecycle selector does not already exclude the live-monitoring prefix, add that exclusion without touching the dirty Catalog page files.

- [ ] **Step 4: Write failing Overview and Trace UI tests**

Assert Onboarding Assistant rows sort before other agents in Overview and Traces. Assert the trace detail header renders the Onboarding icon, display name, and identifier for an Onboarding trace.

- [ ] **Step 5: Implement showcase sorting and trace identity**

Use a stable comparator that puts `demo-onboarding-assistant` first and leaves existing relative order unchanged. Resolve the trace target in the detail page and render its shared icon plus identity above trace metadata.

- [ ] **Step 6: Run all Task 3 tests**

Run the focused commands from Steps 2 and 4. Expected: PASS.

- [ ] **Step 7: Commit showcase changes**

Stage only the Task 3 files and commit with `feat: showcase Onboarding Assistant`.

---

### Task 4: Rename report Reflection to natural-language Suggestion

**Files:**
- Modify: `apps/control/src/features/evaluation-layer/reports/report-page.tsx`
- Test: `apps/control/src/features/evaluation-layer/reports/report-page.test.tsx`
- Modify: `apps/control/src/features/evaluation-layer/fixtures.ts`
- Modify: `apps/control/src/features/evaluation-layer/mock-store.ts`

**Interfaces:**
- Keeps internal reflection/rejection identifiers unchanged.
- Produces user-visible `Suggestion` headings and sentence-form recommendations.

- [ ] **Step 1: Write failing report-copy tests**

Render a completed report and assert `Suggestion` is visible, `Reflection` is not visible, and the recommendation reads as a complete natural-language action sentence rather than a terse system label.

- [ ] **Step 2: Run the report test and verify failure**

Run:

```powershell
npm test --workspace @tasklattice/control -- --run apps/control/src/features/evaluation-layer/reports/report-page.test.tsx
```

Expected: FAIL because the UI still says Reflection.

- [ ] **Step 3: Update visible copy and mock suggestion text**

Rename only user-facing labels and descriptions. Rewrite fixture/default suggestion strings as concise recommendations such as “Move permission checks before privileged tool execution to prevent policy bypasses.”

- [ ] **Step 4: Run report and store tests**

Run:

```powershell
npm test --workspace @tasklattice/control -- --run apps/control/src/features/evaluation-layer/reports/report-page.test.tsx apps/control/src/features/evaluation-layer/mock-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit report copy**

Stage the Task 4 files and commit with `feat: present report suggestions in natural language`.

---

### Task 5: Consolidate the three demo personas into the account menu

**Files:**
- Modify: `apps/control/src/hooks/use-demo-role.tsx`
- Create: `apps/control/src/hooks/use-demo-role.test.tsx`
- Modify: `apps/control/src/components/account/account-menu.tsx`
- Create or modify: `apps/control/src/components/account/account-menu.test.tsx`
- Modify: `apps/control/src/components/layout/app-shell.tsx`
- Test: `apps/control/src/components/layout/app-shell-navigation.test.ts`

**Interfaces:**
- Produces: `DemoPersona = "admin" | "agent-wizard" | "end-user"`.
- Produces: `projectRoleForDemoPersona(persona)` mapping to `admin`, `ada`, and frontend-demo `frt` respectively.
- Keeps `roleOverride` available for existing permission consumers and tests.

- [ ] **Step 1: Write failing persona mapping tests**

Assert the exact three display choices and mapping: Admin -> admin, Agent Wizard -> ada, End user -> frt. Assert the selected persona persists through the existing local-storage mechanism.

- [ ] **Step 2: Run focused hook tests and verify failure**

Run:

```powershell
npm test --workspace @tasklattice/control -- --run apps/control/src/hooks/use-demo-role.test.tsx
```

Expected: FAIL because persona state does not exist.

- [ ] **Step 3: Implement the persona adapter**

Store persona rather than exposing six project roles in the demo UI, derive `roleOverride`, and migrate recognized old stored values to the closest new persona. Keep the context shape backward compatible where existing consumers require it.

- [ ] **Step 4: Write failing navigation and account-menu tests**

Assert the standalone “Demo · View as role” footer control is gone. Open Local account and assert the three choices appear there. Assert Agent Wizard receives ADA-visible navigation. Assert End user sees exactly the Agentic group with Agent Garden, Instances, Skills, MCP Servers, Knowledge Base, and Memory, and no Security/Evaluation/Observer/Admin groups.

- [ ] **Step 5: Implement account-menu selection and End-user navigation filtering**

Move the selector into the account dropdown. In `ProjectSidebar`, special-case `persona === "end-user"` to retain the complete Agentic group while leaving ordinary FRT permissions unchanged elsewhere. Remove the old footer switcher component and imports.

- [ ] **Step 6: Run Task 5 tests**

Run:

```powershell
npm test --workspace @tasklattice/control -- --run apps/control/src/hooks/use-demo-role.test.tsx apps/control/src/components/account/account-menu.test.tsx apps/control/src/components/layout/app-shell-navigation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit persona UI changes**

Stage only the Task 5 files and commit with `feat: simplify demo persona switching`.

---

### Task 6: Regression verification and clean handoff

**Files:**
- Verify only; modify only if a failing test identifies a regression within this feature's scope.

**Interfaces:**
- Consumes all deliverables from Tasks 1–5.
- Produces a clean, verified branch while preserving the separate uncommitted Dataset card-selector work.

- [ ] **Step 1: Run focused feature tests together**

```powershell
npm test --workspace @tasklattice/control -- --run apps/control/src/features/evaluation-layer apps/control/src/components/layout/app-shell-navigation.test.ts apps/control/src/components/account apps/control/src/hooks/use-demo-role.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

```powershell
npm run typecheck --workspace @tasklattice/control
```

Expected: exit code 0.

- [ ] **Step 3: Run the full repository test suite**

```powershell
npm test
```

Expected: all workspaces pass, with only pre-existing documented skips.

- [ ] **Step 4: Inspect git status and diff scope**

Confirm the only remaining uncommitted files are the previously existing Dataset selector files, and confirm no generated files or unrelated edits were included in feature commits.

- [ ] **Step 5: Record final verification**

Report the focused test, typecheck, and full-suite results with exact counts where available. Do not claim completion until fresh command output is green.
