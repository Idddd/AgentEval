# Onboarding Assistant Icon Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the existing cyan `UserPlus` identity icon for Onboarding Assistant in every Evaluation Catalog surface while preserving the shared icon behavior already used by Overview, Trace, and Target pages.

**Architecture:** Extend Catalog's local target mark to delegate Agent rendering to the existing `AgentGardenIcon`, passing each target's fixture `icon`. Keep `KIND_META` rendering for non-Agent targets so their current visuals remain unchanged. Protect each Catalog view and workspace header with DOM-level icon assertions.

**Tech Stack:** React, TypeScript, Lucide React, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Use existing `icon: "user-plus"`; do not create or reference an image asset.
- Preserve existing cyan `UserPlus` styling from `AgentGardenIcon`.
- Preserve all Evaluation mock data, workflows, permissions, and non-Agent icons.
- Do not add API, database, upload, or asset-management behavior.

---

### Task 1: Prove the Shared UserPlus Mapping

**Files:**
- Modify: `web/apps/control/src/components/agent-garden/agent-garden-icon.test.tsx`

**Interfaces:**
- Consumes: `AgentGardenIcon({ type: "custom", catalogIcon: "user-plus" })`
- Produces: a test contract that the rendered SVG has Lucide's `lucide-user-plus` identity class and the existing cyan accent classes

- [ ] **Step 1: Strengthen the existing component test**

Add the exact assertion below after rendering:

```tsx
expect(container.querySelector('.lucide-user-plus')).not.toBeNull();
expect(container.firstElementChild?.className).toContain('bg-cyan');
expect(container.querySelector('svg')?.className.baseVal).toContain('text-cyan');
```

- [ ] **Step 2: Run the focused component test**

Run: `npm.cmd test -- apps/control/src/components/agent-garden/agent-garden-icon.test.tsx`

Expected: PASS, confirming the existing shared component already owns the required visual mapping.

- [ ] **Step 3: Commit the test contract**

```bash
git add web/apps/control/src/components/agent-garden/agent-garden-icon.test.tsx
git commit -m "test: lock Onboarding Assistant icon identity"
```

### Task 2: Use Target Identity Icons Throughout Catalog

**Files:**
- Modify: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx`
- Modify: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.tsx`

**Interfaces:**
- Consumes: `WorkspaceRow.target.kind`, `WorkspaceRow.target.icon`, `AgentGardenIcon`
- Produces: `KindMark({ kind, catalogIcon, size })`, which uses `AgentGardenIcon` for Agents and existing `KIND_META` icons for every other Target kind

- [ ] **Step 1: Add failing Catalog identity tests**

Add a helper and assertions that locate Onboarding Assistant in each view:

```tsx
function expectUserPlusIcon(element: HTMLElement) {
  expect(element.querySelector('.lucide-user-plus')).not.toBeNull();
}

const onboardingLifecycle = screen.getByRole('button', {
  name: 'Onboarding Assistant demo-onboarding-assistant',
});
expectUserPlusIcon(onboardingLifecycle);
```

Switch to Cards and List with the existing view controls, locate the Onboarding Assistant card or row by its text, and call `expectUserPlusIcon` on the closest clickable container. Open the target and assert the `Onboarding Assistant` dialog header also contains `.lucide-user-plus`. Cover the full-page workspace header if that render branch is exercised separately by the existing route-state tests.

- [ ] **Step 2: Run the focused Catalog test and verify RED**

Run: `npm.cmd test -- apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx`

Expected: FAIL because Catalog still renders `.lucide-bot` through `KindMark`.

- [ ] **Step 3: Implement Agent-aware `KindMark`**

Import `AgentGardenIcon` and extend the local component:

```tsx
function KindMark({
  kind,
  catalogIcon,
  size = 'default',
}: {
  kind: EvaluationLayerTargetKind;
  catalogIcon?: string;
  size?: 'default' | 'large';
}) {
  if (kind === 'agent') {
    return (
      <AgentGardenIcon
        type='custom'
        catalogIcon={catalogIcon}
        className={size === 'large' ? 'size-12 rounded-lg' : 'size-10 rounded-lg'}
        iconClassName={size === 'large' ? 'size-6' : 'size-5'}
      />
    );
  }

  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-lg border', size === 'large' ? 'size-12' : 'size-10', meta.className)}>
      <Icon className={size === 'large' ? 'size-6' : 'size-5'} />
    </span>
  );
}
```

At every Catalog call site, pass the target identity:

```tsx
<KindMark kind={row.target.kind} catalogIcon={row.target.icon} />
<KindMark kind={row.target.kind} catalogIcon={row.target.icon} size='large' />
```

Apply this to Cards, List, Lifecycle, the drawer header, and the full-page workspace header.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm.cmd test -- apps/control/src/components/agent-garden/agent-garden-icon.test.tsx apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx
```

Expected: both files PASS.

- [ ] **Step 5: Commit the Catalog change**

```bash
git add web/apps/control/src/features/evaluation-layer/catalog/catalog-page.tsx web/apps/control/src/features/evaluation-layer/catalog/catalog-page.test.tsx
git commit -m "feat: unify Onboarding Assistant icon"
```

### Task 3: Regression and Browser Verification

**Files:**
- Verify: `web/apps/control/src/features/evaluation-layer/catalog/catalog-page.tsx`
- Verify: `web/apps/control/src/features/evaluation-layer/overview/overview-page.tsx`
- Verify: `web/apps/control/src/features/evaluation-layer/traces/trace-pages.tsx`
- Verify: `web/apps/control/src/features/evaluation-layer/targets/target-pages.tsx`

**Interfaces:**
- Verifies all Evaluation identity surfaces consume the same fixture `target.icon`

- [ ] **Step 1: Run the full Control test suite**

Run: `npm.cmd test`

Expected: all test files PASS.

- [ ] **Step 2: Run TypeScript validation**

Run: `npm.cmd run typecheck`

Expected: all workspace typechecks PASS with no TypeScript errors.

- [ ] **Step 3: Validate in the local browser**

Reload Catalog, inspect Lifecycle, Cards, List, and the Onboarding Assistant drawer, then inspect Overview and Trace. Confirm every Onboarding Assistant identity marker uses the cyan `UserPlus`, while other Target icons remain unchanged and no layout overflows.

- [ ] **Step 4: Commit any verification-only corrections**

If browser verification reveals a scoped visual issue, add a failing regression test, apply the minimal correction, rerun focused and full checks, and commit with:

```bash
git add web/apps/control/src/features/evaluation-layer
git commit -m "fix: preserve Evaluation icon layout"
```
