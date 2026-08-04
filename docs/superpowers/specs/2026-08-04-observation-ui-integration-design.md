# Observation UI Integration Design

## Context

GitHub PR #2 added an Observation Overview and a Trace explorer to
`codex/rewrite-pages`. The current `codex/dataset-generation-ui` branch has a
newer flat navigation system and more polished Dataset workflows. The new
observation capabilities must be integrated without replacing that current UI
or importing unrelated PR changes.

## Goals

- Add both `Overview` and `Trace` as Target-scoped pages.
- Preserve the PR's trace list, trace detail, span waterfall, analysis, and
  session-only `Mark fail` behavior.
- Use the current branch's flat sidebar navigation, typography, colors,
  spacing, tables, buttons, empty states, and detail-page conventions.
- Persist and query enough evaluation data to populate both pages.
- Preserve all current Dataset behavior and uncommitted Dataset fixes.

## Non-goals

- Do not merge PR #2 wholesale.
- Do not replace the current sidebar with the PR's grouped button navigation.
- Do not persist `Mark fail`, add reviewers, comments, assignments, or an audit
  history.
- Do not change immutable evaluation statuses when a trace is marked failed in
  the current browser session.
- Do not import the PR's unrelated Langfuse environment change.

## Integration Strategy

Use a selective port. Bring over the trace domain models, repository query
contracts, SQLite implementations, raw-trace provider, and observation page
behavior. Adapt navigation and CSS directly to the current branch instead of
copying the PR's sidebar rewrite.

This keeps the feature boundary clear:

- persistence supplies Target-scoped trace summaries and details;
- the raw-trace provider supplies optional span-tree data;
- observation views render repository data without owning persistence;
- the current shell remains the single source of navigation and Target
  context.

## Navigation and Page Structure

The sidebar remains a single flat `st.radio` navigation list. Insert
`Overview` and `Trace` after `Reflect` and before `Settings`, using icons and
selected-state styling consistent with the existing entries.

Both new pages require a selected, revision-ready Target, just like Dataset,
Evaluation, and Report. If no valid Target is selected, the existing shell
normalization redirects to Target and shows the current warning.

Entering Trace from another page clears only `selected_trace_id`, so the user
lands on the Trace list. Returning within the Trace module preserves the
currently selected span while that trace remains open.

## Overview Page

The Overview page provides a compact operational summary for the selected
Target:

- total traces;
- total observations;
- non-passing traces;
- aggregate evaluation cost.

Use the current metric-card presentation and existing muted captions. With no
traces, show a neutral informational empty state that directs the user to run
an evaluation.

## Trace List and Detail

The Trace list uses the current branch's dataframe conventions. Each row shows
Trace ID, Case ID, status, start time, observation count, latency, cost, and an
explicit View action.

Trace Detail includes:

- a back action matching current detail navigation;
- session-only `Mark fail` and `Analysis` controls;
- status, observation, latency, and cost metrics;
- an optional span waterfall and selectable span tree;
- span input, output, metadata, usage, and cost sections;
- response, tool observations, Judge observation, and deterministic scores.

`Mark fail` remains stored only in `st.session_state`. It is a temporary review
aid and never overwrites the immutable evaluation result.

## Data Model and Repository Contracts

Add immutable `TraceSummary` and `TraceDetail` models. Extend
`WorkbenchRepository` with:

```python
def list_traces(self, agent_id: str) -> list[TraceSummary]: ...
def get_trace(self, trace_id: str) -> TraceDetail: ...
```

`SQLiteWorkbenchRepository.list_traces` joins persisted case results to their
runs, filters by Target, and returns newest runs first. `get_trace` finds a
single persisted case result by Trace ID and raises `KeyError` when absent.

Observation count remains compatible with PR #2: tool evidence count plus one
when a Judge observation exists. Latency is the sum of recorded tool evidence
latencies. Cost is the sum of the case result's usage costs.

The application provides raw `TraceRecord` objects from the demo trace store
and the standard local trace store. Missing raw spans do not prevent the
persisted Trace Detail page from rendering.

## Error and State Handling

- A missing selected trace returns to the list and shows a warning.
- A trace belonging to another Target is rejected and the selection is
  cleared.
- Missing raw span data shows a muted caption while persisted response and
  evaluation observations remain visible.
- Empty trace lists and overview metrics render without exceptions.
- Demo reset clears `selected_trace_id` with other transient page selections.

## Visual Consistency

Reuse the current design tokens: green primary color, neutral canvas, white
content surfaces, existing border color, rounded controls, compact table
headers, and muted secondary text. Add only narrowly scoped CSS for the span
waterfall, trace-row buttons, and temporary review controls.

Do not copy PR #2's sidebar button CSS or grouped navigation headings. The new
pages must look native to the current branch rather than like a separately
mounted feature.

## Testing

Follow test-driven development for each behavior:

- repository trace listing, detail lookup, aggregation, ordering, missing
  traces, and Target isolation;
- UI state routing and reset behavior for Overview and Trace;
- shell dispatch with and without valid Target context;
- Overview metrics and empty state;
- Trace list row actions, detail back navigation, session-only mark state,
  missing trace behavior, and cross-Target protection;
- span flattening, latency calculation, and rendering with or without raw span
  data.

Run the focused tests first, then the full pytest suite. Rebuild the Docker
service and verify Overview, Trace list, Trace detail, Analysis, and the span
waterfall in the browser.

## Acceptance Criteria

- Overview and Trace are reachable from the current sidebar and visually match
  the current branch.
- Both pages are scoped to the selected Target.
- Persisted trace summaries and details render from SQLite data.
- Raw spans render when available and degrade gracefully when unavailable.
- `Mark fail` remains session-only and does not mutate evaluation records.
- Existing Dataset, Evaluation, Report, Reflect, Settings, and Target flows
  continue to pass their tests.
- No unrelated PR #2 navigation or environment changes are introduced.
