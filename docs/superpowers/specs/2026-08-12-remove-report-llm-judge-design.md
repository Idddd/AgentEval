# Remove Report LLM Judge UI Design

## Goal

Remove the entire `LLM Judge` section from evaluation report rendering so the report moves directly from Tool Evidence to Usage & Cost.

## Scope

- Remove the `LLM Judge` heading and description from `EvaluationReportDetail`.
- Remove all per-trace Judge model labels, score grids, summaries, and unavailable placeholders from the report.
- Preserve Summary, Suggestion, Test Results, Tool Evidence, Usage & Cost, and Evaluation decision rendering.
- Preserve all Judge fields in mock fixtures, traces, models, stores, and other pages.
- Do not add a feature flag, replacement section, API change, or data migration.

## Implementation Boundary

Delete only the `EvaluationSection` whose title is `LLM Judge` from `report-page.tsx`. If removing this section makes `KeyValueGrid` unused in that file, remove only that unused import. No shared component or data-model change is required.

## Data Flow

Evaluation traces continue carrying recorded Judge data. `EvaluationReportDetail` simply stops consuming that data for this section. Existing consumers outside this report remain unchanged.

## Error Handling

No new error state is introduced. Reports with or without Judge data render identically with respect to this change because the section is always absent.

## Testing

- Render a report that contains recorded Judge data and assert `LLM Judge` is absent.
- Assert recorded model labels and Judge score-card content are absent from the report.
- Assert Tool Evidence and Usage & Cost remain present, and Usage & Cost follows Tool Evidence in document order.
- Run focused report tests, TypeScript checks, the full test suite, and a Catalog report browser smoke test.

