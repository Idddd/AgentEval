# Guard Governance UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five project-scoped Guard Governance tabs to AgentEval, backed entirely by deterministic in-memory mock data, without changing existing routes or feature behavior.

**Architecture:** A self-contained `features/guard-governance` package owns domain types, fixtures, a tested synchronous store, a Project-keyed React provider, and five AgentEval-native page surfaces. Thin TanStack Router files expose the pages under `/$projectId/governance/*`; AppShell only gains the provider and one navigation group.

**Tech Stack:** React 19, TypeScript 7, TanStack Router, Vitest, Testing Library, Tailwind CSS 4, existing AgentEval shadcn/Radix primitives.

## Global Constraints

- Use only in-memory mock data; make no HTTP requests and add no persistence.
- Preserve the existing `/$projectId/guardrails` route and all existing navigation behavior.
- Add the five English labels under a new `Guard Governance` sidebar group.
- Use AgentEval UI primitives and theme; do not copy Guard global CSS, i18n, auth, shell, or duplicate `components/ui` files.
- Keep state isolated by Project ID and reset fixtures on full refresh.
- Do not modify the user's existing uncommitted Evaluation Layer work except unavoidable generated route-tree additions.
- Follow red-green-refactor for every production behavior.

---

### Task 1: Domain model, fixtures, and synchronous store

**Files:**
- Create: `web/apps/control/src/features/guard-governance/model.ts`
- Create: `web/apps/control/src/features/guard-governance/fixtures.ts`
- Create: `web/apps/control/src/features/guard-governance/store.ts`
- Create: `web/apps/control/src/features/guard-governance/store.test.ts`

**Interfaces:**
- Produces: `GuardGovernanceState`, `Guardrail`, `GuardrailAssignment`, `GuardIntegration`, `EvidenceEvent`, and `EffectiveEnforcement` domain types.
- Produces: `cloneGuardGovernanceFixtures(projectId: string): GuardGovernanceState`.
- Produces: `createGuardGovernanceStore(initialState, options?): GuardGovernanceStore` with `getState`, `subscribe`, `createGuardrail`, `updateGuardrail`, `addTestCase`, `deleteTestCase`, `runGuardrailTest`, `createAssignment`, `toggleAssignment`, `registerIntegration`, and `toggleIntegration`.
- Produces selectors `readyGuardrails`, `effectiveEnforcements`, `filterEvidence`, and `governanceCounts`.

- [ ] **Step 1: Write failing store behavior tests**

Create literal fixtures in `store.test.ts` and assert consumer-visible transitions:

```ts
it("rejects an assignment until its guardrail has a passing test", () => {
  const store = createGuardGovernanceStore(cloneGuardGovernanceFixtures("individual"));
  expect(() => store.createAssignment({
    name: "Finance traffic",
    guardrailId: "guardrail-draft",
    priority: 20,
    enabled: true,
    trafficScope: { combinator: "and", rules: [{ field: "environment", operator: "equals", value: "production" }] },
  })).toThrow("Only Ready guardrails can be assigned");
});

it("marks a guardrail Ready and appends evidence after a passing run", () => {
  const store = createGuardGovernanceStore(cloneGuardGovernanceFixtures("individual"), { id: () => "generated-id", now: () => "2026-08-11T08:00:00.000Z" });
  const before = store.getState().evidence.length;
  const result = store.runGuardrailTest("guardrail-draft");
  expect(result.status).toBe("PASSED");
  expect(store.getState().guardrails.find((item) => item.id === "guardrail-draft")?.status).toBe("READY");
  expect(store.getState().evidence).toHaveLength(before + result.caseResults.length);
});

it("derives enabled enforcements in ascending priority order", () => {
  const store = createGuardGovernanceStore(cloneGuardGovernanceFixtures("individual"));
  expect(effectiveEnforcements(store.getState()).map((item) => item.assignmentId)).toEqual([
    "assignment-production",
    "assignment-support",
  ]);
});

it("returns a registration credential without retaining the cleartext value", () => {
  const store = createGuardGovernanceStore(cloneGuardGovernanceFixtures("individual"), { id: () => "integration-new", credential: () => "tlg_mock_secret" });
  const result = store.registerIntegration({ name: "Gateway", protocol: "litellm", environment: "staging" });
  expect(result.credential).toBe("tlg_mock_secret");
  expect(store.getState().integrations.find((item) => item.id === "integration-new")?.credentialHint).toBe("…cret");
  expect(JSON.stringify(store.getState())).not.toContain("tlg_mock_secret");
});

it("filters evidence by all supported dimensions", () => {
  const state = cloneGuardGovernanceFixtures("individual");
  expect(filterEvidence(state, { guardrailId: "guardrail-production", assignmentId: "assignment-production", outcome: "BLOCK", risk: "prompt_injection" }).map((item) => item.id)).toEqual(["evidence-prompt-injection"]);
});
```

- [ ] **Step 2: Run the store tests and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- src/features/guard-governance/store.test.ts`

Expected: FAIL because `model`, `fixtures`, and `store` do not exist.

- [ ] **Step 3: Implement the domain types and deterministic fixtures**

Define exact unions for statuses, risks, outcomes, protocols, environments, traffic operators, and actions. Seed at least three Guardrails (Ready, Needs Testing, Disabled), two Assignments, three Integrations, and six Evidence events. Include `projectId` on state and deterministic IDs referenced by the tests.

- [ ] **Step 4: Implement minimal immutable store actions and selectors**

Use `structuredClone` or explicit array/object copies so fixture imports cannot be mutated. `subscribe` must notify once after every successful mutation and never after validation errors. Test outcomes are derived from whether each case's expected decision equals its fixture actual decision.

- [ ] **Step 5: Run store tests and verify GREEN**

Run: `npm.cmd test --workspace @tasklattice/control -- src/features/guard-governance/store.test.ts`

Expected: all Guard Governance store tests pass.

- [ ] **Step 6: Commit Task 1 files only**

```powershell
git add -- web/apps/control/src/features/guard-governance/model.ts web/apps/control/src/features/guard-governance/fixtures.ts web/apps/control/src/features/guard-governance/store.ts web/apps/control/src/features/guard-governance/store.test.ts
git commit -m "feat: add guard governance mock store"
```

### Task 2: Project-keyed React provider and local error boundary

**Files:**
- Create: `web/apps/control/src/features/guard-governance/mock-provider.tsx`
- Create: `web/apps/control/src/features/guard-governance/mock-provider.test.tsx`
- Create: `web/apps/control/src/features/guard-governance/error-boundary.tsx`

**Interfaces:**
- Consumes: `createGuardGovernanceStore` and `cloneGuardGovernanceFixtures` from Task 1.
- Produces: `GuardGovernanceProvider`, `useGuardGovernanceState`, and `useGuardGovernanceStore`.
- Produces: `GuardGovernanceErrorBoundary` with an AgentEval-native recovery panel.

- [ ] **Step 1: Write failing provider tests**

```tsx
function Probe() {
  const state = useGuardGovernanceState();
  const store = useGuardGovernanceStore();
  return <><output>{state.projectId}:{state.guardrails.length}</output><button onClick={() => store.toggleAssignment("assignment-production", false)}>Disable</button><span>{String(state.assignments[0]?.enabled)}</span></>;
}

it("publishes store changes and resets when the Project changes", () => {
  const view = render(<GuardGovernanceProvider projectId="alpha"><Probe /></GuardGovernanceProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Disable" }));
  expect(screen.getByText("false")).not.toBeNull();
  view.rerender(<GuardGovernanceProvider projectId="beta"><Probe /></GuardGovernanceProvider>);
  expect(screen.getByText(/^beta:/)).not.toBeNull();
  expect(screen.getByText("true")).not.toBeNull();
});
```

Add a test proving hooks throw a clear error outside the provider and an error-boundary test proving a child exception is contained.

- [ ] **Step 2: Run provider tests and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- src/features/guard-governance/mock-provider.test.tsx`

Expected: FAIL because the provider and boundary modules do not exist.

- [ ] **Step 3: Implement the provider with `useSyncExternalStore`**

Create one store per `projectId` using `useMemo`. Expose the store through context, subscribe with `useSyncExternalStore`, and avoid timers in the core provider; pages own their brief pending presentation.

- [ ] **Step 4: Implement the local error boundary**

Render a bordered alert containing `Guard Governance unavailable`, a short recovery message, and a `Reload governance fixtures` button that resets the boundary instance without affecting AppShell.

- [ ] **Step 5: Run provider tests and verify GREEN**

Run the focused provider test command and confirm all tests pass without React warnings.

- [ ] **Step 6: Commit Task 2 files only**

```powershell
git add -- web/apps/control/src/features/guard-governance/mock-provider.tsx web/apps/control/src/features/guard-governance/mock-provider.test.tsx web/apps/control/src/features/guard-governance/error-boundary.tsx
git commit -m "feat: add guard governance provider"
```

### Task 3: Navigation, routes, and shell integration

**Files:**
- Modify: `web/apps/control/src/components/layout/app-shell.tsx`
- Modify: `web/apps/control/src/components/layout/app-shell-navigation.test.ts`
- Create: `web/apps/control/src/routes/-guard-governance-routing.test.ts`
- Create: `web/apps/control/src/routes/$projectId/governance.tsx`
- Create: `web/apps/control/src/routes/$projectId/governance/guardrails/index.tsx`
- Create: `web/apps/control/src/routes/$projectId/governance/guardrails/$guardrailId.tsx`
- Create: `web/apps/control/src/routes/$projectId/governance/assignments.tsx`
- Create: `web/apps/control/src/routes/$projectId/governance/enforcements.tsx`
- Create: `web/apps/control/src/routes/$projectId/governance/integrations.tsx`
- Create: `web/apps/control/src/routes/$projectId/governance/evidence.tsx`
- Modify generated output: `web/apps/control/src/routeTree.gen.ts`

**Interfaces:**
- Consumes: provider and error boundary from Task 2.
- Produces: the six approved route IDs and the `Guard Governance` nav group.
- Temporarily renders route placeholders until Tasks 5–7 replace them.

- [ ] **Step 1: Extend navigation and routing tests first**

Assert the new group exactly equals the approved labels and remains visible to all current roles, while Security still contains its original Guardrails item:

```ts
expect(projectNavGroups.find((group) => group.label === "Guard Governance")?.items.map((item) => item.label)).toEqual([
  "Guardrails", "Assignments", "Enforcements", "Integrations", "Evidence",
]);
expect(projectNavGroups.find((group) => group.label === "Security")?.items.some((item) => item.to === "/$projectId/guardrails")).toBe(true);
```

In `-guard-governance-routing.test.ts`, use the existing memory-router helper and assert each URL contains `/$projectId/governance` plus the expected child route ID. Assert `/individual/guardrails` still maps to `/$projectId/guardrails`.

- [ ] **Step 2: Run navigation and routing tests and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- src/components/layout/app-shell-navigation.test.ts src/routes/-guard-governance-routing.test.ts`

Expected: FAIL because the group and routes do not exist.

- [ ] **Step 3: Add the five nav definitions and active-state rule**

Use distinct icons and routes under `/$projectId/governance/*`. Treat Guardrail detail as active for the Guardrails collection. Do not attach a role whitelist so every existing role sees the new mock governance surfaces.

- [ ] **Step 4: Add the governance layout and thin route modules**

`governance.tsx` mounts `GuardGovernanceProvider` keyed by `projectId`, wraps its `<Outlet />` with `GuardGovernanceErrorBoundary`, and does not modify the existing AppShell provider chain. Child modules initially render a PageHeader plus a named empty placeholder.

- [ ] **Step 5: Regenerate the TanStack route tree**

Run: `npm.cmd run build --workspace @tasklattice/control`

The installed Vite router plugin regenerates `routeTree.gen.ts` while compiling the route modules. Fix only diagnostics caused by the new placeholder routes, then rerun until the build exits 0.

Inspect `routeTree.gen.ts` and confirm only the new governance imports/routes plus generator ordering changed; preserve the user's unrelated generated-route changes.

- [ ] **Step 6: Run navigation and routing tests and verify GREEN**

Run the focused command from Step 2 and expect all tests to pass.

- [ ] **Step 7: Commit Task 3 files only**

Stage the AppShell, navigation test, new route modules, routing test, and generated route tree explicitly; verify `git diff --cached --name-only` before committing.

```powershell
git commit -m "feat: add guard governance navigation"
```

### Task 4: Shared governance UI and Traffic Scope Builder

**Files:**
- Create: `web/apps/control/src/features/guard-governance/shared/governance-page.tsx`
- Create: `web/apps/control/src/features/guard-governance/shared/governance-status.tsx`
- Create: `web/apps/control/src/features/guard-governance/shared/form-section.tsx`
- Create: `web/apps/control/src/features/guard-governance/traffic-scope/traffic-scope-builder.tsx`
- Create: `web/apps/control/src/features/guard-governance/traffic-scope/traffic-scope-builder.test.tsx`

**Interfaces:**
- Produces: `GovernancePage`, `GovernanceMetric`, `GovernanceStatusBadge`, `FormSection`, and controlled `TrafficScopeBuilder`.
- `TrafficScopeBuilder` consumes `TrafficScopeExpression` and emits a complete next value through `onChange`.

- [ ] **Step 1: Write failing Traffic Scope Builder tests**

Render a one-rule expression, change field/operator/value, add a second rule, remove it, and switch `and` to `or`. Assert `onChange` receives literal complete expressions rather than partial patches. Assert the final remaining rule cannot be removed.

- [ ] **Step 2: Run the focused builder test and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- src/features/guard-governance/traffic-scope/traffic-scope-builder.test.tsx`

Expected: FAIL because the builder does not exist.

- [ ] **Step 3: Implement shared presentation components**

Compose existing `PageHeader`, `Card`, `Badge`, and `EmptyState` components. Map READY/ACTIVE/PASSED to success, NEEDS_TESTING/DEGRADED to warning, and FAILED/BLOCK/DISABLED to destructive-neutral presentation without adding global CSS.

- [ ] **Step 4: Implement the controlled Traffic Scope Builder**

Support fields `environment`, `model`, `provider`, `route`, and `tag`; operators `equals`, `not_equals`, `contains`, and `starts_with`; and string values. Use accessible labels and 44-pixel mobile controls.

- [ ] **Step 5: Run builder tests and verify GREEN**

Run the focused builder test and confirm it passes without accessibility warnings.

- [ ] **Step 6: Commit Task 4 files only**

```powershell
git add -- web/apps/control/src/features/guard-governance/shared web/apps/control/src/features/guard-governance/traffic-scope
git commit -m "feat: add governance UI primitives"
```

### Task 5: Guardrails collection and detail workflow

**Files:**
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrails-page.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-detail-page.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrails-page.test.tsx`
- Modify: `web/apps/control/src/routes/$projectId/governance/guardrails/index.tsx`
- Modify: `web/apps/control/src/routes/$projectId/governance/guardrails/$guardrailId.tsx`

**Interfaces:**
- Consumes: provider/store, shared governance components, `EntitySheet`, and existing form primitives.
- Produces: creation/editing/test-case/test-run workflow and links to detail routes.

- [ ] **Step 1: Write failing Guardrails workflow tests**

Use the real provider and memory router where links are exercised. Assert:

```tsx
it("creates a Guardrail and exposes it in the collection", async () => {
  const user = userEvent.setup();
  renderGovernance(<GuardrailsPage />);
  await user.click(screen.getByRole("button", { name: "Create Guardrail" }));
  await user.type(screen.getByLabelText("Name"), "Claims Safety");
  await user.type(screen.getByLabelText("Purpose"), "Protect claims traffic");
  await user.click(screen.getByRole("button", { name: "Create" }));
  expect(screen.getByText("Claims Safety")).not.toBeNull();
  expect(screen.getByText("Needs testing")).not.toBeNull();
});
```

Add tests for empty-name validation, test-case addition/deletion, disabled run without cases, and a passing run changing the detail status to Ready and increasing Evidence count.

- [ ] **Step 2: Run Guardrails tests and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- src/features/guard-governance/guardrails/guardrails-page.test.tsx`

Expected: FAIL because the pages do not exist.

- [ ] **Step 3: Implement the collection and create sheet**

Render metrics, responsive table/cards, assignment counts, latest test time, and row actions. The create sheet collects name, purpose, safety level, delivery, allowed/restricted topics, and at least one selected control; it calls only `store.createGuardrail`.

- [ ] **Step 4: Implement detail editing and test workflow**

Render configuration facts, controls, topics, test cases, and recent results. Keep editing in an `EntitySheet`. Present a brief pending state before invoking the synchronous store action; prevent duplicate submission.

- [ ] **Step 5: Replace route placeholders and run tests GREEN**

Wire the collection and detail route params. Run the focused Guardrails tests and the routing tests; expect all to pass.

- [ ] **Step 6: Commit Task 5 files only**

```powershell
git add -- web/apps/control/src/features/guard-governance/guardrails web/apps/control/src/routes/`$projectId/governance/guardrails
git commit -m "feat: add mock guardrail workflow"
```

### Task 6: Assignments and derived Enforcements

**Files:**
- Create: `web/apps/control/src/features/guard-governance/assignments/assignments-page.tsx`
- Create: `web/apps/control/src/features/guard-governance/assignments/assignments-page.test.tsx`
- Create: `web/apps/control/src/features/guard-governance/enforcements/enforcements-page.tsx`
- Create: `web/apps/control/src/features/guard-governance/enforcements/enforcements-page.test.tsx`
- Modify: `web/apps/control/src/routes/$projectId/governance/assignments.tsx`
- Modify: `web/apps/control/src/routes/$projectId/governance/enforcements.tsx`

**Interfaces:**
- Consumes: `readyGuardrails`, `effectiveEnforcements`, Traffic Scope Builder, and store actions.
- Produces: Assignment creation/toggle UI and read-only effective Enforcement view.

- [ ] **Step 1: Write failing Assignment and Enforcement tests**

Assert the creation sheet lists Ready Guardrails but excludes Needs Testing ones, blocks an invalid empty scope, creates a valid Assignment, and updates the list when toggled. Assert Enforcements display literal ascending priorities and an uncovered-traffic warning from the fixture state.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test --workspace @tasklattice/control -- src/features/guard-governance/assignments/assignments-page.test.tsx src/features/guard-governance/enforcements/enforcements-page.test.tsx`

- [ ] **Step 3: Implement Assignments page**

Use an `EntitySheet` with numbered identity, scope, and Guardrail sections. Display enabled status, priority, human-readable scope summary, and Guardrail status in the collection.

- [ ] **Step 4: Implement Enforcements page**

Render derived rows only. Include priority, Assignment, Guardrail, scope, action summary, conflicts, inactive references, uncovered-traffic notice, and enforcement-boundary explanation.

- [ ] **Step 5: Wire routes and verify GREEN**

Run both focused tests plus `store.test.ts`; expect all to pass.

- [ ] **Step 6: Commit Task 6 files only**

```powershell
git add -- web/apps/control/src/features/guard-governance/assignments web/apps/control/src/features/guard-governance/enforcements web/apps/control/src/routes/`$projectId/governance/assignments.tsx web/apps/control/src/routes/`$projectId/governance/enforcements.tsx
git commit -m "feat: add assignments and enforcements"
```

### Task 7: Integrations and Evidence workflows

**Files:**
- Create: `web/apps/control/src/features/guard-governance/integrations/integrations-page.tsx`
- Create: `web/apps/control/src/features/guard-governance/integrations/integrations-page.test.tsx`
- Create: `web/apps/control/src/features/guard-governance/evidence/evidence-page.tsx`
- Create: `web/apps/control/src/features/guard-governance/evidence/evidence-page.test.tsx`
- Modify: `web/apps/control/src/routes/$projectId/governance/integrations.tsx`
- Modify: `web/apps/control/src/routes/$projectId/governance/evidence.tsx`

**Interfaces:**
- Consumes: integration store actions, `filterEvidence`, shared status components, and `EntitySheet`.
- Produces: registration/credential/toggle workflow and filterable Evidence list/detail.

- [ ] **Step 1: Write failing Integrations and Evidence tests**

Assert registration supports exactly LiteLLM, HTTP, and A2A; the returned credential is shown in the success panel and disappears when dismissed; toggling updates status. For Evidence, choose the literal Prompt Injection/Block filters and assert only `evidence-prompt-injection` content remains, then open detail and assert input, outcome, trace stage, and duration.

- [ ] **Step 2: Run focused tests and verify RED**

Run both new test files and confirm missing-page failures.

- [ ] **Step 3: Implement Integrations page**

Render health summary, protocol/environment/status columns, registration sheet, one-time credential success panel, detail sheet, and enable/disable action. Never read a cleartext credential from state.

- [ ] **Step 4: Implement Evidence page**

Keep filters as local UI state and derive results through `filterEvidence`. Distinguish no fixtures from no filter matches. Render an accessible table with a horizontally scrolling mobile container and a detail sheet containing all approved evidence fields.

- [ ] **Step 5: Wire routes and verify GREEN**

Run both focused tests plus store/provider tests; expect all to pass.

- [ ] **Step 6: Commit Task 7 files only**

```powershell
git add -- web/apps/control/src/features/guard-governance/integrations web/apps/control/src/features/guard-governance/evidence web/apps/control/src/routes/`$projectId/governance/integrations.tsx web/apps/control/src/routes/`$projectId/governance/evidence.tsx
git commit -m "feat: add integrations and evidence"
```

### Task 8: Regression, type, build, and visual verification

**Files:**
- Modify only if a verified failure requires it: files created or changed in Tasks 1–7.
- Do not edit unrelated Evaluation Layer files to satisfy this task.

**Interfaces:**
- Consumes: all previous task deliverables.
- Produces: verified, buildable Guard Governance UI with no regressions.

- [ ] **Step 1: Run all Guard Governance tests together**

Run: `npm.cmd test --workspace @tasklattice/control -- src/features/guard-governance src/routes/-guard-governance-routing.test.ts src/components/layout/app-shell-navigation.test.ts`

Expected: all focused tests pass with no warnings.

- [ ] **Step 2: Run the complete Control test suite**

Run: `npm.cmd test --workspace @tasklattice/control`

Expected baseline comparison: at least the original 79 files and 412 tests plus all new tests pass.

- [ ] **Step 3: Run TypeScript type checking**

Run: `npm.cmd run typecheck --workspace @tasklattice/control`

Expected: exit code 0 and no TypeScript diagnostics.

- [ ] **Step 4: Run the production build**

Run: `npm.cmd run build --workspace @tasklattice/control`

Expected: exit code 0; TanStack and Vite produce the Control application bundles.

- [ ] **Step 5: Inspect the five tabs in the local application**

Start the existing Control development command, open one Project, and verify desktop and narrow-width layouts for Guardrails, Assignments, Enforcements, Integrations, and Evidence. Confirm the old Security Guardrails entry still opens its original page.

- [ ] **Step 6: Review the final diff boundary**

Run `git status --short` and `git diff --name-only HEAD`. Confirm unrelated user-owned Evaluation Layer changes remain unstaged and unchanged from the start of this work.

- [ ] **Step 7: Commit any verified in-scope cleanup only**

If verification required an in-scope adjustment, stage only that exact file and commit with `fix: complete guard governance verification`. If no adjustment was required, do not create an empty commit.
