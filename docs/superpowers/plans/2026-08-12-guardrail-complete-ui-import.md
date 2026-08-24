# Guardrail Complete UI Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AgentEval's simplified Guard Governance Guardrail pages with the complete TaskLattice Guard registry, creation, detail, evidence, version, and assignment UI while using only in-memory mock data.

**Architecture:** Keep AgentEval's application shell, project routing, and camelCase mock store. Add one Guard-compatible adapter that presents snake_case view models and synchronous mutation operations to imported, focused presentation modules. Port the Guard DOM hierarchy and feature styling into AgentEval components, with TanStack Router project-aware links and a small local English/Simplified Chinese copy layer.

**Tech Stack:** React 19, TypeScript, TanStack Router, Radix/shadcn UI, Tailwind CSS, Vitest, Testing Library, existing Guard Governance mock store.

## Global Constraints

- Keep AgentEval authentication, project sidebar, header, breadcrumb, and account controls unchanged.
- Keep all data and mutations in memory; do not call the Guard API, Prisma, SQLite, or any external evaluator.
- Preserve the complete Guardrail information hierarchy and interactions from `tasklattice-guard/web/src/routes/guardrails.tsx`.
- Preserve the existing AgentEval Security Guardrails route and behavior.
- Retain Guard's internal blue visual treatment and responsive behavior without changing global AgentEval tokens.
- Canonical routes remain `/$projectId/governance/guardrails` and `/$projectId/governance/guardrails/$guardrailId`.

---

## File Structure

- `guardrails/guard-contracts.ts`: Guard-compatible snake_case UI contracts.
- `guardrails/guard-mock-adapter.ts`: the sole camelCase store to Guard UI boundary and mock operations.
- `guardrails/guard-copy.ts`: English and Simplified Chinese feature copy and interpolation.
- `guardrails/guard-product-ui.tsx`: imported page header, notices, metric, badge, and creation-flow primitives.
- `guardrails/guardrails-page.tsx`: complete registry and route-aware navigation.
- `guardrails/guardrail-create-sheet.tsx`: complete template/blank creation flow.
- `guardrails/guardrail-detail-page.tsx`: detail orchestration, workflow, tabs, and assignment sheet integration.
- `guardrails/guardrail-intent-controls.tsx`: intent, template provenance, control definitions, and reasoning-policy display.
- `guardrails/guardrail-test-evidence.tsx`: cases, coverage, full evidence rows, findings, reasoning, and traces.
- `guardrails/guardrail-edit-sheets.tsx`: edit-intent and add-test-case sheets.
- Existing `fixtures.ts`, `model.ts`, and `store.ts`: enrich complex mock evidence only where the imported UI requires it.
- Existing route modules and route tests: verify SPA detail navigation and project parameters.

---

### Task 1: Guard-Compatible Mock Adapter

**Files:**
- Create: `web/apps/control/src/features/guard-governance/guardrails/guard-contracts.ts`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guard-mock-adapter.ts`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guard-mock-adapter.test.tsx`
- Modify: `web/apps/control/src/features/guard-governance/mock-provider.tsx`

**Interfaces:**
- Produces: `createGuardrailMockApi(store: GuardGovernanceStore): GuardrailMockApi` and `useGuardrailMockApi(): GuardrailMockApi`.
- Produces: Guard UI types `UiGuardrail`, `UiTestCase`, `UiTestRun`, `UiGuardrailVersion`, `UiAssignment`, `UiGuardrailTemplate`, and `UiControlDefinition`.
- Consumes: `GuardGovernanceStore` and `GuardGovernanceState` from the existing provider.

- [ ] **Step 1: Write the failing adapter test**

```tsx
it("exposes Guard-compatible read models without network access", () => {
  const probe = vi.fn();
  vi.stubGlobal("fetch", probe);
  const store = createGuardGovernanceStore(cloneGuardGovernanceFixtures("individual"));
  const api = createGuardrailMockApi(store);
  const baseline = api.getGuardrail("guardrail-default");
  expect(baseline?.name).toBe("TaskLattice Default Protection");
  expect(baseline?.status).toBe("protected");
  expect(api.getGuardrail("guardrail-production")?.latest_test_run?.metrics.compliance_rate).toBe(100);
  expect(probe).not.toHaveBeenCalled();
});

it("maps create, case, test-run, and assignment mutations back to the store", () => {
  const store = createGuardGovernanceStore(cloneGuardGovernanceFixtures("individual"), {
    id: (() => { let next = 0; return () => `generated-${++next}`; })(),
    now: () => "2026-08-12T12:00:00.000Z",
  });
  const api = createGuardrailMockApi(store);
  const guardrailId = api.createGuardrail({
    name: "Support Safety",
    purpose: "Protect approved support requests.",
    allowed_topics: ["support"],
    restricted_topics: ["credential disclosure"],
    controls: [{ risk: "topic_control", action: "redirect" }],
    safety_level: "balanced",
    output_delivery: "window_buffered",
    source_template_id: null,
    template_parameters: {},
  });
  api.addTestCase(guardrailId, {
    name: "Allowed support",
    risk: "topic_control",
    phase: "input",
    content: "Help me reset my password.",
    expected_decision: "allow",
    trusted_instruction: "Only answer approved support questions.",
    target_source: "user_input",
    query: "",
    grounding_sources: [],
    expected_reasoning_result: null,
  });
  expect(api.runTests(guardrailId).guardrail_version).toBe(1);
  api.createAssignment({
    name: "Support traffic",
    guardrail_id: guardrailId,
    priority: 10,
    enabled: true,
    traffic_scope: { combinator: "and", rules: [{ field: "environment", operator: "equals", value: "production" }] },
  });
  expect(api.getGuardrail(guardrailId)?.assignment_count).toBe(1);
});
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run: `npm test --workspace @tasklattice/control -- --run src/features/guard-governance/guardrails/guard-mock-adapter.test.tsx`

Expected: FAIL because `useGuardrailMockApi` and Guard contracts do not exist.

- [ ] **Step 3: Define the Guard-compatible contracts**

```ts
export type UiGuardrail = {
  id: string;
  name: string;
  purpose: string;
  allowed_topics: string[];
  restricted_topics: string[];
  controls: UiGuardrailControl[];
  safety_level: "balanced" | "strict";
  output_delivery: "interruptible" | "window_buffered" | "full_buffered";
  source_template_id: string | null;
  template_parameters: Record<string, string>;
  updated_at: string;
  status: "needs_testing" | "ready" | "protected" | "disabled";
  latest_test_run: UiTestRun | null;
  assignment_count: number;
  test_case_count: number;
  tested_current: boolean;
  is_default: boolean;
  system_managed: boolean;
  local_only: boolean;
  coverage: UiRiskCoverage[];
};
```

Include the remaining Guard source fields exactly, including `source_block_ids`, `supporting_rules`, `contradicting_rules`, `duration_ms`, and nullable reasoning results.

- [ ] **Step 4: Implement the adapter and provider hook**

```ts
export type GuardrailMockApi = {
  guardrails: UiGuardrail[];
  getGuardrail(id: string): UiGuardrail | undefined;
  getTestCases(id: string): UiTestCase[];
  getVersions(id: string): UiGuardrailVersion[];
  getAssignments(id?: string): UiAssignment[];
  templates: UiGuardrailTemplate[];
  definitions: UiControlDefinition[];
  analyzeIntent(purpose: string): UiIntentAnalysis;
  createGuardrail(input: UiCreateGuardrailInput): string;
  updateGuardrail(id: string, input: UiUpdateGuardrailInput): void;
  addTestCase(id: string, input: UiCreateTestCaseInput): void;
  deleteTestCase(id: string, caseId: string): void;
  runTests(id: string): UiTestRun;
  createAssignment(input: UiCreateAssignmentInput): string;
};
```

Use pure conversion helpers (`toUiGuardrail`, `toUiResult`, `toUiAssignment`) and expose the adapter through `useGuardrailMockApi`. Do not introduce React Query or simulated HTTP.

- [ ] **Step 5: Run adapter and existing store tests**

Run: `npm test --workspace @tasklattice/control -- --run src/features/guard-governance/guardrails/guard-mock-adapter.test.tsx src/features/guard-governance/store.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the adapter**

```powershell
git add web/apps/control/src/features/guard-governance/guardrails/guard-contracts.ts web/apps/control/src/features/guard-governance/guardrails/guard-mock-adapter.ts web/apps/control/src/features/guard-governance/guardrails/guard-mock-adapter.test.tsx web/apps/control/src/features/guard-governance/mock-provider.tsx
git commit -m "feat: add Guard-compatible governance mock adapter"
```

---

### Task 2: Guard Product Primitives and Localized Copy

**Files:**
- Create: `web/apps/control/src/features/guard-governance/guardrails/guard-copy.ts`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guard-copy.test.ts`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guard-product-ui.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guard-product-ui.test.tsx`
- Modify: `web/apps/control/src/styles.css`

**Interfaces:**
- Produces: `useGuardCopy()` returning `{ locale, t, formatDate, formatDateTime }`.
- Produces: `GuardPageHeader`, `GuardStateBadge`, `GuardMetric`, `GuardInfoNotice`, `GuardErrorNotice`, `GuardEmptyState`, and `GuardCreationFlow`.

- [ ] **Step 1: Write failing copy and primitive tests**

```ts
it("uses Simplified Chinese when the document language is zh-CN", () => {
  document.documentElement.lang = "zh-CN";
  expect(createGuardCopy().t("guardrails.create")).toBe("创建 Guardrail");
});

it("falls back to English and interpolates values", () => {
  document.documentElement.lang = "fr";
  expect(createGuardCopy().t("guardrails.registry", { count: 4 })).toBe("Guardrail registry · 4");
});
```

```tsx
it("renders the Guard page hierarchy and blue feature accent", () => {
  render(<GuardPageHeader eyebrow="Governance / Model safety" title="Guardrails" description="Complete description" />);
  expect(screen.getByRole("heading", { level: 1, name: "Guardrails" })).toBeVisible();
  expect(screen.getByText("Governance / Model safety").closest("header")).toHaveClass("guard-ui");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test --workspace @tasklattice/control -- --run src/features/guard-governance/guardrails/guard-copy.test.ts src/features/guard-governance/guardrails/guard-product-ui.test.tsx`

Expected: FAIL because the copy and primitives are absent.

- [ ] **Step 3: Port only required Guard copy**

Copy the complete `guardrails`, common state, assignment, and evidence labels from `tasklattice-guard/web/src/i18n.ts` into typed `en` and `zh-CN` records. Implement `{{name}}` interpolation and default to English when `document.documentElement.lang` is neither `zh` nor `zh-CN`.

- [ ] **Step 4: Port Guard product primitives**

Reproduce the Guard component DOM and classes from `tasklattice-guard/web/src/components/product-shell.tsx` and `creation-flow.tsx`, using AgentEval's existing Button, Card, Progress, and Skeleton primitives. Scope feature token overrides under `.guard-ui`:

```css
.guard-ui {
  --primary: #2563eb;
  --primary-foreground: #fff;
  --radius-badge: .375rem;
  --radius-control: .5rem;
  --radius-card: .75rem;
  --radius-large: 1rem;
}
```

- [ ] **Step 5: Run copy and primitive tests**

Run: `npm test --workspace @tasklattice/control -- --run src/features/guard-governance/guardrails/guard-copy.test.ts src/features/guard-governance/guardrails/guard-product-ui.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit primitives**

```powershell
git add web/apps/control/src/features/guard-governance/guardrails/guard-copy.ts web/apps/control/src/features/guard-governance/guardrails/guard-copy.test.ts web/apps/control/src/features/guard-governance/guardrails/guard-product-ui.tsx web/apps/control/src/features/guard-governance/guardrails/guard-product-ui.test.tsx web/apps/control/src/styles.css
git commit -m "feat: port Guardrail product UI primitives"
```

---

### Task 3: Complete Registry and Creation Flow

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/guardrails/guardrails-page.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-create-sheet.tsx`
- Modify: `web/apps/control/src/features/guard-governance/guardrails/guardrails-page.test.tsx`

**Interfaces:**
- Consumes: `useGuardrailMockApi`, `useGuardCopy`, and Guard product primitives.
- Produces: `GuardrailsPage({ projectId }: { projectId: string })` and `GuardrailCreateSheet`.

- [ ] **Step 1: Replace registry expectations with Guard reference behavior**

```tsx
it("renders the Guard registry without AgentEval summary cards", () => {
  renderGovernance(<GuardrailsPage projectId="individual" />);
  expect(screen.getByText("Guardrail registry · 4")).toBeVisible();
  expect(screen.queryByText("Tested current")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Production Safety/ })).toHaveAttribute(
    "href", "/individual/governance/guardrails/guardrail-production",
  );
});

it("completes the imported blank-intent creation flow", async () => {
  await user.click(screen.getByRole("button", { name: "Create Guardrail" }));
  await user.click(screen.getByRole("button", { name: /Blank intent/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Guardrail name"), "Support Safety");
  await user.type(screen.getByLabelText("Business purpose"), "Protect approved customer support conversations.");
  await user.click(screen.getByRole("button", { name: "Analyze intent" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Create Guardrail" }));
  expect(screen.getByText("Support Safety")).toBeVisible();
});
```

- [ ] **Step 2: Run the registry tests and verify RED**

Run: `npm test --workspace @tasklattice/control -- --run src/features/guard-governance/guardrails/guardrails-page.test.tsx`

Expected: FAIL because the summary cards still render, navigation uses plain anchors, and the Guard creation flow is incomplete.

- [ ] **Step 3: Port the Guard registry**

Reproduce the registry section from the Guard source, including compact header, responsive hidden columns, row-level project-aware TanStack `Link`, loading skeleton hook points, error notice, empty state, localized default display copy, and icon-only open action. Remove all three `GovernanceMetric` cards.

- [ ] **Step 4: Port the complete creation sheet**

Move the reference creation flow into `guardrail-create-sheet.tsx`. Preserve template and blank paths, required template parameters, deterministic mock intent analysis, topic review, controls, policy binding validation, inline errors, and post-create navigation using:

```tsx
<Link
  to="/$projectId/governance/guardrails/$guardrailId"
  params={{ projectId, guardrailId }}
/>
```

- [ ] **Step 5: Run registry tests**

Run: `npm test --workspace @tasklattice/control -- --run src/features/guard-governance/guardrails/guardrails-page.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit registry and creation**

```powershell
git add web/apps/control/src/features/guard-governance/guardrails/guardrails-page.tsx web/apps/control/src/features/guard-governance/guardrails/guardrail-create-sheet.tsx web/apps/control/src/features/guard-governance/guardrails/guardrails-page.test.tsx
git commit -m "feat: import complete Guardrail registry and creation UI"
```

---

### Task 4: Complete Detail, Intent, Controls, and Editing

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/guardrails/guardrail-detail-page.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-intent-controls.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-edit-sheets.tsx`
- Modify: `web/apps/control/src/features/guard-governance/guardrails/guardrails-page.test.tsx`

**Interfaces:**
- Produces: `GuardrailWorkflowStatus`, `GuardrailIntentPanel`, `GuardrailControlsPanel`, `EditGuardrailSheet`, and `AddTestCaseSheet`.
- Consumes: adapter view models and the existing traffic-scope/assignment UI.

- [ ] **Step 1: Add failing complete-detail tests**

```tsx
it("renders the complete Guard default detail hierarchy", async () => {
  renderGovernance(<GuardrailDetailPage guardrailId="guardrail-default" projectId="individual" />);
  expect(screen.getByRole("region", { name: "Guardrail workflow" })).toBeVisible();
  expect(screen.getByText("Product-managed default Guardrail")).toBeVisible();
  expect(screen.getByText("Local deterministic evaluation")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Edit intent" })).not.toBeInTheDocument();
});

it("shows template provenance, limitations, and reasoning policy bindings", async () => {
  renderGovernance(<GuardrailDetailPage guardrailId="guardrail-draft" projectId="individual" />);
  await user.click(screen.getByRole("tab", { name: "Controls" }));
  expect(screen.getByText(/Source/)).toBeVisible();
  expect(screen.getByText(/confidence/)).toBeVisible();
  expect(screen.getByText(/limitation/i)).toBeVisible();
});
```

- [ ] **Step 2: Run detail tests and verify RED**

Run: `npm test --workspace @tasklattice/control -- --run src/features/guard-governance/guardrails/guardrails-page.test.tsx`

Expected: FAIL because the current detail uses the simplified hierarchy and incomplete control presentation.

- [ ] **Step 3: Port detail orchestration and workflow**

Reproduce the reference detail header, notice, status/timestamp strip, four-step workflow, four metrics, and five-tab shell. Use a project-aware TanStack back `Link`; do not use `<a href>`.

- [ ] **Step 4: Port intent and controls panels**

Move TopicPanel, TemplateControlSummary, RiskRow, decision posture, ownership, runtime boundary, limitations, and reasoning-policy binding display into `guardrail-intent-controls.tsx`. Preserve responsive column layout and Guard class names.

- [ ] **Step 5: Port edit and add-case sheets**

Move all fields and validation from the Guard reference, including phase, target source, trusted instruction, grounding query/sources, expected decision, and expected automated-reasoning result. Map operations through `GuardrailMockApi`.

- [ ] **Step 6: Run detail tests**

Run: `npm test --workspace @tasklattice/control -- --run src/features/guard-governance/guardrails/guardrails-page.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit detail UI**

```powershell
git add web/apps/control/src/features/guard-governance/guardrails/guardrail-detail-page.tsx web/apps/control/src/features/guard-governance/guardrails/guardrail-intent-controls.tsx web/apps/control/src/features/guard-governance/guardrails/guardrail-edit-sheets.tsx web/apps/control/src/features/guard-governance/guardrails/guardrails-page.test.tsx
git commit -m "feat: import complete Guardrail detail and control UI"
```

---

### Task 5: Full Test Evidence and Fixture Coverage

**Files:**
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-test-evidence.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrails/guardrail-test-evidence.test.tsx`
- Modify: `web/apps/control/src/features/guard-governance/fixtures.ts`
- Modify: `web/apps/control/src/features/guard-governance/store.ts`
- Modify: `web/apps/control/src/features/guard-governance/store.test.ts`

**Interfaces:**
- Produces: `GuardrailTestCasesPanel` and `GuardrailTestEvidence`.
- Consumes: `UiGuardrail`, `UiTestCase`, `UiEvaluationCaseResult`, adapter mutation functions, and localized copy.

- [ ] **Step 1: Write the failing evidence completeness test**

```tsx
it("renders every complex evidence block from mock data", async () => {
  const store = createGuardGovernanceStore(cloneGuardGovernanceFixtures("individual"));
  const guardrail = createGuardrailMockApi(store).getGuardrail("guardrail-production")!;
  render(<GuardrailTestEvidence guardrail={guardrail} />);
  expect(screen.getByText("Context grounding query")).toBeVisible();
  expect(screen.getByText("Grounding sources")).toBeVisible();
  expect(screen.getByText("Expected reasoning result")).toBeVisible();
  expect(screen.getByText("Triggered findings")).toBeVisible();
  expect(screen.getByText(/supporting rules/i)).toBeVisible();
  expect(screen.getByText("Execution trace")).toBeVisible();
  expect(screen.getByLabelText(/coverage/i)).toBeVisible();
});
```

- [ ] **Step 2: Run evidence tests and verify RED**

Run: `npm test --workspace @tasklattice/control -- --run src/features/guard-governance/guardrails/guardrail-test-evidence.test.tsx`

Expected: FAIL because the full evidence component and complete fixture do not exist.

- [ ] **Step 3: Enrich deterministic mock results**

Update `resultFor` and fixtures so at least one result contains grounding scores and claims and another contains automated reasoning proofs:

```ts
grounding: [{ type: "grounding", score: 0.94, threshold: 0.8, detected: true }],
claims: [{ id: "claim-1", claim: "The policy covers this request.", support: "supported", confidence: 0.93, sourceBlockIds: ["policy-7"], rationale: "Direct policy match." }],
reasoning: [{ id: "proof-1", result: "valid", confidence: 0.91, supportingRules: [{ id: "rule-7", expression: "approved(x)", description: "Approved request" }], contradictingRules: [], message: "The conclusion follows." }],
```

Keep test execution deterministic and preserve existing store behavior.

- [ ] **Step 4: Port full evidence presentation**

Port coverage Progress rows, TestEvidenceRow, EvidenceContent, EvidenceFact, decision metadata, findings, grounding scores, claims, reasoning proofs, and execution trace from the Guard reference. Failure rows start expanded; passing rows start collapsed.

- [ ] **Step 5: Run evidence, fixture, and store tests**

Run: `npm test --workspace @tasklattice/control -- --run src/features/guard-governance/guardrails/guardrail-test-evidence.test.tsx src/features/guard-governance/fixtures.test.ts src/features/guard-governance/store.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit evidence UI**

```powershell
git add web/apps/control/src/features/guard-governance/guardrails/guardrail-test-evidence.tsx web/apps/control/src/features/guard-governance/guardrails/guardrail-test-evidence.test.tsx web/apps/control/src/features/guard-governance/fixtures.ts web/apps/control/src/features/guard-governance/store.ts web/apps/control/src/features/guard-governance/store.test.ts
git commit -m "feat: restore complete Guardrail test evidence UI"
```

---

### Task 6: Versions, Assignment Sheet, and Route Regression

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/guardrails/guardrail-detail-page.tsx`
- Modify: `web/apps/control/src/features/guard-governance/assignments/assignments-page.tsx`
- Modify: `web/apps/control/src/features/guard-governance/guardrails/guardrails-page.test.tsx`
- Modify: `web/apps/control/src/routes/-guard-governance-routing.test.ts`
- Modify: `web/apps/control/src/routes/$projectId/governance/guardrails/$guardrailId.tsx`

**Interfaces:**
- Reuses: `CreateAssignmentSheet` exported by the assignments module.
- Preserves: `GuardrailDetailPage({ guardrailId, projectId })` route component interface.

- [ ] **Step 1: Write failing route and assignment interaction tests**

```tsx
it("opens and completes Assignment creation inside Guardrail detail", async () => {
  renderGovernance(<GuardrailDetailPage guardrailId="guardrail-production" projectId="individual" />);
  await user.click(screen.getByRole("button", { name: "Create Assignment" }));
  expect(screen.getByRole("heading", { name: "Create Assignment" })).toBeVisible();
  await user.type(screen.getByLabelText("Assignment name"), "Support traffic");
  await user.clear(screen.getByLabelText("Rule 1 value"));
  await user.type(screen.getByLabelText("Rule 1 value"), "support");
  await user.click(screen.getByRole("button", { name: "Create" }));
  expect(screen.getByText("Support traffic")).toBeVisible();
});
```

Add an integration route test using memory history that renders the router at `/individual/governance/guardrails/guardrail-production` and asserts the `Production Safety` detail heading, proving there is no fallback to Evaluation Overview.

- [ ] **Step 2: Run route/detail tests and verify RED**

Run: `npm test --workspace @tasklattice/control -- --run src/features/guard-governance/guardrails/guardrails-page.test.tsx src/routes/-guard-governance-routing.test.ts`

Expected: FAIL on current plain-link/fallback behavior or incomplete assignment sheet reuse.

- [ ] **Step 3: Export and reuse the complete Assignment sheet**

Make `CreateAssignmentSheet` a focused named export accepting:

```ts
type CreateAssignmentSheetProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  initialGuardrailId?: string;
  guardrailIds?: string[];
  onCreated?(id: string): void;
};
```

The Guardrail detail passes its tested Guardrail ID and refreshes from the mock provider after creation.

- [ ] **Step 4: Finish Versions and route-safe links**

Port the reference Versions list with compiler, checksum, created date, and active/versioned state. Replace all Guardrail registry/detail anchors with project-aware TanStack Links. Confirm the route module forwards both `guardrailId` and `projectId`.

- [ ] **Step 5: Run route, detail, and assignment tests**

Run: `npm test --workspace @tasklattice/control -- --run src/features/guard-governance/guardrails/guardrails-page.test.tsx src/features/guard-governance/assignments/assignments-page.test.tsx src/routes/-guard-governance-routing.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit route and assignment completion**

```powershell
git add web/apps/control/src/features/guard-governance/guardrails/guardrail-detail-page.tsx web/apps/control/src/features/guard-governance/assignments/assignments-page.tsx web/apps/control/src/features/guard-governance/guardrails/guardrails-page.test.tsx web/apps/control/src/routes/-guard-governance-routing.test.ts 'web/apps/control/src/routes/$projectId/governance/guardrails/$guardrailId.tsx'
git commit -m "fix: complete Guardrail detail routing and assignment flow"
```

---

### Task 7: Full Verification and Browser Comparison

**Files:**
- Test: all Guard Governance files listed in Tasks 1-6.

**Interfaces:**
- No new interfaces.

- [ ] **Step 1: Run all Guard Governance tests**

Run: `npm test --workspace @tasklattice/control -- --run src/features/guard-governance src/routes/-guard-governance-routing.test.ts`

Expected: all selected tests PASS with zero unhandled errors.

- [ ] **Step 2: Run the Control type check**

Run: `npm run typecheck --workspace @tasklattice/control`

Expected: exit code 0.

- [ ] **Step 3: Run the Control production build**

Run: `npm run build:control`

Expected: exit code 0 and Vite emits the production bundle.

- [ ] **Step 4: Compare registry pages in the browser**

Inspect side by side:

- `http://localhost:8091/guardrails`
- `http://localhost:8080/individual/governance/guardrails`

Verify the internal header, registry count strip, responsive table hierarchy, states, links, and create sheet match. The AgentEval outer shell is expected to differ.

- [ ] **Step 5: Verify the complete detail flow in the browser**

Open the AgentEval default and production details. Verify all five tabs; edit intent; add/delete a case; run tests; expand complex evidence; inspect versions; open and complete Assignment creation; return to the registry. Repeat the registry and detail inspection at a narrow viewport and reset the viewport afterward.

- [ ] **Step 6: Inspect the final diff and workspace**

Run: `git diff --check 8f57762..HEAD` and `git status --short`.

Expected: no whitespace errors and a clean workspace.

- [ ] **Step 7: Commit any verification-only fixes**

If Step 1-6 required changes, write a failing regression test first, apply the minimal fix, rerun the affected command, then commit:

```powershell
git add web/apps/control/src/features/guard-governance web/apps/control/src/routes/-guard-governance-routing.test.ts 'web/apps/control/src/routes/$projectId/governance/guardrails/$guardrailId.tsx' web/apps/control/src/styles.css
git commit -m "fix: address Guardrail UI verification findings"
```
