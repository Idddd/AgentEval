# Guardrail Source-Direct UI Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copy the TaskLattice Guard Guardrail content UI directly into AgentEval, preserving its source DOM, classes, components, interactions, and responsive behavior while replacing only routing, data, localization/auth, and scoped-theme boundaries.

**Architecture:** Place the copied Guard feature and all visually relevant dependencies under `guardrail-import/` so no AgentEval component or global token is overwritten. Keep the copied page's React Query lifecycle and use a context-provided in-memory API with the exact Guard snake_case contracts. AgentEval file routes remain thin wrappers around the copied registry and detail exports.

**Tech Stack:** React 19.2.7, TypeScript 7, TanStack Router 1.170.18, TanStack Query 5.101.2, Tailwind CSS 4.3.2, Radix UI 1.6.2, i18next 26.3.6, react-i18next 17.0.11, sonner 2.0.7, Vitest, Testing Library.

## Global Constraints

- Pixel and interaction fidelity apply to the Guardrail content region; do not copy the Guard sidebar, login, account menu, or global shell.
- Begin `guardrails.tsx` from `tasklattice-guard/web/src/routes/guardrails.tsx`; do not redesign or decompose its rendered UI.
- Copy Guard supporting components and UI primitives into the isolated `guardrail-import` namespace; do not substitute AgentEval components with the same names.
- Allowed changes to copied source are limited to project routes, mock API acquisition, scoped localization/auth, and scoped theme/portal handling.
- Keep the original Create Assignment sheet used inside Guardrail detail; do not import or modify the independent Assignment page.
- Use in-memory mock data only. No `fetch`, Guard API, Prisma, or SQLite access is permitted.
- Do not change AgentEval's existing Security Guardrails or independent Assignment, Enforcement, Integration, and Evidence routes.
- Preserve the user-owned modification in `web/apps/control/src/features/evaluation-layer/overview/behavior-page.test.tsx`; do not edit or stage it.
- Use failing tests before each production change.

---

### Task 1: Install Exact Guard Dependencies and Copy the Scoped Visual Foundation

**Files:**
- Modify: `web/apps/control/package.json`
- Modify: `web/package-lock.json`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/guardrail-theme.css`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/creation-flow.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/entity-sheet.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/product-shell.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/alert.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/badge.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/button.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/card.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/checkbox.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/input.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/label.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/progress.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/radio-group.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/select.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/sheet.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/skeleton.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/sonner.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/switch.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/table.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/tabs.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/ui/textarea.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/lib/utils.ts`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/source-fidelity.test.tsx`

**Interfaces:**
- Consumes: exact source files under `tasklattice-guard/web/src/components` and Guard theme tokens in `tasklattice-guard/web/src/styles.css`.
- Produces: namespaced Guard components with unchanged rendered class names and `.guardrail-import` theme propagation through Radix portals.

- [ ] **Step 1: Write a failing fidelity test for source component behavior and exact tokens**

```tsx
/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CreationFlow } from "./components/creation-flow";
import { EntitySheet } from "./components/entity-sheet";
import themeCss from "./guardrail-theme.css?raw";

describe("Guard source visual foundation", () => {
  it("keeps the original creation step and sheet dimensions", () => {
    render(<CreationFlow currentStep={0} onStepChange={() => undefined} progressLabel="Create" steps={[{ label: "Start", description: "Choose source" }]}><div>Body</div></CreationFlow>);
    expect(screen.getByRole("button", { name: /Start/ }).className).toContain("min-h-20");
  });

  it("copies exact Guard theme values", () => {
    expect(themeCss).toContain("--primary: #2563eb");
    expect(themeCss).toContain("--radius-card: 0.75rem");
    expect(themeCss).toContain("--radius-large: 1rem");
  });

  it("marks portal content with the Guard namespace", () => {
    render(<EntitySheet open onOpenChange={() => undefined} title="Create" description="Description" width="xl"><div>Body</div></EntitySheet>);
    expect(document.querySelector(".guardrail-import")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the foundation test and verify RED**

Run: `npm test --workspace @tasklattice/control -- source-fidelity.test.tsx`

Expected: FAIL because the isolated Guard components and theme do not exist.

- [ ] **Step 3: Add the exact Guard dependency versions**

Run from `web/`:

```powershell
npm install --save-exact --workspace @tasklattice/control i18next@26.3.6 react-i18next@17.0.11 sonner@2.0.7 react-querybuilder@8.22.4
```

Expected: `web/apps/control/package.json` and `web/package-lock.json` contain those exact compatible versions.

- [ ] **Step 4: Copy supporting component source without visual substitutions**

Use `apply_patch` to add the exact contents of these Guard sources under the namespaced paths listed above:

```text
tasklattice-guard/web/src/components/creation-flow.tsx
tasklattice-guard/web/src/components/entity-sheet.tsx
tasklattice-guard/web/src/components/product-shell.tsx
tasklattice-guard/web/src/components/ui/alert.tsx
tasklattice-guard/web/src/components/ui/badge.tsx
tasklattice-guard/web/src/components/ui/button.tsx
tasklattice-guard/web/src/components/ui/card.tsx
tasklattice-guard/web/src/components/ui/checkbox.tsx
tasklattice-guard/web/src/components/ui/input.tsx
tasklattice-guard/web/src/components/ui/label.tsx
tasklattice-guard/web/src/components/ui/progress.tsx
tasklattice-guard/web/src/components/ui/radio-group.tsx
tasklattice-guard/web/src/components/ui/select.tsx
tasklattice-guard/web/src/components/ui/sheet.tsx
tasklattice-guard/web/src/components/ui/skeleton.tsx
tasklattice-guard/web/src/components/ui/sonner.tsx
tasklattice-guard/web/src/components/ui/switch.tsx
tasklattice-guard/web/src/components/ui/table.tsx
tasklattice-guard/web/src/components/ui/tabs.tsx
tasklattice-guard/web/src/components/ui/textarea.tsx
tasklattice-guard/web/src/lib/utils.ts
```

Change imports only from `@/...` to their corresponding namespaced relative paths. Add `className="guardrail-import"` to copied portal overlay/content roots in Sheet and Select so scoped variables reach overlays and menus. In the copied Sonner wrapper, replace the unavailable `next-themes` hook with the fixed `theme="light"` used by AgentEval's root preference and set its root class to `guardrail-import toaster group`; retain the original icons, CSS variables, position, and rich-color behavior. Do not change any other JSX or Tailwind class.

- [ ] **Step 5: Copy the exact theme values into a scoped selector**

```css
.guardrail-import {
  --primary: #2563eb;
  --primary-foreground: #ffffff;
  --radius-badge: 0.375rem;
  --radius-control: 0.5rem;
  --radius-card: 0.75rem;
  --radius-large: 1rem;
}
```

Copy the remaining light/dark Guard tokens from `tasklattice-guard/web/src/styles.css` into `.guardrail-import` and `.dark .guardrail-import`. Do not copy Guard base selectors that would affect elements outside this namespace.

- [ ] **Step 6: Run the foundation test and verify GREEN**

Run: `npm test --workspace @tasklattice/control -- source-fidelity.test.tsx`

Expected: PASS with exact step dimensions, theme values, and portal scoping.

- [ ] **Step 7: Commit the visual foundation**

```powershell
git add web/apps/control/package.json web/package-lock.json web/apps/control/src/features/guard-governance/guardrail-import
git commit -m "feat: copy scoped Guard UI foundation"
```

### Task 2: Build the Guard-Compatible In-Memory API

**Files:**
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/lib/contracts.ts`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/lib/query-keys.ts`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/lib/mock-api.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/lib/mock-api.test.tsx`
- Modify: `web/apps/control/src/features/guard-governance/model.ts`
- Modify: `web/apps/control/src/features/guard-governance/fixtures.ts`
- Modify: `web/apps/control/src/features/guard-governance/store.ts`

**Interfaces:**
- Consumes: `GuardGovernanceStore` from `../store.ts` and the complete Guard API types copied from `tasklattice-guard/web/src/lib/api.ts`.
- Produces: `GuardrailApi`, `GuardrailMockApiProvider`, `useGuardrailApi`, Guard query keys, and deterministic scenario controls.

- [ ] **Step 1: Write failing API contract tests**

```tsx
/** @vitest-environment jsdom */
import { renderHook, act } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GuardrailMockApiProvider, useGuardrailApi } from "./mock-api";

it("returns complete snake_case Guard structures without fetch", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const wrapper = ({ children }: { children: React.ReactNode }) => <GuardGovernanceProvider projectId="individual"><GuardrailMockApiProvider>{children}</GuardrailMockApiProvider></GuardGovernanceProvider>;
  const { result } = renderHook(() => useGuardrailApi(), { wrapper });
  const collection = await result.current.getGuardrails();
  const detail = await result.current.getGuardrail("guardrail-production");
  expect(collection.items.length).toBeGreaterThan(1);
  expect(detail).toMatchObject({ tested_current: true, latest_test_run: { results: expect.any(Array) } });
  expect(detail.latest_test_run?.results[0]).toMatchObject({ findings: expect.any(Array), trace: expect.any(Array) });
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("persists mutations and creates immutable versions", async () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <GuardGovernanceProvider projectId="individual"><GuardrailMockApiProvider>{children}</GuardrailMockApiProvider></GuardGovernanceProvider>;
  const { result } = renderHook(() => useGuardrailApi(), { wrapper });
  await act(() => result.current.createTestRun("guardrail-draft"));
  const versions = await result.current.getGuardrailVersions("guardrail-draft");
  expect(versions.items.at(0)?.active).toBe(true);
});
```

- [ ] **Step 2: Run the API tests and verify RED**

Run: `npm test --workspace @tasklattice/control -- mock-api.test.tsx`

Expected: FAIL because the Guard contracts and provider do not exist.

- [ ] **Step 3: Copy the exact Guard API contracts and query keys**

Copy the Guardrail, test, evidence, version, Assignment, Traffic Scope, template, Control-definition, input, and collection types from `tasklattice-guard/web/src/lib/api.ts` into `contracts.ts` without renaming snake_case properties. Copy relevant keys from `tasklattice-guard/web/src/features/query-keys.ts` into `query-keys.ts`:

```ts
export const queryKeys = {
  guardrails: ["resources", "guardrails"] as const,
  guardrail: (id: string) => ["resources", "guardrails", id] as const,
  guardrailVersions: (id: string) => ["resources", "guardrail-versions", id] as const,
  guardrailTemplates: ["resources", "guardrail-templates"] as const,
  controlDefinitions: ["resources", "control-definitions"] as const,
  testCases: (id: string) => ["resources", "test-cases", { guardrailId: id }] as const,
  assignments: ["resources", "assignments"] as const,
  trafficScopeFields: ["resources", "traffic-scope-fields"] as const,
  intentAnalysisStatus: ["resources", "intent-analysis-status"] as const,
  metrics: ["resources", "metrics"] as const,
};
```

- [ ] **Step 4: Implement the context API over isolated complete fixtures**

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

export function GuardrailMockApiProvider({ children, scenario = "populated" }: {
  children: React.ReactNode;
  scenario?: "populated" | "loading" | "empty" | "error";
}) {
  const store = useGuardGovernanceStore();
  const api = useMemo(() => createGuardrailApi(store, scenario), [store, scenario]);
  return <GuardrailApiContext.Provider value={api}>{children}</GuardrailApiContext.Provider>;
}
```

Use `useGuardGovernanceStore()` inside `GuardrailMockApiProvider` and map the existing provider state to the exact Guard contracts at the API boundary. Mutations call the existing store methods so the other mock governance pages retain a single shared in-memory state. All API methods return promises. Expose a test-only `scenario?: "populated" | "loading" | "empty" | "error"` prop; `loading` resolves through a controllable deferred promise and `error` rejects with `new Error("Mock Guardrail request failed")`.

- [ ] **Step 5: Populate every original UI branch**

Extend the existing AgentEval model, fixtures, and store only where fields or mutations are missing. Fixtures must include the default Guardrail, protected custom Guardrail, needs-testing Guardrail, all templates and Control definitions, prompt-security/grounding/reasoning cases, pass/fail/incomplete runs, nested grounding/claims/reasoning findings, active/archived versions, recursive Traffic Scopes, and Assignment states. The API adapter converts these shared camelCase entities to exact Guard snake_case contracts.

- [ ] **Step 6: Run the API tests and verify GREEN**

Run: `npm test --workspace @tasklattice/control -- mock-api.test.tsx`

Expected: PASS for complete structures, persistence, scenario behavior, and zero fetch calls.

- [ ] **Step 7: Commit the mock API**

```powershell
git add web/apps/control/src/features/guard-governance/guardrail-import/lib web/apps/control/src/features/guard-governance/model.ts web/apps/control/src/features/guard-governance/fixtures.ts web/apps/control/src/features/guard-governance/store.ts
git commit -m "feat: add Guard-compatible mock API"
```

### Task 3: Copy Guard Localization, Auth Compatibility, and Assignment Dependencies

**Files:**
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/i18n.ts`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/lib/auth-compat.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/guardrail-import-provider.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/traffic-scope/index.ts`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/traffic-scope/model.ts`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/traffic-scope/types.ts`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/traffic-scope/traffic-scope-builder.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/traffic-scope/query-builder.css`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/query-builder/index.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/query-builder/ShadcnActionElement.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/query-builder/ShadcnNotToggle.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/query-builder/ShadcnShiftActions.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/query-builder/ShadcnValueEditor.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/query-builder/ShadcnValueSelector.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/components/assignment-sheet.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/test-utils.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/provider.test.tsx`

**Interfaces:**
- Consumes: Guard translation resources, current AgentEval project ID, optional active language, and the TaskLattice Guard Traffic Scope/Assignment source.
- Produces: `GuardrailImportProvider`, `useGuardAuth`, `CreateAssignmentSheet`, `TrafficScopeBadges`, and copied Traffic Scope UI.

- [ ] **Step 1: Write failing provider and localization tests**

```tsx
function TranslatedProbe() {
  const { t } = useTranslation();
  return <span>{t("guardrails.create")}</span>;
}

it("renders original Guard copy in English and Simplified Chinese", async () => {
  renderImported(<TranslatedProbe />, { language: "en" });
  expect(screen.getByText("Create Guardrail")).not.toBeNull();
  cleanup();
  renderImported(<TranslatedProbe />, { language: "zh-CN" });
  expect(await screen.findByText("创建 Guardrail")).not.toBeNull();
});

it("exposes only the preferred language through auth compatibility", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <GuardGovernanceProvider projectId="individual"><GuardrailImportProvider projectId="individual" language="zh-CN">{children}</GuardrailImportProvider></GuardGovernanceProvider>;
  const { result } = renderHook(() => useGuardAuth(), { wrapper });
  expect(result.current.user?.preferred_language).toBe("zh-CN");
});
```

- [ ] **Step 2: Run provider tests and verify RED**

Run: `npm test --workspace @tasklattice/control -- provider.test.tsx`

Expected: FAIL because the scoped translation/auth provider and copied Assignment dependencies do not exist.

- [ ] **Step 3: Copy Guardrail-related translation resources without rewriting labels**

Copy the `common`, `states`, `pages.guardrails`, `guardrails`, `assignments`, and `playground.stages` keys for both `en` and `zh-CN` from `tasklattice-guard/web/src/i18n.ts`. Create one i18next instance per provider with `createInstance()` so its language changes do not mutate a global AgentEval instance.

- [ ] **Step 4: Compose the scoped provider**

```tsx
export function GuardrailImportProvider({ children, projectId, language = "en", scenario = "populated" }: Props) {
  return <I18nextProvider i18n={getGuardrailI18n(language)}>
    <GuardAuthProvider preferredLanguage={language}>
      <GuardrailMockApiProvider scenario={scenario}>
        <div className="guardrail-import min-w-0">{children}</div>
        <Toaster position="bottom-right" richColors />
      </GuardrailMockApiProvider>
    </GuardAuthProvider>
  </I18nextProvider>;
}
```

Initialize each scoped i18next instance synchronously with `initImmediate: false`, the copied `en` and `zh-CN` resources, `fallbackLng: "en"`, and `interpolation.escapeValue: false`.

- [ ] **Step 5: Add the shared imported-feature test renderer**

```tsx
type Options = {
  language?: "en" | "zh-CN";
  projectId?: string;
  scenario?: "populated" | "loading" | "empty" | "error";
};

export function renderImported(
  node: React.ReactNode,
  { language = "en", projectId = "individual", scenario = "populated" }: Options = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GuardGovernanceProvider projectId={projectId}>
        <GuardrailImportProvider projectId={projectId} language={language} scenario={scenario}>
          {node}
        </GuardrailImportProvider>
      </GuardGovernanceProvider>
    </QueryClientProvider>,
  );
}
```

- [ ] **Step 6: Copy the complete Traffic Scope and Assignment sheet source**

Copy all listed files directly from:

```text
tasklattice-guard/web/src/components/traffic-scope/
tasklattice-guard/web/src/components/query-builder/
tasklattice-guard/web/src/routes/assignments.tsx
```

From `assignments.tsx`, retain `CreateAssignmentSheet`, `TrafficScopeBadges`, their private rendering helpers, and their imports. Omit only `AssignmentsPage` and `AssignmentRow`, which belong to the independent route. Redirect API calls through `useGuardrailApi()` and component imports to the isolated namespace. Preserve rendered JSX and class names. Replace the global `react-querybuilder/dist/query-builder.css` import with a copied stylesheet whose selectors are prefixed by `.guardrail-import`, preserving every declaration while preventing global leakage.

- [ ] **Step 7: Run provider tests and verify GREEN**

Run: `npm test --workspace @tasklattice/control -- provider.test.tsx`

Expected: PASS for exact bilingual copy, isolated language state, auth compatibility, and provider composition.

- [ ] **Step 8: Commit scoped provider and Assignment dependencies**

```powershell
git add web/apps/control/src/features/guard-governance/guardrail-import
git commit -m "feat: copy Guard localization and assignment UI"
```

### Task 4: Copy the Original Guardrail Registry and Creation Flow

**Files:**
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/guardrails.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/guardrails-registry.test.tsx`
- Modify: `web/apps/control/src/routes/$projectId/governance/guardrails/index.tsx`

**Interfaces:**
- Consumes: copied Guard components, `useGuardrailApi`, query keys, scoped i18n/auth, `projectId`, and React Query context already present in AgentEval.
- Produces: source-faithful `GuardrailsPage({ projectId })` and complete Create Guardrail flow.

- [ ] **Step 1: Write failing registry and creation tests against original behavior**

```tsx
it("renders the original registry hierarchy without AgentEval metric cards", async () => {
  renderImported(<GuardrailsPage projectId="individual" />);
  expect(await screen.findByText("Guardrail registry · 4")).not.toBeNull();
  expect(screen.queryByText("Tested current")).toBeNull();
  expect(screen.getByRole("columnheader", { name: "Test evidence" })).not.toBeNull();
});

it.each([
  ["loading", "skeleton"],
  ["empty", "No Guardrails yet"],
  ["error", "Mock Guardrail request failed"],
] as const)("renders the original %s registry state", async (scenario, expected) => {
  const { container } = renderImported(<GuardrailsPage projectId="individual" />, { scenario });
  if (expected === "skeleton") expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  else expect(await screen.findByText(expected)).not.toBeNull();
});

it("retains template search, blank analysis, and Control review", async () => {
  const user = userEvent.setup();
  renderImported(<GuardrailsPage projectId="individual" />);
  await user.click(await screen.findByRole("button", { name: "Create Guardrail" }));
  expect(screen.getByRole("navigation", { name: "Create Guardrail" })).not.toBeNull();
  expect(screen.getByLabelText("Find a local template")).not.toBeNull();
  await user.click(screen.getByRole("button", { name: /Blank safety intent/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Guardrail name"), "Finance Guard");
  await user.type(screen.getByLabelText("Business purpose"), "Finance employees analyze approved company financial data.");
  await user.click(screen.getByRole("button", { name: "Analyze protection intent" }));
  expect(await screen.findByText("Rule draft generated")).not.toBeNull();
});

it("retains the complete template parameter and review path", async () => {
  const user = userEvent.setup();
  renderImported(<GuardrailsPage projectId="individual" />);
  await user.click(await screen.findByRole("button", { name: "Create Guardrail" }));
  await user.click(screen.getByRole("button", { name: /Enterprise Safety Baseline/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText(/Organization name/), "TaskLattice");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("Included controls")).not.toBeNull();
  expect(screen.getByText("What happens next")).not.toBeNull();
});
```

- [ ] **Step 2: Run registry tests and verify RED**

Run: `npm test --workspace @tasklattice/control -- guardrails-registry.test.tsx`

Expected: FAIL because the source-direct page does not yet exist.

- [ ] **Step 3: Copy `guardrails.tsx` verbatim, then change imports only**

Use `apply_patch` to add the full contents of `tasklattice-guard/web/src/routes/guardrails.tsx`. Redirect imports to the copied namespace. Replace static API imports with:

```ts
const api = useGuardrailApi();
```

and use `api.getGuardrails`, `api.createGuardrail`, and corresponding methods as query/mutation functions. Do not alter registry or creation-flow JSX/className strings.

- [ ] **Step 4: Adapt only registry navigation**

Change the row link and post-create navigation to:

```tsx
<Link
  to="/$projectId/governance/guardrails/$guardrailId"
  params={{ projectId, guardrailId: guardrail.id }}
>
```

and:

```ts
navigate({
  to: "/$projectId/governance/guardrails/$guardrailId",
  params: { projectId, guardrailId: id },
});
```

- [ ] **Step 5: Replace the old route component with the scoped provider wrapper**

```tsx
function GuardrailsRoute() {
  const { projectId } = Route.useParams();
  return <GuardrailImportProvider projectId={projectId}>
    <GuardrailsPage projectId={projectId} />
  </GuardrailImportProvider>;
}
```

- [ ] **Step 6: Run registry tests and verify GREEN**

Run: `npm test --workspace @tasklattice/control -- guardrails-registry.test.tsx`

Expected: PASS for original hierarchy, loading/populated behavior, template and blank creation paths, analysis states, validation, and typed links.

- [ ] **Step 7: Commit registry source import**

```powershell
git add -- web/apps/control/src/features/guard-governance/guardrail-import/guardrails.tsx web/apps/control/src/features/guard-governance/guardrail-import/guardrails-registry.test.tsx 'web/apps/control/src/routes/$projectId/governance/guardrails/index.tsx'
git commit -m "feat: directly import Guardrail registry source"
```

### Task 5: Wire the Original Guardrail Detail, Evidence, and Sheets

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/guardrail-import/guardrails.tsx`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/guardrail-detail.test.tsx`
- Modify: `web/apps/control/src/routes/$projectId/governance/guardrails/$guardrailId.tsx`

**Interfaces:**
- Consumes: the detail implementation already present in the copied `guardrails.tsx`, complete mock API, copied Assignment sheet, `projectId`, and `guardrailId`.
- Produces: source-faithful Guardrail detail with all tabs, actions, conditional forms, evidence, versions, and in-page Assignment creation.

- [ ] **Step 1: Write failing full-detail tests**

```tsx
it("renders the original workflow and all five tabs", async () => {
  renderImported(<GuardrailDetailPage projectId="individual" guardrailId="guardrail-production" />);
  expect(await screen.findByRole("region", { name: "Guardrail workflow" })).not.toBeNull();
  for (const name of ["Intent", "Controls", "Test cases", "Versions", "Assignments"]) {
    expect(screen.getByRole("tab", { name })).not.toBeNull();
  }
});

it("renders every nested evidence block", async () => {
  const user = userEvent.setup();
  renderImported(<GuardrailDetailPage projectId="individual" guardrailId="guardrail-production" />);
  await user.click(await screen.findByRole("tab", { name: "Test cases" }));
  expect(screen.getByText("Compliance")).not.toBeNull();
  expect(screen.getByText("Trusted instruction")).not.toBeNull();
  expect(screen.getByText("Grounding sources")).not.toBeNull();
  expect(screen.getByText("Triggered findings")).not.toBeNull();
  expect(screen.getByText("Execution trace")).not.toBeNull();
});

it("opens the original Create Assignment sheet from detail", async () => {
  const user = userEvent.setup();
  renderImported(<GuardrailDetailPage projectId="individual" guardrailId="guardrail-production" />);
  await user.click(await screen.findByRole("button", { name: "Create Assignment" }));
  expect(screen.getByRole("heading", { name: "Create Assignment" })).not.toBeNull();
  expect(screen.getByText("Traffic characteristics")).not.toBeNull();
});

it("retains edit, conditional Test Case, and version UI", async () => {
  const user = userEvent.setup();
  renderImported(<GuardrailDetailPage projectId="individual" guardrailId="guardrail-production" />);
  await user.click(await screen.findByRole("button", { name: "Edit intent" }));
  expect(screen.getByLabelText("Business purpose")).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("tab", { name: "Test cases" }));
  await user.click(screen.getByRole("button", { name: "Add case" }));
  expect(screen.getByText("Prompt trust boundary")).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("tab", { name: "Versions" }));
  expect(screen.getByText("sha256:prod-v2-a3c8")).not.toBeNull();
});

it("keeps the product-managed default immutable", async () => {
  renderImported(<GuardrailDetailPage projectId="individual" guardrailId="guardrail-default" />);
  expect(await screen.findByText("Product-managed default Guardrail")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Edit intent" })).toBeNull();
});
```

- [ ] **Step 2: Run detail tests and verify RED**

Run: `npm test --workspace @tasklattice/control -- guardrail-detail.test.tsx`

Expected: FAIL until detail accepts route props and all API/Assignment imports are wired.

- [ ] **Step 3: Adapt only detail parameters and back navigation**

Change the copied detail export from router parameter discovery to explicit props:

```ts
export function GuardrailDetailPage({ projectId, guardrailId }: { projectId: string; guardrailId: string }) {
  // original detail body remains unchanged
}
```

Change only the back link:

```tsx
<Link to="/$projectId/governance/guardrails" params={{ projectId }}>
```

Keep WorkflowStatus, EditGuardrailSheet, AddTestCaseSheet, ControlEditor, TestEvidence, TestEvidenceRow, Versions, and Assignment JSX/class names unchanged.

- [ ] **Step 4: Wire all detail queries and mutations through `useGuardrailApi()`**

Use the same query keys and invalidation calls as Guard. Replace only static functions in queryFn/mutationFn expressions, for example:

```ts
const guardrailQuery = useQuery({ queryKey: queryKeys.guardrail(guardrailId), queryFn: () => api.getGuardrail(guardrailId), enabled: Boolean(guardrailId) });
const test = useMutation({ mutationFn: () => api.createTestRun(guardrailId), onSuccess: refresh });
```

- [ ] **Step 5: Wrap the detail route**

```tsx
function GuardrailDetailRoute() {
  const { projectId, guardrailId } = Route.useParams();
  return <GuardrailImportProvider projectId={projectId}>
    <GuardrailDetailPage projectId={projectId} guardrailId={guardrailId} />
  </GuardrailImportProvider>;
}
```

- [ ] **Step 6: Run detail tests and verify GREEN**

Run: `npm test --workspace @tasklattice/control -- guardrail-detail.test.tsx`

Expected: PASS for workflow, five tabs, edit/test flows, complete evidence, versions, default immutability, and Create Assignment sheet.

- [ ] **Step 7: Commit complete detail wiring**

```powershell
git add -- web/apps/control/src/features/guard-governance/guardrail-import/guardrails.tsx web/apps/control/src/features/guard-governance/guardrail-import/guardrail-detail.test.tsx 'web/apps/control/src/routes/$projectId/governance/guardrails/$guardrailId.tsx'
git commit -m "feat: directly import Guardrail detail source"
```

### Task 6: Route, Scope, Build, and Visual Fidelity Verification

**Files:**
- Modify: `web/apps/control/src/routes/-guard-governance-routing.test.ts`
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/scope-regression.test.ts`
- Modify only if generated output is stale: `web/apps/control/src/routeTree.gen.ts`

**Interfaces:**
- Consumes: completed imported Guardrail feature and both running references.
- Produces: verified route containment, no cross-module modifications, production build, and fixed-viewport visual comparison.

- [ ] **Step 1: Add failing route and scope regression tests**

```ts
it("uses only typed project Guardrail routes", () => {
  expect(importedSource).toContain('to="/$projectId/governance/guardrails/$guardrailId"');
  expect(importedSource).toContain('to="/$projectId/governance/guardrails"');
  expect(importedSource).not.toContain('to="/guardrails"');
  expect(importedSource).not.toContain("<a href=");
});

it("does not import independent governance route pages", () => {
  expect(importedSource).not.toContain('from "@/features/guard-governance/assignments');
  expect(importedSource).not.toContain('from "@/features/guard-governance/enforcements');
  expect(importedSource).not.toContain('from "@/features/guard-governance/integrations');
  expect(importedSource).not.toContain('from "@/features/guard-governance/evidence');
});
```

- [ ] **Step 2: Run route/scope tests and verify RED**

Run: `npm test --workspace @tasklattice/control -- -guard-governance-routing.test.ts scope-regression.test.ts`

Expected: FAIL for any stale hard-coded Guard route or old governance-page import.

- [ ] **Step 3: Apply minimal route corrections and remove the rewritten page imports**

The two file routes must import only from `guardrail-import`. Existing files under `features/guard-governance/guardrails/` may remain for history but must no longer be reachable from the Guard Governance routes. Do not delete or change independent governance pages.

- [ ] **Step 4: Run all focused tests**

Run:

```powershell
npm test --workspace @tasklattice/control -- source-fidelity.test.tsx mock-api.test.tsx provider.test.tsx guardrails-registry.test.tsx guardrail-detail.test.tsx -guard-governance-routing.test.ts scope-regression.test.ts
```

Expected: all focused tests PASS with zero failures.

- [ ] **Step 5: Run type checking and production build**

Run: `npm run typecheck --workspace @tasklattice/control`

Expected: exit code 0 with no TypeScript errors.

Run: `npm run build:control`

Expected: exit code 0 with a generated Control production bundle.

- [ ] **Step 6: Compare fixed desktop screenshots**

At `1440 × 900`, compare cropped content regions for:

```text
http://localhost:8080/individual/governance/guardrails
http://localhost:8091/guardrails
```

Capture registry, all three Create steps, default detail, custom detail, every tab, expanded evidence, Edit sheet, all conditional Add Test Case states, Create Assignment sheet, loading, empty, and error states. Fixture text and timestamps may differ; layout, spacing, dimensions, styles, visibility, and interaction states must match.

- [ ] **Step 7: Compare fixed mobile screenshots**

Repeat the same content states at `390 × 844`. Verify hidden table columns, wrapping, sheet width, tab wrapping, scroll containment, and portal styling against Guard.

- [ ] **Step 8: Verify route behavior in the running app**

Click a registry row and verify the URL becomes:

```text
http://localhost:8080/individual/governance/guardrails/<guardrail-id>
```

Confirm it renders the imported detail and never redirects to Evaluation Overview. Use the Back control and confirm it returns to the registry without a full-page reload.

- [ ] **Step 9: Audit scope and working tree**

Run: `git diff --check`

Run: `git status --short`

Confirm `web/apps/control/src/features/evaluation-layer/overview/behavior-page.test.tsx` remains user-owned, unstaged, and unchanged by this work. Confirm no independent Guard Governance page is present in the staged diff.

- [ ] **Step 10: Commit final integration corrections**

```powershell
git add web/apps/control/src/routes/-guard-governance-routing.test.ts web/apps/control/src/features/guard-governance/guardrail-import/scope-regression.test.ts web/apps/control/src/routeTree.gen.ts
git commit -m "test: verify Guardrail source import fidelity"
```
