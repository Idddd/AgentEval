# Guard Governance Full UI Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lightweight governance prototype with the complete TaskLattice Guard information architecture and workflows while keeping every operation on deterministic local mock data.

**Architecture:** Expand the feature domain into reference-complete types, fixtures, and a transactional in-memory repository. Keep the existing project-scoped provider and governance routes, then rebuild each page from focused panels that reproduce the reference workflows while preserving useful prototype extensions.

**Tech Stack:** React 19, TypeScript, TanStack Router, Vitest, Testing Library, Tailwind CSS, existing AgentEval UI primitives.

## Global Constraints

- All data and mutations are local mock behavior; no real API calls are allowed.
- Existing AgentEval functionality and routes must not be modified beyond the already-added Guard Governance navigation group and governance route tree.
- The five top-level tabs remain Guardrails, Assignments, Enforcements, Integrations, and Evidence.
- Reference information may be supplemented by useful prototype features, but reference fields or workflows must not be replaced by simplified equivalents.
- Style consistency with the rest of AgentEval is optional. Information completeness and interaction fidelity take priority.
- Existing uncommitted Evaluation Layer changes are user-owned and must not be staged or altered.

---

### Task 1: Complete governance domain and fixtures

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/model.ts`
- Modify: `web/apps/control/src/features/guard-governance/fixtures.ts`
- Create: `web/apps/control/src/features/guard-governance/fixtures.test.ts`

**Interfaces:**
- Produces: `GuardrailTemplate`, `ControlDefinition`, `GuardrailVersion`, `EvaluationMetrics`, `EvaluationCaseResult`, `SystemStatus`, `AuditEvent`, recursive `TrafficScopeExpression`, and expanded existing entity types.
- Produces: `cloneGuardGovernanceFixtures(projectId)` containing every acceptance-state fixture.

- [ ] **Step 1: Write a failing fixture completeness test**

```ts
it("provides complete reference governance scenarios", () => {
  const state = cloneGuardGovernanceFixtures("project-1");
  expect(state.guardrails.some((item) => item.isDefault && item.systemManaged)).toBe(true);
  expect(state.versions.length).toBeGreaterThan(1);
  expect(state.guardrails.some((item) => item.latestTestRun?.metrics.complianceRate)).toBe(true);
  expect(state.assignments.some((item) => item.guardrailVersion > 0)).toBe(true);
  expect(state.trafficScopeFields.some((item) => item.source === "jwt_claim")).toBe(true);
  expect(state.auditEvents.some((item) => item.kind === "guardrail.version.created")).toBe(true);
});
```

- [ ] **Step 2: Run the fixture test and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- fixtures.test.ts`
Expected: FAIL because the complete types and fixture collections do not exist.

- [ ] **Step 3: Expand types without retaining simplified duplicate semantics**

Implement complete camelCase equivalents of the reference API structures. Keep `priority` and detailed decision traces as explicit AgentEval extensions. Separate `auditEvents` from `decisionEvidence`.

- [ ] **Step 4: Replace fixtures with complete linked scenarios**

Create linked IDs for templates, controls, Guardrails, test cases, test runs, versions, assignments, integrations, audit events, and decision evidence. Ensure default, tested, stale-draft, degraded, failed, and empty-scope states are represented.

- [ ] **Step 5: Run the fixture test and verify GREEN**

Run: `npm.cmd test --workspace @tasklattice/control -- fixtures.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add web/apps/control/src/features/guard-governance/model.ts web/apps/control/src/features/guard-governance/fixtures.ts web/apps/control/src/features/guard-governance/fixtures.test.ts
git commit -m "feat: restore complete governance mock domain"
```

### Task 2: Transactional mock repository and provider API

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/store.ts`
- Modify: `web/apps/control/src/features/guard-governance/store.test.ts`
- Modify: `web/apps/control/src/features/guard-governance/mock-provider.tsx`
- Modify: `web/apps/control/src/features/guard-governance/mock-provider.test.tsx`

**Interfaces:**
- Consumes: complete `GuardGovernanceState` from Task 1.
- Produces: repository operations for guardrail creation/update, intent analysis, test-case management, test runs, version activation, assignment creation/toggle, integration registration, audit filtering, and decision filtering.
- Produces: project-scoped hooks `useGuardGovernanceState()` and `useGuardGovernanceStore()` with the existing public provider boundary.

- [ ] **Step 1: Add failing transition tests**

```ts
it("creates a version and audit events after a passing test", () => {
  const store = createGuardGovernanceStore(state, deterministicOptions);
  const run = store.runGuardrailTest("custom-guardrail");
  expect(run.metrics.total).toBeGreaterThan(0);
  expect(store.getState().versions.some((item) => item.active)).toBe(true);
  expect(store.getState().auditEvents.some((item) => item.kind === "guardrail.version.created")).toBe(true);
});
```

Also cover system-managed mutation rejection, draft invalidation, assignment version pinning, one-time credential storage, and audit creation.

- [ ] **Step 2: Run store/provider tests and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- store.test.ts mock-provider.test.tsx`
Expected: FAIL on missing complete transitions.

- [ ] **Step 3: Implement atomic state transitions**

Use immutable state replacement and a single `emit()` per completed operation. Compute metrics and results deterministically from fixture test cases. Preserve the current subscription contract.

- [ ] **Step 4: Run store/provider tests and verify GREEN**

Run: `npm.cmd test --workspace @tasklattice/control -- store.test.ts mock-provider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add web/apps/control/src/features/guard-governance/store.ts web/apps/control/src/features/guard-governance/store.test.ts web/apps/control/src/features/guard-governance/mock-provider.tsx web/apps/control/src/features/guard-governance/mock-provider.test.tsx
git commit -m "feat: add complete governance mock workflows"
```

### Task 3: Reference composition and recursive Traffic Scope

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/shared/governance-page.tsx`
- Modify: `web/apps/control/src/features/guard-governance/shared/governance-status.tsx`
- Modify: `web/apps/control/src/features/guard-governance/shared/form-section.tsx`
- Create: `web/apps/control/src/features/guard-governance/shared/creation-flow.tsx`
- Create: `web/apps/control/src/features/guard-governance/shared/info-notice.tsx`
- Modify: `web/apps/control/src/features/guard-governance/traffic-scope/traffic-scope-builder.tsx`
- Modify: `web/apps/control/src/features/guard-governance/traffic-scope/traffic-scope-builder.test.tsx`

**Interfaces:**
- Consumes: `TrafficScopeFieldDefinition` and recursive `TrafficScopeExpression`.
- Produces: `TrafficScopeBuilder`, `TrafficScopeSummary`, `isTrafficScopeValid`, and reusable reference-style workflow components.

- [ ] **Step 1: Write failing recursive-scope tests**

```tsx
it("adds a nested OR group with a custom JWT claim", async () => {
  render(<TrafficScopeBuilder definitions={definitions} value={expression} onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: "Add group" }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rules: expect.arrayContaining([expect.objectContaining({ combinator: "or" })]) }));
});
```

- [ ] **Step 2: Run the Traffic Scope test and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- traffic-scope-builder.test.tsx`
Expected: FAIL because nested groups and complete field definitions are unsupported.

- [ ] **Step 3: Implement recursive editing and summaries**

Render groups recursively, constrain operators by field definition, expose custom keys for header/JWT fields, and validate every leaf. Keep all controls keyboard accessible.

- [ ] **Step 4: Run the Traffic Scope test and verify GREEN**

Run: `npm.cmd test --workspace @tasklattice/control -- traffic-scope-builder.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add web/apps/control/src/features/guard-governance/shared web/apps/control/src/features/guard-governance/traffic-scope
git commit -m "feat: restore governance workflow primitives"
```

### Task 4: Complete Guardrails registry, creation, and detail workflow

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/guardrails/guardrails-page.tsx`
- Modify: `web/apps/control/src/features/guard-governance/guardrails/guardrail-detail-page.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/create-guardrail-sheet.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/edit-guardrail-sheet.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-intent-panel.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-controls-panel.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-tests-panel.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-versions-panel.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-assignments-panel.tsx`
- Modify: `web/apps/control/src/features/guard-governance/guardrails/guardrails-page.test.tsx`

**Interfaces:**
- Consumes: repository methods and complete Guardrail projections.
- Produces: full registry, three-step creation sheet, five-tab detail, edit/test/version/assignment workflows.

- [ ] **Step 1: Add failing registry and detail tests**

```tsx
it("shows reference-complete guardrail workflow", async () => {
  renderGovernance(<GuardrailDetailPage guardrailId="guardrail-finance" />);
  expect(screen.getByText("Workflow")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Versions" })).toBeInTheDocument();
  expect(screen.getByText(/Compliance/)).toBeInTheDocument();
});
```

Add a creation test covering template selection, parameters, review, and creation; add a custom-intent test covering deterministic analysis.

- [ ] **Step 2: Run Guardrail tests and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- guardrails-page.test.tsx`
Expected: FAIL because the full workflow is absent.

- [ ] **Step 3: Implement the registry and split detail panels**

Restore built-in badge, evidence/compliance, assignment count, update time, workflow strip, and five tabs. Render complete results, findings, content, and traces without hiding fixture fields.

- [ ] **Step 4: Implement creation and edit sheets**

Implement template/blank choice, template parameters, deterministic intent analysis, control review, complete edit fields, complete test-case fields, and system-managed read-only behavior.

- [ ] **Step 5: Run Guardrail tests and verify GREEN**

Run: `npm.cmd test --workspace @tasklattice/control -- guardrails-page.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add web/apps/control/src/features/guard-governance/guardrails
git commit -m "feat: import complete guardrail UI"
```

### Task 5: Complete Assignments and Enforcements

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/assignments/assignments-page.tsx`
- Modify: `web/apps/control/src/features/guard-governance/assignments/assignments-page.test.tsx`
- Modify: `web/apps/control/src/features/guard-governance/enforcements/enforcements-page.tsx`
- Modify: `web/apps/control/src/features/guard-governance/enforcements/enforcements-page.test.tsx`

**Interfaces:**
- Consumes: complete assignments, versions, recursive scopes, and effective enforcement projection.
- Produces: default-first assignment registry, complete creation sheet, immutable baseline enforcement, and secondary effective-order table.

- [ ] **Step 1: Add failing baseline and pinned-version tests**

```tsx
it("shows the system-managed default baseline and pinned version", () => {
  renderGovernance(<EnforcementsPage />);
  expect(screen.getByText("Default enforcement")).toBeInTheDocument();
  expect(screen.getByText(/Version 1/)).toBeInTheDocument();
  expect(screen.getByText("Unmatched traffic")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run Assignment/Enforcement tests and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- assignments-page.test.tsx enforcements-page.test.tsx`
Expected: FAIL on missing baseline/version information.

- [ ] **Step 3: Implement complete pages**

Restore default badges, version pinning, condition counts, recursive summaries, baseline immutability, Guardrail facts, and the additive effective-order section.

- [ ] **Step 4: Run Assignment/Enforcement tests and verify GREEN**

Run: `npm.cmd test --workspace @tasklattice/control -- assignments-page.test.tsx enforcements-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add web/apps/control/src/features/guard-governance/assignments web/apps/control/src/features/guard-governance/enforcements
git commit -m "feat: import complete assignment enforcement UI"
```

### Task 6: Complete Integrations and Evidence

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/integrations/integrations-page.tsx`
- Modify: `web/apps/control/src/features/guard-governance/integrations/integrations-page.test.tsx`
- Modify: `web/apps/control/src/features/guard-governance/evidence/evidence-page.tsx`
- Modify: `web/apps/control/src/features/guard-governance/evidence/evidence-page.test.tsx`

**Interfaces:**
- Consumes: `SystemStatus`, complete integrations, `AuditEvent[]`, and `DecisionEvidence[]`.
- Produces: system/capability surface, runtime Integration details, one-time credential flow, Audit Events tab, and Decision Traces tab.

- [ ] **Step 1: Add failing integration/evidence completeness tests**

```tsx
it("shows system capabilities and runtime activity", () => {
  renderGovernance(<IntegrationsPage />);
  expect(screen.getByText("Automated reasoning")).toBeInTheDocument();
  expect(screen.getByText("Requests")).toBeInTheDocument();
});

it("separates audit events from decision traces", () => {
  renderGovernance(<EvidencePage />);
  expect(screen.getByRole("tab", { name: "Audit Events" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Decision Traces" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run Integration/Evidence tests and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- integrations-page.test.tsx evidence-page.test.tsx`
Expected: FAIL because capabilities, runtime details, and audit separation are absent.

- [ ] **Step 3: Implement complete Integration surfaces**

Restore health summary, capability cards, runtime list/detail, trusted context, and the one-time credential state after registration.

- [ ] **Step 4: Implement complete Evidence surfaces**

Render responsive Audit Events and retain the filtered Decision Traces experience as a separate tab. Resolve entity names for context and preserve nullable control-plane events.

- [ ] **Step 5: Run Integration/Evidence tests and verify GREEN**

Run: `npm.cmd test --workspace @tasklattice/control -- integrations-page.test.tsx evidence-page.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add web/apps/control/src/features/guard-governance/integrations web/apps/control/src/features/guard-governance/evidence
git commit -m "feat: import complete integration evidence UI"
```

### Task 7: Route regression and final verification

**Files:**
- Modify if required: `web/apps/control/src/routes/-guard-governance-routing.test.ts`
- Modify if required: `web/apps/control/src/components/app-shell-navigation.test.ts`
- Verify generated file only if route definitions changed: `web/apps/control/src/routeTree.gen.ts`

**Interfaces:**
- Consumes: all completed governance pages.
- Produces: evidence that governance routes remain additive and existing AgentEval navigation is unchanged.

- [ ] **Step 1: Run focused governance suite**

Run: `npm.cmd test --workspace @tasklattice/control -- src/features/guard-governance src/routes/-guard-governance-routing.test.ts src/components/app-shell-navigation.test.ts`
Expected: PASS.

- [ ] **Step 2: Run TypeScript checking**

Run: `npm.cmd run typecheck --workspace @tasklattice/control`
Expected: PASS with no diagnostics.

- [ ] **Step 3: Run full control-app suite**

Run: `npm.cmd test --workspace @tasklattice/control`
Expected: all tests PASS.

- [ ] **Step 4: Run production build**

Run: `npm.cmd run build --workspace @tasklattice/control`
Expected: exit code 0.

- [ ] **Step 5: Inspect every governance page in the browser**

Verify all five top-level routes, all five Guardrail detail tabs, creation sheets, responsive Audit Events, and absence of console errors. Confirm `/individual/guardrails` still renders the existing Security page.

- [ ] **Step 6: Commit any verification-only corrections**

```bash
git add web/apps/control/src/features/guard-governance web/apps/control/src/routes/-guard-governance-routing.test.ts web/apps/control/src/components/app-shell-navigation.test.ts
git commit -m "fix: complete governance UI verification"
```
