# Report Action and Tool Evidence Compact UI Design

## Goal

Improve the embedded evaluation report by making the no-op Suggestion action visually prominent and reducing the default height of Tool Evidence while preserving access to complete output data.

## Scope

- Change every Suggestion `Action` button in the report to an explicit solid blue style.
- Keep the `Action` button enabled and without a functional side effect.
- Replace always-visible Tool Evidence JSON output with a per-row disclosure action.
- Do not change report data, evaluation logic, roles, decisions, or APIs.

## Suggestion Action

Both rendering branches for a Suggestion row use the same small blue button:

- Label: `Action`
- Size: small
- Background: `blue-600`
- Text: white
- Hover background: `blue-700`
- Focus behavior continues to use the shared Button focus styles.
- Clicking remains a no-op.

The explicit blue classes are used instead of the theme `default` variant because the current primary theme can appear purple.

## Tool Evidence Table

### Default state

- Each evidence row is compact and does not render its JSON output.
- The Output column contains a small blue `View output` button.
- Complete Trace IDs remain available and may wrap compactly; they are not truncated from the accessible content.
- With Output collapsed, the visible table should be approximately one third of its current height for the same number of rows.

### Expanded state

- Clicking `View output` expands a detail row immediately below the selected evidence row.
- The detail row spans all seven table columns and renders the existing `JsonPreview` for that evidence output.
- The button changes to `Hide output` and exposes `aria-expanded=true`.
- Clicking `Hide output` collapses the detail row.
- Opening another row closes the previously open row, so at most one output is expanded.

### Empty and null output

The same disclosure behavior applies. `JsonPreview` remains responsible for rendering the actual value, including null values, so the UI does not invent or discard output data.

## Component State

`EvaluationReportPage` stores one optional expanded evidence key:

```ts
const [expandedToolEvidenceKey, setExpandedToolEvidenceKey] = useState<string>();
```

Each Output action toggles this key. No state is persisted and no store mutation is required.

## Accessibility

- Each disclosure button has a row-specific accessible name: `View output for <trace ID>` or `Hide output for <trace ID>`.
- `aria-expanded` reflects the current state.
- The expanded content is placed directly after its owning row in table reading order.
- The existing `Action` label remains unchanged.

## Testing

- Verify all Suggestion `Action` buttons carry the blue visual classes and remain enabled no-ops.
- Verify Tool Evidence JSON content is absent by default.
- Click one row's `View output` button and verify its JSON becomes visible and the control changes to `Hide output`.
- Open a second row and verify the first output collapses.
- Click `Hide output` and verify the output collapses.
- Run focused report tests, TypeScript checks, and the full test suite.
- Validate the compact and expanded states in the local Catalog report drawer.

