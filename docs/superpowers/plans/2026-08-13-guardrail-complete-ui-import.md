# Guardrail Complete UI Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace only AgentEval's Guard Governance Guardrail registry and detail experience with the complete TaskLattice Guard UI, backed entirely by in-memory mock data.

**Architecture:** Keep AgentEval's application shell and canonical project routes. Add a Guard-compatible snake_case view-model adapter over the existing camelCase mock store, then port the Guard registry, creation flow, detail workflow, five detail tabs, and complete evidence presentation into focused components. The Assignments tab remains read-only; the independent Assignment, Enforcement, Integration, and Evidence pages are untouched.

**Tech Stack:** React 19, TypeScript, TanStack Router, Vitest, Testing Library, Tailwind CSS, existing shadcn/Radix components, existing Guard Governance in-memory store.

## Global Constraints

- Import only the Guardrail registry, creation flow, and Guardrail detail UI.
- Do not change the independent Assignment, Enforcement, Integration, or Evidence pages.
- Keep AgentEval authentication, project sidebar, header, breadcrumb, and project routing.
- Use mock data and in-memory mutations only; do not call the Guard API or add a real API.
- Preserve Guard information hierarchy, responsive behavior, blue accents, spacing, corner radii, and complete evidence blocks inside the page boundary.
- Preserve the existing AgentEval Security Guardrails feature and all unrelated functionality.
- Use TanStack Router links for registry/detail navigation; do not use plain anchors for internal routes.
- Treat the existing modified `web/apps/control/src/features/evaluation-layer/overview/behavior-page.test.tsx` as user-owned and do not stage or edit it.

---

### Task 1: Guard-Compatible Mock View Model

**Files:**
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-view-model.ts`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-view-model.test.ts`
- Modify: `web/apps/control/src/features/guard-governance/model.ts`
- Modify: `web/apps/control/src/features/guard-governance/fixtures.ts`

**Interfaces:**
- Consumes: `GuardGovernanceState`, `Guardrail`, `GuardrailTestCase`, `GuardrailTestRun`, `GuardrailVersion`, and `Assignment` from the existing mock domain.
- Produces: `GuardGuardrail`, `GuardTestCase`, `GuardTestRun`, `GuardVersion`, `GuardAssignmentSummary`, and `toGuardrailViewModel(state, guardrailId?)` using Guard's snake_case property names.

- [ ] **Step 1: Write the failing adapter tests**

```ts
it("maps the complete Guard evidence shape without losing nested data", () => {
  const state = cloneGuardGovernanceFixtures("individual");
  const view = toGuardrailViewModel(state, "guardrail-production");
  expect(view.guardrail?.latest_test_run?.results[0]).toMatchObject({
    trusted_instruction: expect.any(String),
    target_source: expect.any(String),
    findings: expect.any(Array),
    trace: expect.any(Array),
  });
  expect(view.guardrail?.coverage.length).toBeGreaterThan(0);
  expect(view.versions.length).toBeGreaterThan(0);
  expect(view.assignments.length).toBeGreaterThan(0);
});

it("keeps default, ready, needs-testing, and disabled fixture states", () => {
  const view = toGuardrailViewModel(cloneGuardGovernanceFixtures("individual"));
  expect(view.guardrails.map((item) => item.status)).toEqual(
    expect.arrayContaining(["protected", "ready", "needs_testing", "disabled"]),
  );
});
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run: `npm test --workspace @tasklattice/control -- guardrail-view-model.test.ts`

Expected: FAIL because `guardrail-view-model.ts` and its exported contracts do not exist.

- [ ] **Step 3: Implement the Guard-compatible contracts and pure mapper**

```ts
export type GuardGuardrail = {
  id: string;
  name: string;
  purpose: string;
  allowed_topics: string[];
  restricted_topics: string[];
  controls: GuardControl[];
  status: "needs_testing" | "ready" | "protected" | "disabled";
  latest_test_run: GuardTestRun | null;
  assignment_count: number;
  test_case_count: number;
  tested_current: boolean;
  is_default: boolean;
  system_managed: boolean;
  local_only: boolean;
  coverage: GuardRiskCoverage[];
  updated_at: string;
};

export function toGuardrailViewModel(
  state: GuardGovernanceState,
  guardrailId?: string,
): GuardrailViewModel {
  const guardrails = state.guardrails.map(mapGuardrail);
  return {
    guardrails,
    guardrail: guardrailId ? guardrails.find((item) => item.id === guardrailId) ?? null : null,
    test_cases: guardrailId ? state.guardrails.find((item) => item.id === guardrailId)?.testCases.map(mapTestCase) ?? [] : [],
    versions: state.versions.filter((item) => item.guardrailId === guardrailId).map(mapVersion),
    assignments: state.assignments.filter((item) => item.guardrailId === guardrailId).map(mapAssignment),
  };
}
```

Extend fixtures only where necessary so at least one result contains grounding scores, claims, automated-reasoning proofs, input/output content, and a multi-step trace.

- [ ] **Step 4: Run the adapter tests and verify GREEN**

Run: `npm test --workspace @tasklattice/control -- guardrail-view-model.test.ts`

Expected: PASS with the complete nested shape preserved.

- [ ] **Step 5: Commit the adapter**

```powershell
git add web/apps/control/src/features/guard-governance/guardrails/guardrail-view-model.ts web/apps/control/src/features/guard-governance/guardrails/guardrail-view-model.test.ts web/apps/control/src/features/guard-governance/model.ts web/apps/control/src/features/guard-governance/fixtures.ts
git commit -m "feat: add complete guardrail mock view model"
```

### Task 2: Guard Product Components and Localization

**Files:**
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-copy.ts`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guard-product-ui.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-product.css`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guard-product-ui.test.tsx`
- Modify: `web/apps/control/src/styles.css`

**Interfaces:**
- Consumes: application language if available, otherwise `en`.
- Produces: `useGuardrailCopy()`, `GuardPageHeader`, `GuardStateBadge`, `GuardMetric`, `GuardInfoNotice`, `GuardEmptyState`, and `GuardWorkflowStatus`.

- [ ] **Step 1: Write failing presentation tests**

```tsx
it("renders the Guard page hierarchy and localized default copy", () => {
  render(<GuardPageHeader eyebrow="Governance / Model safety" title="Guardrails" description="Complete description" />);
  expect(screen.getByText("Governance / Model safety")).not.toBeNull();
  expect(screen.getByRole("heading", { level: 1, name: "Guardrails" })).not.toBeNull();
});

it("maps every supported state to visible Guard copy", () => {
  render(<>{["protected", "ready", "needs_testing", "disabled"].map((state) => <GuardStateBadge key={state} state={state} />)}</>);
  expect(screen.getByText("Protected")).not.toBeNull();
  expect(screen.getByText("Needs testing")).not.toBeNull();
  expect(screen.getByText("Disabled")).not.toBeNull();
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test --workspace @tasklattice/control -- guard-product-ui.test.tsx`

Expected: FAIL because the imported Guard primitives do not exist.

- [ ] **Step 3: Port the Guard presentation primitives and scoped theme**

```tsx
export function GuardPageHeader({ eyebrow, title, description, action }: Props) {
  return <header className="guard-page-header grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
    <div><p className="guard-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>
    {action}
  </header>;
}
```

Scope imported visual tokens under `.guardrail-product` so Guard blue accents and larger radii do not alter the rest of AgentEval.

- [ ] **Step 4: Run presentation tests and verify GREEN**

Run: `npm test --workspace @tasklattice/control -- guard-product-ui.test.tsx`

Expected: PASS for hierarchy, state copy, and scoped classes.

- [ ] **Step 5: Commit product components**

```powershell
git add web/apps/control/src/features/guard-governance/guardrails/guardrail-copy.ts web/apps/control/src/features/guard-governance/guardrails/guard-product-ui.tsx web/apps/control/src/features/guard-governance/guardrails/guardrail-product.css web/apps/control/src/features/guard-governance/guardrails/guard-product-ui.test.tsx web/apps/control/src/styles.css
git commit -m "feat: port guardrail product UI primitives"
```

### Task 3: Complete Registry and Creation Flow

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/guardrails/guardrails-page.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/create-guardrail-sheet.tsx`
- Modify: `web/apps/control/src/features/guard-governance/guardrails/guardrails-page.test.tsx`

**Interfaces:**
- Consumes: `toGuardrailViewModel`, `useGuardGovernanceStore`, Guard product components, templates, and Control definitions.
- Produces: complete `GuardrailsPage` registry and `CreateGuardrailSheet` backed only by mock store operations.

- [ ] **Step 1: Replace registry tests with failing Guard-reference assertions**

```tsx
it("matches the Guard registry structure without AgentEval summary cards", () => {
  renderGovernance(<GuardrailsPage projectId="individual" />);
  expect(screen.getByText("Guardrail registry · 4")).not.toBeNull();
  expect(screen.getByText("Select a Guardrail to view configuration and test evidence.")).not.toBeNull();
  expect(screen.queryByText("Tested current")).toBeNull();
  expect(screen.getByRole("link", { name: /Production Safety/ }).getAttribute("href"))
    .toBe("/individual/governance/guardrails/guardrail-production");
});

it("creates a Guardrail with the complete template flow", async () => {
  const user = userEvent.setup();
  renderGovernance(<GuardrailsPage projectId="individual" />);
  await user.click(screen.getByRole("button", { name: "Create Guardrail" }));
  await user.click(screen.getByRole("button", { name: /Enterprise Safety Baseline/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText(/Organization name/), "TaskLattice");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("Included Controls")).not.toBeNull();
});
```

- [ ] **Step 2: Run the registry tests and verify RED**

Run: `npm test --workspace @tasklattice/control -- guardrails-page.test.tsx`

Expected: FAIL because metric cards still render, links are plain anchors, and the complete creation content is absent.

- [ ] **Step 3: Port the Guard registry DOM and responsive behavior**

Use `Link` from `@tanstack/react-router`:

```tsx
<Link
  to="/$projectId/governance/guardrails/$guardrailId"
  params={{ projectId, guardrailId: guardrail.id }}
  className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
  <GuardrailRowContent guardrail={guardrail} />
</Link>
```

Remove the three AgentEval metric cards and reproduce Guard loading, empty, registry header, hidden responsive columns, default localization, and row affordance.

- [ ] **Step 4: Port the complete creation sheet using mock operations**

Keep template/blank choice, intent analysis, parameters, allowed/restricted topics, Controls review, reasoning-policy validation, inline error state, and local store creation. Do not import React Query or Guard API functions.

- [ ] **Step 5: Run registry tests and verify GREEN**

Run: `npm test --workspace @tasklattice/control -- guardrails-page.test.tsx`

Expected: PASS for structure, internal links, creation flow, and mock-only state updates.

- [ ] **Step 6: Commit registry and creation flow**

```powershell
git add web/apps/control/src/features/guard-governance/guardrails/guardrails-page.tsx web/apps/control/src/features/guard-governance/guardrails/create-guardrail-sheet.tsx web/apps/control/src/features/guard-governance/guardrails/guardrails-page.test.tsx
git commit -m "feat: import complete guardrail registry UI"
```

### Task 4: Complete Guardrail Detail and Evidence

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/guardrails/guardrail-detail-page.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-workflow.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-evidence.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-test-case-sheet.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-detail-page.test.tsx`

**Interfaces:**
- Consumes: Guard view model, Guard product components, store update/test-case/test-run operations, and read-only assignment summaries.
- Produces: complete detail page with Safety Intent, Controls, Test Cases, Versions, and Assignments tabs.

- [ ] **Step 1: Write failing detail completeness tests**

```tsx
it("renders all five Guard detail tabs and the product workflow", () => {
  renderGovernance(<GuardrailDetailPage guardrailId="guardrail-production" projectId="individual" />);
  expect(screen.getByRole("region", { name: "Guardrail workflow" })).not.toBeNull();
  for (const name of ["Safety Intent", "Controls", "Test Cases", "Versions", "Assignments"]) {
    expect(screen.getByRole("tab", { name })).not.toBeNull();
  }
});

it("renders complete evidence blocks", async () => {
  const user = userEvent.setup();
  renderGovernance(<GuardrailDetailPage guardrailId="guardrail-production" projectId="individual" />);
  await user.click(screen.getByRole("tab", { name: "Test Cases" }));
  expect(screen.getByText("Risk coverage")).not.toBeNull();
  expect(screen.getByText("Trusted instruction")).not.toBeNull();
  expect(screen.getByText("Triggered findings")).not.toBeNull();
  expect(screen.getByText("Execution trace")).not.toBeNull();
});

it("keeps assignments read-only inside Guardrail detail", async () => {
  const user = userEvent.setup();
  renderGovernance(<GuardrailDetailPage guardrailId="guardrail-production" projectId="individual" />);
  await user.click(screen.getByRole("tab", { name: "Assignments" }));
  expect(screen.getByText("Verified support routes")).not.toBeNull();
  expect(screen.queryByRole("button", { name: /Create Assignment|Apply/ })).toBeNull();
});
```

- [ ] **Step 2: Run detail tests and verify RED**

Run: `npm test --workspace @tasklattice/control -- guardrail-detail-page.test.tsx`

Expected: FAIL because the current detail omits Guard workflow styling and complete evidence blocks, and still exposes cross-page Assignment actions.

- [ ] **Step 3: Port detail header, workflow, metrics, intent, and Controls**

Use TanStack `Link` for Back. Preserve default Guardrail immutability. Render template source, version, parameters, limitations, evaluation phases, actions, and reasoning-policy binding exactly from the view model.

- [ ] **Step 4: Port test case CRUD and complete evidence presentation**

`guardrail-evidence.tsx` must render metrics, risk coverage, expandable result rows, trusted instruction, query/sources, input/output, expected/actual decision, action, reached stage, reasoning results, findings with grounding/claims/rules, decision reason, and full trace.

- [ ] **Step 5: Port versions and read-only Assignment summaries**

Render version metadata and Guard traffic-scope badges. Do not render a Create Assignment sheet, Apply button, or navigation action into the independent Assignment page.

- [ ] **Step 6: Run detail tests and verify GREEN**

Run: `npm test --workspace @tasklattice/control -- guardrail-detail-page.test.tsx`

Expected: PASS for all tabs, full evidence, immutability, CRUD, versions, and read-only assignments.

- [ ] **Step 7: Commit detail UI**

```powershell
git add web/apps/control/src/features/guard-governance/guardrails/guardrail-detail-page.tsx web/apps/control/src/features/guard-governance/guardrails/guardrail-workflow.tsx web/apps/control/src/features/guard-governance/guardrails/guardrail-evidence.tsx web/apps/control/src/features/guard-governance/guardrails/guardrail-test-case-sheet.tsx web/apps/control/src/features/guard-governance/guardrails/guardrail-detail-page.test.tsx
git commit -m "feat: import complete guardrail detail UI"
```

### Task 5: Routing Regression and Final Verification

**Files:**
- Modify: `web/apps/control/src/routes/-guard-governance-routing.test.ts`
- Modify only if required: `web/apps/control/src/routes/$projectId/governance/guardrails/index.tsx`
- Modify only if required: `web/apps/control/src/routes/$projectId/governance/guardrails/$guardrailId.tsx`

**Interfaces:**
- Consumes: canonical Guardrail registry/detail routes and imported page components.
- Produces: verified SPA navigation with no fallback redirect.

- [ ] **Step 1: Add a failing canonical-route regression test**

```ts
it("keeps the Guardrail detail route in the generated route tree", () => {
  expect(routeTreeSource).toContain("/$projectId/governance/guardrails/$guardrailId");
  expect(guardrailPageSource).toContain('to="/$projectId/governance/guardrails/$guardrailId"');
  expect(guardrailPageSource).not.toContain("<a href=");
});
```

- [ ] **Step 2: Run routing tests and verify RED**

Run: `npm test --workspace @tasklattice/control -- -guard-governance-routing.test.ts`

Expected: FAIL until registry and back navigation contain typed TanStack links and no plain internal anchors.

- [ ] **Step 3: Make the minimal route integration corrections**

Keep the existing route files and correct only component props or link targets needed for canonical SPA navigation. Regenerate `routeTree.gen.ts` only if the route generator reports it stale.

- [ ] **Step 4: Run focused Guardrail tests**

Run: `npm test --workspace @tasklattice/control -- guardrail-view-model.test.ts guard-product-ui.test.ts guardrails-page.test.tsx guardrail-detail-page.test.tsx -guard-governance-routing.test.ts`

Expected: all focused Guardrail tests PASS with zero failures.

- [ ] **Step 5: Run type checking and production build**

Run: `npm run typecheck --workspace @tasklattice/control`

Expected: exit code 0 with no TypeScript errors.

Run: `npm run build:control`

Expected: exit code 0 and a generated Control production bundle.

- [ ] **Step 6: Perform browser comparison**

Compare:

- `http://localhost:8080/individual/governance/guardrails`
- `http://localhost:8091/guardrails`

Verify registry hierarchy, create sheet steps, detail workflow, all five tabs, evidence expansion, default immutability, read-only Assignments, desktop layout, and narrow responsive behavior. Confirm registry row navigation remains under `/individual/governance/guardrails/<id>` and never lands on Evaluation Overview.

- [ ] **Step 7: Check scope and commit final routing work**

Run: `git diff --check`

Run: `git status --short`

Confirm the pre-existing `behavior-page.test.tsx` modification was neither edited nor staged.

```powershell
git add web/apps/control/src/routes/-guard-governance-routing.test.ts web/apps/control/src/routes/$projectId/governance/guardrails/index.tsx web/apps/control/src/routes/$projectId/governance/guardrails/$guardrailId.tsx
git commit -m "fix: preserve guardrail detail navigation"
```
