# Guardrail Multi-Template Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combine several built-in Guard templates into one editable, Mock-backed Guardrail and simplify Guardrail detail UI.

**Architecture:** Add pure template-composition helpers beside the imported Guardrail feature, then extend the internal model and Mock adapter to retain multiple source templates and namespaced parameters. The imported creation sheet consumes those helpers for multi-selection and derived intent; the local store remains the only persistence and analysis layer.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, Testing Library, Tailwind CSS, local Guard governance store.

**Spec:** `docs/superpowers/specs/2026-08-13-guardrail-multi-template-creation-design.md`

## Global Constraints

- All analysis and persistence remain local Mock behavior; introduce no network API.
- One or more selected templates create exactly one Guardrail.
- Template selection order must not change the composed result.
- `Customize Intent Create` is copy and form behavior only; add no file upload or parser.
- Keep independent Assignment pages and their Mock APIs unchanged.
- Preserve unrelated working-tree changes and exclude them from task commits.

---

### Task 1: Pure Template Composition

**Files:**
- Create: `web/apps/control/src/features/guard-governance/guardrail-import/lib/template-composition.ts`
- Test: `web/apps/control/src/features/guard-governance/guardrail-import/lib/template-composition.test.ts`

**Interfaces:**
- Consumes `GuardrailTemplate`, `GuardrailControl`, `GuardrailSafetyLevel`, and `GuardrailOutputDelivery` from `lib/contracts.ts`.
- Produces `composeTemplates(templates: GuardrailTemplate[]): ComposedTemplateIntent`.
- Produces `parameterKey(templateId: string, parameterName: string): string`.
- `ComposedTemplateIntent` contains `name`, `purpose`, `allowedTopics`, `restrictedTopics`, `controls`, `safetyLevel`, and `outputDelivery`.

- [ ] **Step 1: Write failing composition tests**

Use two literal templates with overlapping topics and Controls. Assert reversed input order gives the same result, topics are case-insensitively de-duplicated, Controls are de-duplicated by risk/action/reasoning-policy identity, safety becomes `maximum`, delivery becomes `full_buffered`, and parameter keys are namespaced.

```ts
expect(composeTemplates([baseline, maximum])).toEqual(
  composeTemplates([maximum, baseline]),
);
expect(result.allowedTopics).toEqual([
  "Approved finance analysis",
  "Policy explanation",
]);
expect(result.controls).toHaveLength(2);
expect(result.safetyLevel).toBe("maximum");
expect(result.outputDelivery).toBe("full_buffered");
expect(parameterKey("baseline-pii-protection", "brand_name")).toBe(
  "baseline-pii-protection::brand_name",
);
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm.cmd test --workspace @tasklattice/control -- src/features/guard-governance/guardrail-import/lib/template-composition.test.ts --reporter=dot
```

Expected: FAIL because the module and exports do not exist.

- [ ] **Step 3: Implement deterministic composition**

Sort a copy by template ID, use stable case-insensitive unions, serialize normalized Controls for uniqueness, and rank safety/delivery explicitly.

```ts
const safetyRank = { standard: 0, balanced: 1, strict: 2, maximum: 3 } as const;
const deliveryRank = {
  interruptible: 0,
  windowed: 1,
  window_buffered: 1,
  full_buffered: 2,
} as const;

export function parameterKey(templateId: string, parameterName: string) {
  return `${templateId}::${parameterName}`;
}
```

Build Purpose as detailed prose naming the combined templates and covering intended business use, approved data/actions, prohibited outcomes, and each template's protection responsibility.

- [ ] **Step 4: Run the Task 1 test and verify GREEN**

Expected: PASS with all composition assertions green.

- [ ] **Step 5: Commit**

```powershell
git add -- web/apps/control/src/features/guard-governance/guardrail-import/lib/template-composition.ts web/apps/control/src/features/guard-governance/guardrail-import/lib/template-composition.test.ts
git commit -m "feat: compose multiple Guard templates"
```

### Task 2: Multi-Template Model and Mock Persistence

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/model.ts`
- Modify: `web/apps/control/src/features/guard-governance/store.ts`
- Modify: `web/apps/control/src/features/guard-governance/fixtures.ts`
- Modify: `web/apps/control/src/features/guard-governance/guardrail-import/lib/contracts.ts`
- Modify: `web/apps/control/src/features/guard-governance/guardrail-import/lib/mock-api.tsx`
- Test: `web/apps/control/src/features/guard-governance/store.test.ts`
- Test: `web/apps/control/src/features/guard-governance/guardrail-import/lib/mock-api.test.tsx`

**Interfaces:**
- Internal `Guardrail.sourceTemplateIds: string[]` stores every source; `sourceTemplateId` remains a first-item compatibility field.
- Imported `Guardrail` exposes `source_template_ids: string[]` and first-item `source_template_id`.
- Imported `CreateGuardrailInput` accepts `template_ids?: string[]` and `template_parameters?: Record<string, Record<string, string>>`.
- Store creation accepts `sourceTemplateIds?: string[]` and nested template parameters.

- [ ] **Step 1: Add failing round-trip and validation tests**

```ts
const created = await api.createGuardrail({
  name: "Combined Protection",
  template_ids: [
    "baseline-pii-protection",
    "prompt-injection-protection",
  ],
  template_parameters: {
    "baseline-pii-protection": {},
    "prompt-injection-protection": {},
  },
});
expect(created.source_template_ids).toEqual([
  "baseline-pii-protection",
  "prompt-injection-protection",
]);
expect(created.source_template_id).toBe("baseline-pii-protection");
```

Also assert unknown IDs reject with the existing operation error and a one-item array preserves former behavior.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm.cmd test --workspace @tasklattice/control -- src/features/guard-governance/store.test.ts src/features/guard-governance/guardrail-import/lib/mock-api.test.tsx --reporter=dot
```

Expected: FAIL because the current contract accepts only `template_id`.

- [ ] **Step 3: Extend models and fixtures**

Define and use:

```ts
type TemplateParameterValues = Record<string, Record<string, string>>;

export type CreateGuardrailInput = {
  name: string;
  template_ids?: string[];
  template_parameters?: TemplateParameterValues;
  purpose?: string;
  allowed_topics?: string[];
  restricted_topics?: string[];
  controls?: GuardrailControl[];
  safety_level?: GuardrailSafetyLevel;
  output_delivery?: GuardrailOutputDelivery;
};
```

Normalize existing fixture single IDs into one-item arrays while retaining compatibility access.

- [ ] **Step 4: Update Mock creation and mapping**

Resolve every sorted, de-duplicated ID before creation. Compose template defaults, then allow explicit editable UI values to override them.

```ts
const templateIds = [...new Set(input.template_ids ?? [])].sort();
const templates = templateIds.map((id) => {
  const template = state.templates.find((item) => item.id === id);
  if (!template) throw new Error(`Unknown Guardrail template: ${id}`);
  return template;
});
const composed = composeTemplates(templates);
```

- [ ] **Step 5: Run the Task 2 tests and verify GREEN**

Expected: both focused files pass.

- [ ] **Step 6: Commit**

```powershell
git add -- web/apps/control/src/features/guard-governance/model.ts web/apps/control/src/features/guard-governance/store.ts web/apps/control/src/features/guard-governance/fixtures.ts web/apps/control/src/features/guard-governance/guardrail-import/lib/contracts.ts web/apps/control/src/features/guard-governance/guardrail-import/lib/mock-api.tsx web/apps/control/src/features/guard-governance/store.test.ts web/apps/control/src/features/guard-governance/guardrail-import/lib/mock-api.test.tsx
git commit -m "feat: persist multi-template Guardrails"
```

### Task 3: Multi-Select Wizard and Custom Intent Copy

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/guardrail-import/guardrails.tsx`
- Modify: `web/apps/control/src/features/guard-governance/guardrail-import/i18n.ts`
- Test: `web/apps/control/src/features/guard-governance/guardrail-import/guardrails-registry.test.tsx`

**Interfaces:**
- Consumes `composeTemplates()` and `parameterKey()` from Task 1.
- Submits Task 2's `template_ids` and nested `template_parameters`.
- Keeps the existing Mock `analyzeGuardrailIntent()` endpoint for custom intent.

- [ ] **Step 1: Write failing multi-select tests**

Select Advanced PII and Prompt Injection, assert both selection markers exist, Continue opens a Business Purpose containing both protection responsibilities, and Back preserves both selections.

```ts
await user.click(screen.getByRole("button", { name: /Advanced PII Protection/ }));
await user.click(screen.getByRole("button", { name: /Prompt Injection Protection/ }));
expect(screen.getAllByLabelText("Selected template")).toHaveLength(2);
await user.click(screen.getByRole("button", { name: "Continue" }));
expect(screen.getByLabelText("Business purpose")).toHaveValue(
  expect.stringContaining("Advanced PII Protection"),
);
expect(screen.getByLabelText("Business purpose")).toHaveValue(
  expect.stringContaining("Prompt Injection Protection"),
);
```

Add a template-parameter grouping assertion using a parameterized template.

- [ ] **Step 2: Write failing custom-intent tests**

Assert title `Customize Intent Create`, document-based description, no `input[type=file]`, a detailed default Purpose, and Mock Analyze filling non-empty Allowed and Restricted textareas.

- [ ] **Step 3: Run registry tests and verify RED**

```powershell
npm.cmd test --workspace @tasklattice/control -- src/features/guard-governance/guardrail-import/guardrails-registry.test.tsx --reporter=dot
```

Expected: FAIL because cards are single-select and old copy remains.

- [ ] **Step 4: Implement template toggle state**

Use `templateIds: string[]`, derive `selectedTemplates`, and toggle sorted IDs. Custom mode clears selections.

```ts
const toggleTemplate = (id: string) => {
  setMode("template");
  setTemplateIds((current) =>
    current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id].sort(),
  );
};
```

Add `aria-label="Selected template"` to selected card markers.

- [ ] **Step 5: Populate editable composed intent**

When leaving step 0 after the selected ID set changes, populate name, detailed Purpose, Allowed, Restricted, Controls, safety, and delivery from `composeTemplates()`. Do not overwrite user edits when navigating Back/Continue without changing selections. Group parameter fields by source template and bind nested values using `parameterKey()`.

- [ ] **Step 6: Implement custom copy and detailed Mock flow**

Change English and Chinese copy to `Customize Intent Create` and explain creation from the entered business-intent document without promising upload. Seed a detailed editable Purpose covering users, approved documents/data, permitted tasks, sensitive information, prohibited advice/actions, escalation, and audit expectations. Keep the current pending Mock analysis; success replaces Allowed/Restricted and shows summary/review notes without altering Purpose.

- [ ] **Step 7: Run registry tests and verify GREEN**

Expected: existing catalog/parameter tests plus new multi-select and custom-intent tests pass.

- [ ] **Step 8: Commit**

```powershell
git add -- web/apps/control/src/features/guard-governance/guardrail-import/guardrails.tsx web/apps/control/src/features/guard-governance/guardrail-import/i18n.ts web/apps/control/src/features/guard-governance/guardrail-import/guardrails-registry.test.tsx
git commit -m "feat: add multi-template Guardrail wizard"
```

### Task 4: Guardrail Detail Simplification

**Files:**
- Modify: `web/apps/control/src/features/guard-governance/guardrail-import/guardrails.tsx`
- Test: `web/apps/control/src/features/guard-governance/guardrail-import/guardrail-detail.test.tsx`

**Interfaces:**
- Keeps Runtime boundary and Intent, Controls, Test cases, and Versions tabs.
- Removes Decision posture from the default Guardrail.
- Keeps the approved removal of Assignment controls from detail while independent Assignment routes remain unchanged.

- [ ] **Step 1: Add the failing Decision posture assertion**

```ts
renderImported(
  <GuardrailDetailPage
    projectId="individual"
    guardrailId="guardrail-default"
  />,
);
expect(await screen.findByText("Runtime boundary")).not.toBeNull();
expect(screen.queryByText("Decision posture")).toBeNull();
```

Retain assertions for four tabs, no detail Assignment controls, and nested evidence.

- [ ] **Step 2: Run detail tests and verify RED**

```powershell
npm.cmd test --workspace @tasklattice/control -- src/features/guard-governance/guardrail-import/guardrail-detail.test.tsx --reporter=dot
```

Expected: FAIL because Decision posture still renders.

- [ ] **Step 3: Remove only Decision posture markup**

Delete the section headed by `t("guardrails.decisionPosture")`. Keep Runtime boundary immediately following it. Do not touch independent Assignment pages.

- [ ] **Step 4: Run detail tests and verify GREEN**

Expected: all detail behaviors pass.

- [ ] **Step 5: Commit only detail files**

```powershell
git add -- web/apps/control/src/features/guard-governance/guardrail-import/guardrails.tsx web/apps/control/src/features/guard-governance/guardrail-import/guardrail-detail.test.tsx
git commit -m "refactor: simplify Guardrail detail"
```

### Task 5: Integrated Verification and Browser QA

**Files:**
- Verify all Task 1-4 files.
- Do not modify or stage unrelated Behavior-page work during Guardrail verification.

**Interfaces:**
- Validates the combined flow and independent Assignment route regression.

- [ ] **Step 1: Run the Guard governance focused suite**

```powershell
npm.cmd test --workspace @tasklattice/control -- src/features/guard-governance/store.test.ts src/features/guard-governance/guardrail-import/source-fidelity.test.tsx src/features/guard-governance/guardrail-import/lib/template-composition.test.ts src/features/guard-governance/guardrail-import/lib/mock-api.test.tsx src/features/guard-governance/guardrail-import/provider.test.tsx src/features/guard-governance/guardrail-import/guardrails-registry.test.tsx src/features/guard-governance/guardrail-import/guardrail-detail.test.tsx src/features/guard-governance/guardrail-import/scope-regression.test.ts src/features/guard-governance/assignments/assignments-page.test.tsx src/routes/-guard-governance-routing.test.ts --reporter=dot
```

Expected: all listed files pass with zero failures.

- [ ] **Step 2: Run typecheck and production build**

```powershell
npm.cmd run typecheck --workspace @tasklattice/control
npm.cmd run build:control
```

Expected: both exit 0. If Nitro reports `EPERM` reading `C:\Users\95602`, rerun only the build with the established sandbox escalation.

- [ ] **Step 3: Verify in the local browser**

At `http://localhost:8080/individual/governance/guardrails`:

1. Select two templates and confirm both remain highlighted.
2. Continue and confirm combined editable Purpose, merged topics, and grouped parameters.
3. Continue and confirm de-duplicated Controls and conservative settings.
4. Go Back, choose Customize Intent Create, confirm revised copy and no upload.
5. Continue, click Analyze, and confirm Allowed/Restricted fill after pending state.
6. Open the default Guardrail and confirm Decision posture and detail Assignment controls are absent while Runtime boundary remains.
7. Open the independent Assignments route and confirm it still renders.

- [ ] **Step 4: Inspect diff and status**

```powershell
git diff --check
git status --short
git log -5 --oneline
```

Expected: no whitespace errors; only explicitly preserved unrelated changes remain unstaged.

- [ ] **Step 5: Commit verification fixes only when needed**

If verification required Guard governance fixes, stage only those files and commit:

```powershell
git commit -m "test: verify multi-template Guardrail creation"
```

If verification required no changes, do not create an empty commit.

