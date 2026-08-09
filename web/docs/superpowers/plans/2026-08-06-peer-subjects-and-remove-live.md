# Peer MCP/KB/Skill Evaluation Subjects on the Targets Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Evaluation Targets page only, make MCP servers, Knowledge Bases, and Skills first-class subjects at the same level as Agents (each independently evaluable, each with one visible sample fixture), and remove the live-status markers and jumping row reordering from that page. The Overview page and its live simulation are explicitly out of scope and must remain unchanged.

**Architecture:** Add `kind: "agent" | "mcp" | "kb" | "skill"` to the existing `EvaluationLayerTarget` and its revisions while keeping the run/report/trace pipeline keyed by `targetId`, so MCP/KB/Skill subjects reuse the same evaluate flow. Revision config becomes kind-specific (agent: model/prompt/tools; mcp: endpoint/exposed tools; kb: sources; skill: version/instructions). The live-simulation store machinery (`tickSimulation`, `startSimulation`, `stopSimulation`, `liveStatus`, `lastActivityAt`, `activity`) stays intact because Overview depends on it; the Targets page simply stops rendering those fields and stops sorting by `lastActivityAt` (which is what made rows jump).

**Tech Stack:** TypeScript, React 19, TanStack Router, Vite/Nitro dev server, Vitest, fixture validation (frontend-only demo).

## Global Constraints

- Frontend-only demo: no real model, tool, MCP, or KB calls. All scores are fixtures or deterministic mock generation.
- UI copy stays English; do not introduce Chinese strings.
- Keep the existing store command pattern (`CommandResult<T>`), dependency injection (`id/now/random`), and pure view-model builders.
- **Do not modify** `apps/control/src/features/evaluation-layer/overview/overview-page.tsx`, `.../shared/evaluation-ui.tsx`, `.../runs/run-pages.tsx`, `.../datasets/dataset-pages.tsx`, or `apps/control/src/styles.css`.
- Do not remove or rename `tickSimulation`, `startSimulation`, `stopSimulation`, `EvaluationLayerActivityEvent`, `state.activity`, `liveStatus`, or `lastActivityAt`. The Targets page may stop *using* them, but Overview still does.
- Do not touch the user's unrelated local modifications (`apps/control/package.json`, `apps/control/src/routeTree.gen.ts`, `apps/control/vite.config.ts`); commit only files this plan lists.
- Test command: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer`
- Typecheck command: `npm run typecheck --workspace @tasklattice/control`

---

## File Structure

- Modify `apps/control/src/features/evaluation-layer/model.ts` — add `kind` to targets/revisions; remove nested `mcpServers`/`knowledgeBases` binding; add `endpoint?`/`sources?`/`version?`; keep live fields and activity.
- Modify `apps/control/src/features/evaluation-layer/mock-store.ts` — kind in `CreateTargetInput`/`createTarget`/`createTargetRevision`; later kind-aware `resultForCase`; keep simulation.
- Modify `apps/control/src/features/evaluation-layer/fixture-validation.ts` + `fixture-validation.test.ts` — kind validation and assertions.
- Modify `apps/control/src/features/evaluation-layer/mock-store.test.ts` — drop legacy resource-binding assertions; kind tests.
- Modify `apps/control/src/features/evaluation-layer/fixtures.ts` — add `kind`; remove nested bindings from the agent fixture; add one sample each for MCP/KB/Skill subjects with revisions/datasets/runs/reports/traces/logs.
- Modify `apps/control/src/features/evaluation-layer/targets/target-pages.tsx` — kind filter/editor/detail; remove live columns, live badge, activity-based sorting; minimal compile-compatible edit in Task 1.

---

### Task 1: Typed subjects and kind plumbing

**Files:**
- Modify: `apps/control/src/features/evaluation-layer/model.ts`
- Modify: `apps/control/src/features/evaluation-layer/mock-store.ts`
- Modify: `apps/control/src/features/evaluation-layer/fixture-validation.ts`
- Modify: `apps/control/src/features/evaluation-layer/fixture-validation.test.ts`
- Modify: `apps/control/src/features/evaluation-layer/mock-store.test.ts`
- Modify: `apps/control/src/features/evaluation-layer/fixtures.ts`
- Modify: `apps/control/src/features/evaluation-layer/targets/target-pages.tsx` (compile-compatible edit only: stop passing `mcpServers`/`knowledgeBases` in the editor submit input)

**Interfaces:**
- Produces:
  - `export type EvaluationLayerTargetKind = "agent" | "mcp" | "kb" | "skill";`
  - `EvaluationLayerTarget` gains `kind: EvaluationLayerTargetKind` (keeps `liveStatus`, `lastActivityAt`).
  - `EvaluationLayerTargetRevision` gains `kind: EvaluationLayerTargetKind`; loses `mcpServers`/`knowledgeBases`; gains `endpoint?: string`, `sources?: EvaluationLayerResource[]`, `version?: string`; `model` and `prompt` become optional.
  - `CreateTargetInput` loses `mcpServers`/`knowledgeBases`; gains `kind?: EvaluationLayerTargetKind`; `createTarget` stores `kind: input.kind ?? "agent"` and passes it to the created revision; `createTargetRevision` carries the target's `kind` into the new revision.
  - `TargetRevisionInput` loses `mcpServers`/`knowledgeBases`.

- [ ] **Step 1: Write the failing tests**

Add to `fixture-validation.test.ts`:

```ts
it('requires every target and revision to declare a supported kind', () => {
  const state = cloneEvaluationLayerFixtures();
  for (const target of state.targets) {
    expect(['agent', 'mcp', 'kb', 'skill']).toContain(target.kind);
  }
  for (const revision of state.targetRevisions) {
    expect(['agent', 'mcp', 'kb', 'skill']).toContain(revision.kind);
  }
});

it('rejects targets whose revision kind does not match', () => {
  const state = cloneEvaluationLayerFixtures();
  state.targets[0]!.kind = 'kb';
  expect(validateEvaluationLayerState(state)).toContain(
    `targets.${state.targets[0]!.id}.kind: revision kind mismatch`,
  );
});
```

In `mock-store.test.ts`, replace the test `preserves the legacy Target configuration scope in mock revisions` with:

```ts
it('defaults a created target to the agent kind and stores agent scope', () => {
  let sequence = 0;
  const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
    id: () => `agent-target-${sequence++}`,
    now: () => '2026-08-05T10:00:00.000Z',
  });
  const tool = store.getState().targetRevisions[1]!.tools[0]!;

  const result = store.createTarget({
    name: 'Agent-compatible target',
    description: 'Model, prompt and tools',
    model: 'gpt-5-mini',
    prompt: 'Follow the permission policy.',
    tools: [tool],
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const target = store.getState().targets.find(
    (item) => item.id === result.value.targetId,
  )!;
  expect(target.kind).toBe('agent');
  const revision = store.getState().targetRevisions.at(-1)!;
  expect(revision.kind).toBe('agent');
  expect(revision.prompt).toBe('Follow the permission policy.');
  expect(revision.tools).toHaveLength(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer`
Expected: FAIL (fixtures and targets lack `kind`; `CreateTargetInput.kind` missing; old legacy test no longer typechecks after the model change is applied in Step 3).

- [ ] **Step 3: Implement**

In `model.ts`:

```ts
export type EvaluationLayerTargetKind = "agent" | "mcp" | "kb" | "skill";

export interface EvaluationLayerTarget {
  id: string;
  kind: EvaluationLayerTargetKind;
  name: string;
  description: string;
  icon?: string;
  currentRevisionId: string;
  liveStatus: "ONLINE" | "DEGRADED" | "OFFLINE";
  lastActivityAt: string;
  createdAt: string;
}

export interface EvaluationLayerTargetRevision {
  id: string;
  targetId: string;
  kind: EvaluationLayerTargetKind;
  revision: number;
  createdAt: string;
  model?: string;
  prompt?: string;
  endpoint?: string;
  sources?: EvaluationLayerResource[];
  version?: string;
  tools: EvaluationLayerTool[];
}
```

Remove `mcpServers?: EvaluationLayerResource[];` and `knowledgeBases?: EvaluationLayerResource[];` from the revision interface. Do not touch `EvaluationLayerActivityEvent` or `EvaluationLayerState.activity`.

In `mock-store.ts`:
- Remove `mcpServers` and `knowledgeBases` from `CreateTargetInput` and `TargetRevisionInput`.
- Add `kind?: EvaluationLayerTargetKind` to `CreateTargetInput`.
- In `createTarget`, store `kind: input.kind ?? "agent"` on the target and the created revision.
- In `createTargetRevision`, set the new revision's `kind` from the target's kind, and stop forwarding `mcpServers`/`knowledgeBases`.

In `fixture-validation.ts`, after the existing target revision checks add:

```ts
for (const target of state.targets) {
  if (!["agent", "mcp", "kb", "skill"].includes(target.kind)) {
    errors.push(`targets.${target.id}.kind: ${target.kind}`);
  }
  const revision = state.targetRevisions.find(
    (item) => item.id === target.currentRevisionId,
  );
  if (revision?.kind !== target.kind) {
    errors.push(`targets.${target.id}.kind: revision kind mismatch`);
  }
}
```

Keep the `activity` validation loop intact.

In `fixtures.ts`:
- Add `kind: "agent"` to both existing targets.
- Remove `mcpServers` and `knowledgeBases` from the `demo-permission-compliance-r2` revision.

In `target-pages.tsx` (compile-compatible edit only): in `TargetEditor.submit`, remove `mcpServers: selectedMcp` and `knowledgeBases: selectedKb` from the `input` object. Do not change anything else in this file (full rewrite lands in Task 4).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer`
Run: `npm run typecheck --workspace @tasklattice/control`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/control/src/features/evaluation-layer/model.ts apps/control/src/features/evaluation-layer/mock-store.ts apps/control/src/features/evaluation-layer/fixture-validation.ts apps/control/src/features/evaluation-layer/fixture-validation.test.ts apps/control/src/features/evaluation-layer/mock-store.test.ts apps/control/src/features/evaluation-layer/fixtures.ts apps/control/src/features/evaluation-layer/targets/target-pages.tsx
git commit -m "feat(evaluation): typed target kinds and kind plumbing"
```

---

### Task 2: MCP/KB/Skill sample fixtures as peer subjects

**Files:**
- Modify: `apps/control/src/features/evaluation-layer/fixtures.ts`

**Interfaces:**
- Consumes: Task 1 model (kinds on targets/revisions).
- Produces: `demo-operations-mcp`, `demo-policy-kb`, and `demo-document-summarization` targets with matching revisions, datasets, runs, reports, traces, and logs (referenced by Task 3 tests and Task 4 UI).

- [ ] **Step 1: Add the new subjects**

Add to `targets`:

```ts
{
  id: "demo-operations-mcp",
  kind: "mcp",
  name: "Operations MCP",
  description: "MCP server exposing read-only operational tools.",
  icon: "plug",
  currentRevisionId: "demo-operations-mcp-r1",
  liveStatus: "ONLINE",
  lastActivityAt: "2026-07-30T12:00:00.000Z",
  createdAt: "2026-07-29T09:30:00.000Z",
},
{
  id: "demo-policy-kb",
  kind: "kb",
  name: "Permission Policy KB",
  description: "Approved permission policies used to ground agent answers.",
  icon: "database",
  currentRevisionId: "demo-policy-kb-r1",
  liveStatus: "ONLINE",
  lastActivityAt: "2026-07-30T12:00:00.000Z",
  createdAt: "2026-07-29T09:30:00.000Z",
},
{
  id: "demo-document-summarization",
  kind: "skill",
  name: "Document Summarization",
  description: "Summarize HR documents and reports with a fixed instruction contract.",
  icon: "sparkles",
  currentRevisionId: "demo-document-summarization-r1",
  liveStatus: "ONLINE",
  lastActivityAt: "2026-07-30T12:00:00.000Z",
  createdAt: "2026-07-29T09:30:00.000Z",
},
```

Add revisions:

```ts
{
  id: "demo-operations-mcp-r1",
  targetId: "demo-operations-mcp",
  kind: "mcp",
  revision: 1,
  endpoint: "http://localhost:3001/mcp",
  tools: [
    { id: "ops-list", name: "OpsList", description: "List operational resources.", connectionType: "http", verificationRequired: false, enabled: true, tags: ["read-only"] },
  ],
  createdAt: "2026-07-29T09:30:00.000Z",
},
{
  id: "demo-policy-kb-r1",
  targetId: "demo-policy-kb",
  kind: "kb",
  revision: 1,
  sources: [{ id: "policy-kb", name: "Permission Policy KB" }],
  tools: [],
  createdAt: "2026-07-29T09:30:00.000Z",
},
{
  id: "demo-document-summarization-r1",
  targetId: "demo-document-summarization",
  kind: "skill",
  revision: 1,
  version: "2.0.1",
  prompt: "Summarize the document into decisions, risks, and follow-up actions.",
  tools: [],
  createdAt: "2026-07-29T09:30:00.000Z",
},
```

- [ ] **Step 2: Add datasets, runs, reports, traces, and logs**

Add one dataset per subject (MCP/KB/Skill) with a published revision containing 2 cases each (cases follow the existing `permissionCases()` shape; MCP cases use `expected_tool_called: "OpsList"`; KB and Skill cases use plain `input`/`expectedOutput` without `expected_tool_called`). Add one `COMPLETED` run per subject (`evaluatorIds: ["permission-compliance"]`), one `READY` report per run, one PASS trace per run following the `demo-weather-guest-allow` shape (MCP: `response: "MCP tool executed and returned the expected operational result."`, `deterministicScores: { tool_requested: 1, tool_executed: 1, tool_succeeded: 1, effect_verified: 0 }`; KB: `response: "Policy retrieved from the Knowledge Base and grounded the answer."`, `deterministicScores: { retrieval_hit: 1, grounding: 1 }`; Skill: `response: "Skill instructions applied and produced the expected output."`, `deterministicScores: { instruction_compliance: 1, output_format: 1 }`), and matching log entries with `traceId`.

- [ ] **Step 3: Run the tests**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer`
Expected: PASS (fixture validation covers the new subjects).

- [ ] **Step 4: Commit**

```bash
git add apps/control/src/features/evaluation-layer/fixtures.ts
git commit -m "feat(evaluation): fixture MCP, KB, and Skill evaluation subjects"
```

---

### Task 3: Kind-aware scenario generation in the store

**Files:**
- Modify: `apps/control/src/features/evaluation-layer/mock-store.ts`
- Test: `apps/control/src/features/evaluation-layer/mock-store.test.ts`

**Interfaces:**
- Consumes: Task 1 model, Task 2 fixtures.
- Produces: `resultForCase` produces kind-specific `response`, `deterministicScores`, `deterministicReasons`, `toolEvidence`, and `spans`.

- [ ] **Step 1: Write failing tests**

Add to `mock-store.test.ts`:

```ts
it('generates mcp scenario traces with tool evidence', () => {
  const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
  const run = store.getState().runs.find((item) => item.targetId === 'demo-operations-mcp')!;
  const result = store.advanceRun(run.id);
  expect(result.ok).toBe(true);
  const trace = store.getState().traces.find((item) => item.runId === run.id)!;
  expect(trace.toolEvidence.length).toBeGreaterThan(0);
  expect(trace.deterministicScores.tool_requested).toBe(1);
});

it('generates kb scenario traces with grounded response', () => {
  const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
  const run = store.getState().runs.find((item) => item.targetId === 'demo-policy-kb')!;
  const result = store.advanceRun(run.id);
  expect(result.ok).toBe(true);
  const trace = store.getState().traces.find((item) => item.runId === run.id)!;
  expect(trace.response).toContain('retrieved');
});

it('generates skill scenario traces with instruction compliance scores', () => {
  const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
  const run = store.getState().runs.find((item) => item.targetId === 'demo-document-summarization')!;
  const result = store.advanceRun(run.id);
  expect(result.ok).toBe(true);
  const trace = store.getState().traces.find((item) => item.runId === run.id)!;
  expect(trace.deterministicScores.instruction_compliance).toBe(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer/mock-store.test.ts`
Expected: FAIL (advancing a completed fixture run returns `complete: true` and never calls `resultForCase` for these runs, so no new trace exists). If the fixture runs are `COMPLETED`, `advanceRun` short-circuits; the implementer must instead create a fresh run for each subject in the test via `createTargetRevision`/`createDataset`/`createRun`, or the fixtures' runs must be `RUNNING` with `PENDING` results so `advanceRun` generates the trace. Choose the latter (fixtures already carry the completed run; add a `RUNNING` run per subject for the test).

Note for the implementer: if fixture runs are `COMPLETED`, `advanceRun` returns `{ complete: true }` without generating. To keep Task 2 fixtures as completed demos AND make these tests meaningful, add one extra `RUNNING` run per new subject in Task 2 fixtures with all-PENDING results, or update the tests to create a run through the store API. Pick whichever keeps the full suite green; record the choice in the report.

- [ ] **Step 3: Implement**

In `mock-store.ts` `resultForCase`, branch on the revision kind:

```ts
const kind = revision?.kind ?? "agent";
const failed = datasetCase.id.includes("bypass");
let response: string;
let deterministicScores: Record<string, number>;
let deterministicReasons: Record<string, string>;
let toolEvidence: EvaluationLayerToolEvidence[];
let spans: EvaluationLayerSpan[];

if (kind === "mcp") {
  response = failed
    ? "MCP tool executed despite a DENY decision (fail-open)."
    : "MCP tool executed and returned the expected operational result.";
  deterministicScores = {
    tool_requested: 1,
    tool_executed: failed ? 0 : 1,
    tool_succeeded: 1,
    effect_verified: 0,
  };
  deterministicReasons = failed
    ? { tool_executed: "MCP tool executed despite a DENY decision." }
    : {};
  toolEvidence = tool
    ? [{
        id: dependencies.id(), toolId: tool.id, requested: true, executed: !failed,
        succeeded: true, effectVerified: null, verificationRequired: tool.verificationRequired,
        requestedArguments: structuredClone(datasetCase.input),
        executedArguments: structuredClone(datasetCase.input),
        output: { result: response }, error: null, traceId, observationId: null,
        startedAt: now, endedAt: now, latencyMs: failed ? 120 : 80, receipt: null,
      }]
    : [];
  spans = [{ id: dependencies.id(), name: datasetCase.id, kind: "TRACE", status: "OK", startedAt: now, endedAt: now, output: { response } }];
} else if (kind === "kb") {
  response = failed
    ? "KB retrieval missed the expected source (fail-open)."
    : "Policy retrieved from the Knowledge Base and grounded the answer.";
  deterministicScores = { retrieval_hit: failed ? 0 : 1, grounding: failed ? 0 : 1 };
  deterministicReasons = failed ? { retrieval_hit: "Expected source was not retrieved." } : {};
  toolEvidence = [];
  spans = [{ id: dependencies.id(), name: datasetCase.id, kind: "TRACE", status: "OK", startedAt: now, endedAt: now, output: { response } }];
} else if (kind === "skill") {
  response = failed
    ? "Skill instructions were not applied (fail-open)."
    : "Skill instructions applied and produced the expected output.";
  deterministicScores = { instruction_compliance: failed ? 0 : 1, output_format: failed ? 0 : 1 };
  deterministicReasons = failed ? { instruction_compliance: "Expected skill behavior was not observed." } : {};
  toolEvidence = [];
  spans = [{ id: dependencies.id(), name: datasetCase.id, kind: "TRACE", status: "OK", startedAt: now, endedAt: now, output: { response } }];
} else {
  response = failed
    ? "Guardrail bypass (fail-open): DENY was decided, but the tool executed and leaked data."
    : "Permission decision enforced: tool behavior matched expectations.";
  deterministicScores = { permission_compliance: failed ? 0 : 1, execution_correctness: 1 };
  deterministicReasons = failed
    ? { permission_compliance: "GUARDRAIL_BYPASSED (fail-open): tool executed despite a DENY decision." }
    : {};
  toolEvidence = tool
    ? [{
        id: dependencies.id(), toolId: tool.id, requested: true, executed: true, succeeded: true,
        effectVerified: tool.verificationRequired ? true : null,
        verificationRequired: tool.verificationRequired,
        requestedArguments: structuredClone(datasetCase.input),
        executedArguments: structuredClone(datasetCase.input),
        output: { result: response }, error: null, traceId, observationId: null,
        startedAt: now, endedAt: now, latencyMs: failed ? 120 : 80,
        receipt: tool.verificationRequired ? { verified: true } : null,
      }]
    : [];
  spans = [{ id: dependencies.id(), name: datasetCase.id, kind: "TRACE", status: "OK", startedAt: now, endedAt: now, input: structuredClone(datasetCase.input), output: { response } }];
}
```

Replace the existing hardcoded `response`/`deterministicScores`/`deterministicReasons`/`toolEvidence`/`spans` assignments in `resultForCase` with the branches above. Keep the existing `judge` and `usageCosts` blocks unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/control/src/features/evaluation-layer/mock-store.ts apps/control/src/features/evaluation-layer/mock-store.test.ts apps/control/src/features/evaluation-layer/fixtures.ts
git commit -m "feat(evaluation): kind-aware evaluation scenario generation"
```

---

### Task 4: Targets page — peer subjects, no live markers, no jumping rows

**Files:**
- Modify: `apps/control/src/features/evaluation-layer/targets/target-pages.tsx`

**Interfaces:**
- Consumes: Task 1 model, Task 2 fixtures, Task 3 store.

- [ ] **Step 1: Remove live markers and jumping sort from the list**

- Delete `LIVE_STATUS_STYLE`, `LiveStatusBadge`, the `Live monitoring` badge span, and the `Live` and `Last activity` table columns.
- Replace the `lastActivityAt` sort with a stable `name` sort:

```ts
const sortedRows = useMemo(
  () => [...rows].sort((a, b) => a.name.localeCompare(b.name)),
  [rows],
);
```

- Add a `Kind` column rendering `Agent` / `MCP` / `KB` / `Skill` from `target.kind`.

- [ ] **Step 2: Kind filter and editor**

Replace `targetFilters` with:

```ts
const targetFilters = ['All targets', 'Agents', 'MCP servers', 'Knowledge bases', 'Skills'] as const;
```

Filter by `target.kind`. In `TargetEditor`, add a `kind` select (visible when creating): `Agent` / `MCP server` / `Knowledge base` / `Skill`, default `agent`. Show kind-specific fields:
- agent: Model + System prompt + Tools picker (existing).
- mcp: Endpoint input + Tools picker.
- kb: Sources picker from a `kbCatalog` list of `EvaluationLayerResource`.
- skill: Version input + Instructions (prompt) textarea.

Pass `kind` into `createTarget`. Remove the MCP servers / Knowledge bases pickers from the agent form. Remove the now-unused `mcpCatalog` picker for agent revisions (MCP/KB are subjects, not agent bindings).

- [ ] **Step 3: Detail page per kind**

- Render tabs by `target.kind`: agent -> `Tools`; mcp -> `Endpoint` (KeyValueGrid) + `Exposed tools`; kb -> `Sources` (resource table); skill -> `Version` + `Instructions` (KeyValueGrid).
- Replace `configurationSummary` with:

```ts
function configurationSummary(revision: EvaluationLayerTargetRevision) {
  if (revision.kind === 'skill') {
    return `v${revision.version ?? '?'}${revision.prompt?.trim() ? ' · Instructions' : ''}`;
  }
  if (revision.kind === 'mcp') {
    return `${revision.tools.length} exposed tool${revision.tools.length === 1 ? '' : 's'} · ${revision.endpoint ?? 'no endpoint'}`;
  }
  if (revision.kind === 'kb') {
    return `${revision.sources?.length ?? 0} source${(revision.sources?.length ?? 0) === 1 ? '' : 's'}`;
  }
  const parts = ['Model'];
  if (revision.prompt?.trim()) parts.push('Prompt');
  if (revision.tools.length) parts.push(`${revision.tools.length} Tools`);
  return parts.join(' · ');
}
```

- Keep the `Evaluate` button and report/trend sections unchanged (kind-agnostic via `targetId`).

- [ ] **Step 4: Verify**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer`
Run: `npm run typecheck --workspace @tasklattice/control`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/control/src/features/evaluation-layer/targets/target-pages.tsx
git commit -m "feat(evaluation): peer MCP/KB/Skill targets without live markers"
```

---

### Task 5: Final verification

**Files:**
- No code changes expected; verify.

- [ ] **Step 1: Confirm Overview untouched**

Run: `git diff --stat -- apps/control/src/features/evaluation-layer/overview apps/control/src/features/evaluation-layer/shared apps/control/src/styles.css apps/control/src/features/evaluation-layer/runs apps/control/src/features/evaluation-layer/datasets`
Expected: no output (those paths unmodified).

- [ ] **Step 2: Run the full evaluation test suite**

Run: `npm test --workspace @tasklattice/control -- --run src/features/evaluation-layer`
Expected: all tests pass.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @tasklattice/control`
Expected: PASS.

- [ ] **Step 4: Manual browser check (dev server on 127.0.0.1:18082)**

Visit `/individual/evaluation/targets`:
- Agents, MCP servers, Knowledge bases, and Skills appear as peers with a Kind column; the sample fixtures `Operations MCP`, `Permission Policy KB`, and `Document Summarization` are visible immediately.
- No Live / Last activity columns, no "Live monitoring" badge, no pulsing dots, and rows no longer reorder on their own.
- Creating an MCP, KB, or Skill target works; its detail page shows Endpoint/Sources/Version+Instructions and an `Evaluate` button that produces a run and report.
- Visit `/individual/evaluation/overview`: unchanged (Live indicator, flashing, and simulated traces still behave as before).

Hard-refresh each page (`Ctrl+F5`) if needed.

- [ ] **Step 5: Commit any incidental fixes**

```bash
git add -A apps/control/src/features/evaluation-layer
git commit -m "chore(evaluation): finalize peer MCP/KB/Skill targets"
```

---

## Self-Review

1. **Spec coverage:** MCP/KB/Skill as peers on the Targets page with one visible sample each (Tasks 1-4), each evaluable (Tasks 2-3), live markers and jumping removed from that page only (Task 4), Overview unchanged (Global Constraints + Task 5). No gaps.
2. **Placeholder scan:** No TBD/TODO; every step has concrete code or an exact verification command.
3. **Type consistency:** `EvaluationLayerTargetKind`, `kind` on target and revision, `endpoint`/`sources`/`version` optional fields, `CreateTargetInput.kind` default `"agent"`, and `resultForCase` branches are used consistently across Tasks 1-4.
4. **Task independence:** Task 1 adds `kind` to existing fixtures and updates the legacy test, so the suite is green at each task boundary; Task 2 adds subjects before Task 3's store tests reference them.
