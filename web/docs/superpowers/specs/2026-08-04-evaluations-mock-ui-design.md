# Evaluations Mock UI Design

## Objective

Add the latest AgentEval product flow to TaskLattice as a project-scoped,
frontend-only `Evaluations` module. The module must use TaskLattice's existing
visual language and component library, cover the complete Target-to-Reflection
workflow, and remain fast to iterate by keeping all demo content in typed,
centralized fixtures.

This design is based on AgentEval branch `codex/unified-evaluation-flow` at
commit `76cd314`. The source application is Streamlit, while the target is the
existing React and TanStack Start control console.

## Scope

The first version includes the complete mock workflow:

1. Browse, create, inspect, and revise evaluation Targets.
2. Browse, create, inspect, and edit Datasets and test cases.
3. Configure an Evaluation against locked Target and Dataset revisions.
4. Simulate per-case Evaluation progress and completion.
5. Inspect generated Reports, case results, tool evidence, judge results,
   usage, and cost.
6. Compare Reports and identify regressions and resolved failures.
7. Review Reflection suggestions and create a new mock Target Revision.

The module has no backend API, database model, Prisma migration, server route,
or integration with the TaskLattice runtime. It does not use `localStorage` or
provide a Reset control.

## Terminology

`Target` is retained from AgentEval and means a versioned Agent configuration
under evaluation. It is intentionally distinct from a TaskLattice `Instance`,
which represents a provisioned runtime.

`Evaluation` binds one immutable Target Revision to one immutable Dataset
Revision. A completed Evaluation produces one immutable Report, which may have
one Reflection.

## Information Architecture

Add `Evaluations` to the existing `Observer` navigation group in the project
sidebar. The module exposes four primary views through a compact local
navigation bar:

- `Targets`
- `Datasets`
- `Evaluations`
- `Reports`

The route hierarchy is:

```text
/$projectId/evaluations
/$projectId/evaluations/targets/$targetId
/$projectId/evaluations/datasets/$datasetId
/$projectId/evaluations/new
/$projectId/evaluations/runs/$runId
/$projectId/evaluations/reports/$reportId
```

The module index redirects or defaults to the Target list. A missing route ID
renders a local not-found state with a link back to the relevant list.

The Evaluation workflow uses one shared step model for new and historical
runs:

```text
Setup -> Evaluate -> Report -> Reflect -> Complete
```

Completed stages remain directly navigable. Future stages are disabled until
their prerequisites exist.

## Visual and Interaction Design

The UI uses TaskLattice's existing tokens and components. It does not reproduce
Streamlit styling. Page headers, spacing, typography, sidebar behavior, dark
mode, cards, tables, badges, buttons, sheets, dialogs, inputs, empty states,
and status colors follow existing control-console patterns.

Every primary page has the same composition:

1. Header with title, concise description, status context, and primary action.
2. Filter row with search and relevant Target, Dataset, status, or revision
   filters.
3. Main list or detail content.
4. Sheets or dialogs for complex edits that should not navigate away.

Desktop layouts favor dense tables and side-by-side evidence panels. Narrow
layouts stack metrics, filters, cards, and action groups without horizontal
page scrolling.

### Targets

The Target list exposes name, model, current revision, component counts, last
Evaluation status, pass rate, and action. Target detail shows the selected
revision prominently, followed by Model, Tools, MCP Servers, Knowledge Bases,
revision history, quality trend, cost trend, and Report history.

Creating or revising a Target uses a sheet. Submitting a revision creates a new
immutable revision in the in-memory store while preserving prior revisions.

### Datasets

The Dataset list exposes name, Target scope, current revision, case count,
schema summary, and last evaluated time. Dataset detail provides local tabs for
Cases, Schema, History, and Evaluation history.

Case creation, editing, duplication, deletion, JSON import, and mock generation
are interactive. Publishing creates a new immutable Dataset Revision. Mock
generation uses deterministic scenarios from the fixture layer and never calls
an LLM.

### Evaluations

The Evaluation list shows run time, Target Revision, Dataset Revision, status,
pass rate, duration, cost, and a resume/view action. `New evaluation` opens the
Setup stage, where Target and Dataset revisions are selected and locked.

Starting an Evaluation moves to the Evaluate stage and advances through
deterministic per-case results. Progress, current case, pass/fail counts, and
recent results stay visible. Completion creates a Report and enables the Report
stage.

### Reports and Reflection

Report detail presents status and KPI metrics first, followed by Test Results,
failure reasons, Tool Evidence, LLM Judge, Comparison, Usage & Cost, and
Reflection. Missing optional evidence displays `Not available` without changing
the Report status.

Comparison selects another Report from the same Target and shows shared-case
pass-rate delta, configuration changes, judge deltas, tool-state changes, cost
delta, resolved failures, regressions, unchanged failures, and added or removed
cases.

Reflection displays selectable suggestions with evidence, current value, and
suggested value. Submitting selected suggestions creates a new mock Target
Revision. Finishing without changes completes the workflow without a revision.

## Component Boundaries

The feature is organized under `apps/control/src/features/evaluations` with
small modules that expose explicit interfaces:

- `model.ts`: domain types and status unions.
- `fixtures.ts`: the complete initial demo graph.
- `mock-store.tsx`: provider, selectors, and commands.
- `scenario-engine.ts`: deterministic run and Report generation.
- `evaluation-shell.tsx`: module-local navigation and common layout.
- `targets/*`: list, detail, editor, and presentation helpers.
- `datasets/*`: list, detail, case editor, schema, import, and generation UI.
- `runs/*`: list, setup, stepper, progress, and result presentation.
- `reports/*`: detail, comparison, evidence, cost, and Reflection UI.
- `shared/*`: feature-specific status, metrics, and empty-state components only
  when an existing shared TaskLattice component does not already fit.

Route files remain thin. They parse route parameters and render feature
components; domain state transitions stay in the store and scenario engine.

## Mock Data Architecture

`fixtures.ts` is the single editing surface for initial UI data. It contains a
coherent graph of Targets, Target Revisions, Datasets, Dataset Revisions,
Cases, Runs, Reports, comparisons, evidence, costs, and Reflection suggestions.

The provider deep-clones the fixture graph once per browser tab and per mounted
project context. Components access data through typed selectors and perform
changes through explicit commands. No component imports fixture arrays
directly.

Required commands include:

```text
createTarget
createTargetRevision
createDataset
updateDatasetDraft
publishDatasetRevision
createCase
updateCase
duplicateCase
deleteCase
importCases
generateCases
createRun
advanceRun
createReport
submitReflection
finishReflectionWithoutChanges
```

The store is memory-only. Different browsers and tabs do not share changes.
Refreshing loads the latest source fixtures. This prevents one person's demo
actions from affecting another person and keeps UI iteration predictable.

The scenario engine accepts an injectable clock and ID factory. Default
fixtures produce deterministic pass, fail, blocked, missing-evidence, cost,
and regression states. Tests use the same public store commands with a fixed
clock and IDs.

## State and Error Handling

Commands validate references and prerequisites before mutating state. Invalid
operations return typed results rather than throwing into React rendering.

The UI handles:

- missing Target, Dataset, Run, or Report IDs;
- a Dataset with no published Revision;
- unavailable optional judge or tool evidence;
- a run with no cases;
- invalid imported JSON;
- duplicate case IDs or inputs;
- navigation to a future Evaluation stage;
- deleted or superseded selections within the current tab.

User errors render inline messages or existing toast patterns. Unexpected
errors remain inside the Evaluations feature boundary so the TaskLattice shell
continues to function.

## Testing Strategy

Implementation follows test-driven development.

1. Model and store tests cover Target and Dataset revision creation, case
   operations, Evaluation setup, run transitions, Report generation, Report
   comparison, and Reflection outcomes.
2. Scenario-engine tests cover deterministic progress, failures, missing
   optional evidence, cost aggregation, and regression detection.
3. Routing tests cover the sidebar entry, list-to-detail navigation, direct
   links, invalid IDs, and active navigation state.
4. Component behavior tests cover filters, forms, sheets, dialogs, step
   availability, action disabling, and visible feedback.
5. Browser smoke validation walks the complete Target -> Dataset -> Evaluation
   -> Report -> Reflection flow.
6. Responsive and theme validation covers desktop, narrow viewport, light
   theme, and dark theme.
7. Repository validation runs the relevant tests, full typecheck, and
   production build.

## Acceptance Criteria

- `Evaluations` appears under `Observer` and follows project-scoped routing.
- The complete AgentEval flow is usable without any Evaluation backend.
- Every visible mutation works within the current browser tab.
- Refreshing restores the checked-in fixture graph.
- The feature issues no Evaluation API requests and writes no browser storage.
- Fixture edits propagate through every dependent view without editing page
  components.
- Direct links and invalid IDs behave predictably.
- Existing TaskLattice navigation and pages remain functional.
- Relevant tests, typecheck, and production build pass.

## Explicit Non-Goals

- Persisting Evaluation data across refreshes or users.
- Sharing mutable Evaluation state between users.
- Prisma models, migrations, API routes, queues, or background workers.
- Executing a real Agent, LLM judge, tool, MCP Server, or Dataset generator.
- Connecting Reports to the existing Trace fixture repository.
- Replacing TaskLattice Instances with evaluation Targets.
