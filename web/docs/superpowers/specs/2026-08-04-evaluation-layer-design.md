# Evaluation Layer Design

## Objective

Add a new project-scoped sidebar layer named `Evaluation` to TaskLattice. The
layer must reproduce the current AgentEval information architecture, component
composition, workflows, and interactions while using TaskLattice's existing
visual tokens and shared UI primitives. All records, transitions, integrations,
and settings behavior are frontend-only mock behavior.

This layer is additive. Existing TaskLattice features, including the `Observer`
group and its `Traces`, `Evaluations`, and `Cost` pages, must remain unchanged.

## Source Snapshot

The parity target is the local AgentEval repository at commit `a78031f` on
branch `codex/dataset-generation-ui`, including the latest trace-analysis work
from commits `2e6bc07` and `e446dc1`.

The source navigation order is authoritative:

1. `Target`
2. `Dataset`
3. `Evaluation`
4. `Overview`
5. `Trace`
6. `Settings`

Later AgentEval source changes are not automatically in scope. They require a
new comparison before being applied to this layer.

## Isolation Boundary

The new layer has its own route namespace, feature directory, provider, typed
model, fixtures, selectors, commands, and tests. It may import TaskLattice's
shared visual primitives, icons, typography, layout helpers, and utility
functions, but it must not import business components or mutable state from the
existing `features/evaluations` or `features/traces` modules.

The existing modules must not be moved, renamed, or behaviorally changed as
part of this work. Deliberate duplication inside the new feature boundary is
acceptable because later copy and product-language changes must be isolated to
the new layer.

## Information Architecture

Add an `Evaluation` sidebar group at the same level as `Agentic`, `Security`,
and `Observer`. Its six entries follow the AgentEval order exactly:

```text
Evaluation
  Target
  Dataset
  Evaluation
  Overview
  Trace
  Settings
```

The route hierarchy is independent of the existing plural `/evaluations`
namespace:

```text
/$projectId/evaluation/targets
/$projectId/evaluation/targets/$targetId
/$projectId/evaluation/datasets
/$projectId/evaluation/datasets/$datasetId
/$projectId/evaluation/runs
/$projectId/evaluation/runs/new
/$projectId/evaluation/runs/$runId
/$projectId/evaluation/reports/$reportId
/$projectId/evaluation/overview
/$projectId/evaluation/traces
/$projectId/evaluation/traces/$traceId
/$projectId/evaluation/settings
```

Selecting the group itself is not an action; each child is a normal sidebar
link. `Target` is the default landing destination when the layer needs a root
redirect. Breadcrumb labels use the visible AgentEval names.

## UI Parity Rule

The information presentation must match AgentEval's current UI one-for-one.
Every source section, list, detail surface, metric, form, dialog, local tab,
action, empty state, error state, and transition has a corresponding React
surface in the new layer. Displayed data formats, field names, field order,
column order, section order, control placement, panel placement, and the
relative layout of information remain the same as AgentEval during the first
migration.

Visual rendering uses TaskLattice's current application shell and design
system:

- TaskLattice sidebar, header, breadcrumbs, spacing scale, typography, colors,
  borders, shadows, responsive behavior, and dark mode;
- existing TaskLattice `Button`, `Card`, `Badge`, `Tabs`, `Table`, `Sheet`,
  `Dialog`, form controls, toast, and empty-state patterns;
- no Streamlit-specific layout, styling, Material icon syntax, or injected CSS;
- no new parallel design system and no copied Streamlit markup.

This means data-format, placement, structural, and behavioral parity with
AgentEval, with a TaskLattice visual skin. A metric remains in the same logical
position and uses the same value format, but it is rendered with TaskLattice's
metric/card treatment. A source table keeps the same columns and ordering, but
uses TaskLattice's table styling. Source dialogs and tabs keep their content and
placement semantics while using TaskLattice sheets, dialogs, and tabs. Initial
labels and explanatory copy stay aligned with AgentEval so later wording
changes can be reviewed separately.

## Page Coverage

### Target

Reproduce the Target list, selection context, detail view, quality and cost
summary, revision history, model configuration, Tool bindings, MCP bindings,
knowledge references, creation flow, and revision-editing flow. Revisions are
immutable mock records; editing creates a new revision while retaining history.

### Dataset

Reproduce Dataset list, create flow, Target scoping, draft cases, schema,
evaluation history, case editor, duplication, deletion, JSON import, mock
generation, review, and publish flow. Dataset-local navigation and action
availability match AgentEval. Publishing creates a new immutable mock revision.

### Evaluation

Reproduce the combined Evaluation run and Report workspace. It includes run
history, new-Evaluation dialog, locked Target and Dataset revision context,
evaluator source selection, evaluator selection, judge model display, progress,
per-case status, Report navigation, comparison, cost, evidence, and Reflection.

The Langfuse and built-in evaluator choices are fixture-backed UI only. Starting
or advancing a run never executes an Agent, model, evaluator, or network call.

### Overview

Reproduce Target-scoped operational metrics for traces, observations, failures,
and cost, including populated and empty states. Metrics are derived from the
new layer's fixture graph and react to mock run transitions.

### Trace

Reproduce the trace list and trace-detail experience, including selection,
status, metrics, span hierarchy, waterfall timing, span detail, input, output,
metadata, usage, cost, Tool evidence, judge evidence, deterministic scores,
mark-fail state, and close/back behavior.

The latest `Analysis` surface is required. It shows span count, error count,
Tool-call count, judge score, deterministic findings, and conservative
evidence-backed recommended changes. Recommendations are derived locally from
failed deterministic checks, Tool evidence, judge dimensions, error spans, and
empty responses. Clean traces show that no evidence-backed change is required.

### Settings

Reproduce AgentEval's settings status, editable connection fields, test action,
save action, validation, success feedback, and failure feedback. Values are
mock configuration held by the new provider. Test and save actions must not
read or write environment files, secrets, server configuration, or browser
storage.

## Component and File Boundaries

The feature lives under `apps/control/src/features/evaluation-layer`:

- `model.ts`: domain records, route-facing view types, and status unions;
- `fixtures.ts`: the complete initial Target-to-Trace graph and settings state;
- `mock-store.ts`: pure state transitions and typed command results;
- `mock-provider.tsx`: project-scoped React context and selectors;
- `scenario-engine.ts`: deterministic run, Report, trace, and recommendation
  generation;
- `shared/*`: feature-only page frames, metrics, status presentation, and empty
  states when no existing shared TaskLattice primitive fits;
- `targets/*`, `datasets/*`, `runs/*`, `overview/*`, `traces/*`, and
  `settings/*`: focused page and interaction components matching AgentEval;
- route files under `apps/control/src/routes/$projectId/evaluation/*`: thin
  parameter parsing and component mounting only.

No feature file should own unrelated pages. Large source screens are split by
stable UI responsibility so later copy, layout, or mock-scenario changes remain
local.

## Mock Data and Interaction Model

`fixtures.ts` is the single editing surface for initial demo data. It contains
a coherent graph of Targets, Target revisions, Tool bindings, Datasets, Dataset
revisions, Cases, evaluator definitions, Runs, Reports, Reflection suggestions,
traces, spans, evidence, costs, and settings.

The provider deep-clones fixtures once per mounted project context. It exposes
typed selectors and explicit commands rather than fixture arrays. Required
commands cover:

```text
createTarget
createTargetRevision
createDataset
updateDatasetDraft
createCase
updateCase
duplicateCase
deleteCase
importCases
generateCases
publishDatasetRevision
createRun
advanceRun
openReport
submitReflection
finishReflectionWithoutChanges
markTraceFailed
testSettingsConnection
saveSettings
resetDemo
```

All state is memory-only. Refreshing restores checked-in fixtures. No API,
database, Prisma model, server route, websocket, model provider, Langfuse
service, tool, MCP server, filesystem setting, `localStorage`, or
`sessionStorage` participates in the feature.

The scenario engine accepts injectable ID and clock functions. Default fixtures
produce deterministic success, failure, blocked, missing-evidence, evaluator,
trace-error, cost, regression, clean-analysis, and recommendation states.

## Navigation and State Behavior

All six sidebar routes share the new provider, so mock mutations remain visible
while navigating within the project. Direct detail URLs resolve from fixture or
in-memory records. Unknown IDs render a feature-local not-found state with a
safe return link.

Changing pages resets only transient selections belonging to the new layer.
`Reset demo` appears only inside the new layer and requires confirmation. It
restores the fixture graph without touching TaskLattice records or other mock
features.

## Error and Empty States

The UI explicitly handles empty Target, Dataset, Run, Report, trace, evaluator,
and recommendation collections; invalid imports; duplicate case inputs;
missing published revisions; incompatible selections; unavailable optional
evidence; mock connection failures; invalid direct URLs; and future Evaluation
stages.

Expected user errors return typed results and render inline feedback or
TaskLattice toasts. Unexpected rendering errors stay inside the new feature
boundary so the application shell and original pages remain usable.

## Testing Strategy

Implementation follows test-driven development.

1. Navigation tests verify the new `Evaluation` group, exact item order, active
   states, default redirect, and isolation from the existing `Observer` group.
2. Store tests cover every command, immutable revision behavior, reset scope,
   invalid references, and fixture restoration.
3. Scenario tests cover run progress, evaluator selection, Report generation,
   costs, comparisons, Reflection, traces, and analysis recommendations.
4. Component tests cover AgentEval section parity, forms, dialogs, local tabs,
   tables, action enablement, empty states, and visible feedback.
5. Route tests cover all list, create, detail, Report, trace, settings, and
   invalid-ID paths.
6. Browser smoke validation walks Target -> Dataset -> Evaluation -> Report ->
   Reflection and Overview -> Trace -> Analysis, then verifies Settings mock
   test/save behavior.
7. Regression checks verify the original Observer routes and behaviors are
   unchanged.
8. Repository validation runs focused tests, the full control test suite,
   typecheck, and production build.

## Acceptance Criteria

- A sidebar group named `Evaluation` appears alongside `Agentic`, `Security`,
  and `Observer`.
- Its children are exactly `Target`, `Dataset`, `Evaluation`, `Overview`,
  `Trace`, and `Settings`, in that order.
- Every current AgentEval UI section and interaction has a corresponding surface
  in the new layer.
- Displayed data formats, field and column ordering, section placement, control
  placement, and behavior match AgentEval.
- Concrete component styling, including typography, color, spacing, borders,
  controls, tables, cards, tabs, sheets, and dialogs, matches TaskLattice.
- The latest Trace Analysis UI and evidence-backed recommendations are present.
- The complete Target-to-Reflection and Overview-to-Trace flows work using only
  deterministic frontend mock state.
- Refresh restores source fixtures and no mock state is shared across users.
- The new layer issues no backend or third-party requests and writes no browser
  storage.
- Existing TaskLattice sidebar groups, routes, data, and behavior remain
  unchanged.
- Focused tests, the full control suite, typecheck, and production build pass.

## Explicit Non-Goals

- Renaming or rewriting AgentEval copy during the initial migration.
- Replacing or redirecting the existing Observer pages.
- Sharing state or business components with the existing Evaluations mock UI.
- Persisting Evaluation-layer records across refreshes or users.
- Implementing real authentication changes, databases, APIs, queues, Agents,
  evaluators, LLMs, Langfuse integrations, Tools, MCP calls, or settings writes.
- Refactoring unrelated TaskLattice features while adding the new layer.
