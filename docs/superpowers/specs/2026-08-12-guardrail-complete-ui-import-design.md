# Guardrail Source-Direct UI Import Design

## Goal

Reproduce the TaskLattice Guard Guardrail experience inside AgentEval by directly copying the Guard source implementation. Pixel and interaction fidelity apply to the Guardrail content area; AgentEval keeps its existing authentication, project sidebar, top bar, breadcrumb, and route shell.

The imported feature uses mock data only. It must not call the Guard backend, Prisma, SQLite, or any other real API. It must not modify the existing AgentEval Security Guardrails feature or the independent Guard Governance Assignment, Enforcement, Integration, and Evidence pages.

## Fidelity Boundary

The following Guardrail content is copied, not re-created:

- registry header, loading, error, empty, and table states;
- complete Create Guardrail sheet and three-step creation flow;
- Guardrail detail header, product notice, workflow, metrics, and actions;
- Safety Intent, Controls, Test Cases, Versions, and Assignments tabs;
- Edit Guardrail, Add Test Case, and Create Assignment sheets opened from the Guardrail page;
- complete coverage, test evidence, finding, grounding, claim, reasoning, and execution-trace presentation;
- responsive class names, control sizes, spacing, radii, colors, shadows, focus states, disabled states, and dark-mode behavior;
- Guardrail-related English and Simplified Chinese copy.

The following are intentionally different:

- AgentEval provides the surrounding application shell;
- canonical routes include `/$projectId/governance`;
- all data and mutations are in memory;
- the independent Guard Governance pages are not imported or changed.

Opening the original Create Assignment sheet from within Guardrail detail is part of the Guardrail-page replica. This does not import or change the independent Assignment page.

## Source-Direct Architecture

The Guard source is copied into an isolated AgentEval feature namespace:

```text
web/apps/control/src/features/guard-governance/guardrail-import/
  guardrails.tsx
  i18n.ts
  guardrail-theme.css
  components/
    creation-flow.tsx
    entity-sheet.tsx
    product-shell.tsx
    traffic-scope.tsx
    assignment-sheet.tsx
    ui/
  lib/
    auth-compat.tsx
    mock-api.tsx
    query-keys.ts
    utils.ts
```

`guardrails.tsx` begins as a direct copy of `tasklattice-guard/web/src/routes/guardrails.tsx`. Its DOM structure and Tailwind class names remain unchanged. Supporting Guard components and every Guard UI primitive used by this page are copied into the same namespace instead of resolving to AgentEval components with the same filenames.

This isolation prevents Guard component variants or theme tokens from changing existing AgentEval pages. It also avoids visually significant substitutions: AgentEval and Guard have similarly named Button, Sheet, Select, Tabs, and other primitives, but their implementations are not identical.

## Allowed Source Changes

Changes to copied Guard source are limited to four boundaries.

### Route Boundary

Original routes:

```text
/guardrails
/guardrails/$guardrailId
```

AgentEval routes:

```text
/$projectId/governance/guardrails
/$projectId/governance/guardrails/$guardrailId
```

The AgentEval file routes remain thin wrappers. They pass `projectId` and, for detail, `guardrailId` to the copied feature. Internal links and navigation use typed TanStack Router destinations with those parameters. No plain anchor is used for internal Guardrail navigation.

### Mock API Boundary

The copied page keeps its React Query lifecycle and mutation behavior. Its API import is redirected to `lib/mock-api.tsx`, which exports a `GuardrailMockApiProvider` and a `useGuardrailApi()` interface with Guard-compatible operations:

```ts
export type GuardrailApi = {
  getGuardrails(): Promise<Collection<Guardrail>>;
  getGuardrail(id: string): Promise<Guardrail>;
  getGuardrailTemplates(): Promise<Collection<GuardrailTemplate>>;
  getControlDefinitions(): Promise<Collection<ControlDefinition>>;
  getIntentAnalysisStatus(): Promise<IntentAnalysisStatus>;
  analyzeGuardrailIntent(input: AnalyzeIntentInput): Promise<IntentAnalysis>;
  createGuardrail(input: CreateGuardrailInput): Promise<Guardrail>;
  updateGuardrail(id: string, input: UpdateGuardrailInput): Promise<Guardrail>;
  getTestCases(guardrailId: string): Promise<Collection<TestCase>>;
  createTestCase(guardrailId: string, input: CreateTestCaseInput): Promise<TestCase>;
  deleteTestCase(id: string): Promise<void>;
  createTestRun(guardrailId: string): Promise<TestRun>;
  getGuardrailVersions(guardrailId: string): Promise<Collection<GuardrailVersion>>;
  getAssignments(): Promise<Collection<GuardrailAssignment>>;
  createAssignment(input: CreateAssignmentInput): Promise<GuardrailAssignment>;
  getTrafficScopeFields(): Promise<Collection<TrafficScopeField>>;
};
```

The provider adapts the existing Guard Governance in-memory store to the exact snake_case contracts used by Guard. The copied page changes only the API acquisition calls needed to obtain this interface. Query keys, pending states, invalidation, error rendering, success toasts, and disabled-button behavior remain structurally identical to Guard.

The adapter returns promises and supports deterministic loading, success, failure, and empty scenarios in tests. It never calls `fetch`.

### Localization and Auth Boundary

The Guardrail translation resources are copied from Guard without rewriting individual labels. The feature is wrapped by its own scoped i18next provider so it can retain the original `useTranslation()` calls without migrating the whole AgentEval application.

The language is selected from AgentEval's active language when one exists, then from the current local account preference, and finally defaults to English. Date formatting receives the same locale string used by the copied Guard page.

`auth-compat.tsx` exposes only the `preferred_language` value required by the original Create Guardrail flow. It does not replace AgentEval authentication or create a second login system.

### Scoped Theme and Portal Boundary

The Guard theme values are copied exactly, including:

```css
--primary: #2563eb;
--radius-badge: 0.375rem;
--radius-control: 0.5rem;
--radius-card: 0.75rem;
--radius-large: 1rem;
```

The values and remaining Guard color/shadow tokens are scoped under `.guardrail-import` rather than applied to `:root`.

Radix Sheet, Select, Dropdown, Tooltip, and other portal content renders outside the page wrapper. Copied portal primitives therefore add the same `.guardrail-import` class to their portal content roots. This ensures sheets, menus, overlays, focus rings, and dark-mode surfaces receive the Guard tokens without leaking those tokens globally.

## Mock Data Fidelity

Mock records use the complete Guard API structure. Fixtures cover:

- product-managed default Guardrail and immutable default Assignment;
- protected and ready custom Guardrails;
- a Guardrail that needs testing;
- templates, parameters, Control definitions, limitations, and reasoning-policy bindings;
- prompt-injection, grounding, and automated-reasoning test cases;
- passing, failing, and incomplete test runs;
- risk coverage;
- trusted instruction, untrusted target, model output, decision facts, grounding scores, claims, reasoning proofs, findings, and multi-stage traces;
- active and archived immutable versions;
- matched Traffic Scopes and paused/protected Assignment states.

Fixture richness may exceed the single default record in a fresh Guard database. This changes displayed content, not UI structure or behavior.

## Guardrail Page Behavior

### Registry

The registry uses the original Guard page hierarchy. It does not include AgentEval's added summary metric cards. The entire Guardrail name/purpose region opens detail through TanStack Router without a full-page reload or fallback redirect.

### Create and Edit

The source creation flow retains template search, template parameters, blank intent, analysis availability, analysis pending/success/stale states, review notes, allowed and restricted topics, Control editing, action selection, reasoning-policy configuration, topic validation, and final review.

Edit retains all source fields and validation. Successful mutations update the in-memory repository, invalidate the same query keys, close the sheet, and show the original toast copy.

### Test Cases and Evidence

The copied conditional form behavior remains intact for prompt security, contextual grounding, and automated reasoning. Test execution produces deterministic mock results and versions.

Evidence retains the original expandable layout and every nested block. Mock fixtures exercise each block so visual verification does not mistake missing data for a missing UI implementation.

### Versions and Assignments

Versions retain the original table and empty/loading states. The Assignments tab retains the original Traffic Scope badges, empty state, Apply action, and Create Assignment sheet. Creation mutates mock state only.

## Dependency Policy

Dependencies already match between the two projects for React, React DOM, TanStack Router, TanStack Query, Tailwind, Radix UI, Lucide, CVA, clsx, and tailwind-merge.

Add the exact Guard-compatible versions of `i18next`, `react-i18next`, and `sonner` to AgentEval if they are not already available. Do not replace them with approximate local implementations because doing so would alter copied source and observable behavior.

## Testing and Visual Acceptance

Behavior tests cover:

- loading, error, empty, and populated registry states;
- internal registry-to-detail and back navigation;
- every creation step and validation branch;
- edit and mutation invalidation;
- conditional test-case forms and deletion;
- passing, failing, and incomplete test runs;
- all five detail tabs;
- complete nested evidence;
- default immutability;
- Assignment sheet creation within detail;
- English and Simplified Chinese rendering;
- assertion that mock operations do not call `fetch`.

Visual acceptance compares AgentEval's content region with the running Guard reference at fixed desktop and mobile viewports:

- `1440 × 900`
- `390 × 844`

Required states include registry, all three creation steps, default detail, custom detail, all five tabs, expanded evidence, Edit sheet, each conditional Add Test Case form, Create Assignment sheet, loading, empty, and error states.

Screenshots are cropped to the Guardrail content region, excluding both products' surrounding sidebars and headers. Differences in fixture text and timestamps are acceptable; DOM hierarchy, spacing, dimensions, styling, visibility, and interaction states must match.

Verification also includes focused Guardrail tests, Control type checking, production build, and `git diff --check`.

## Out of Scope

- copying the Guard sidebar, account menu, login, overview, or global application shell;
- connecting to a real Guard service or database;
- importing independent Guard Governance routes or navigation entries;
- changing AgentEval's existing Security Guardrails;
- redesigning or refactoring copied Guard UI;
- substituting AgentEval components where the Guard component implementation differs.
