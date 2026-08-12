# Report Action Placement Design

## Goal

Make the embedded evaluation report demo easier to scan without adding new workflow behavior.

## Suggestion action

- Render an `Action` button beside every Suggestion item.
- The button remains enabled so it looks like a normal available action.
- It has no click handler, state mutation, navigation, or API call.
- The Suggestion text keeps the available horizontal space and the button stays aligned to its right, wrapping naturally on narrow screens.

## Evaluation decision action

- In the Catalog workspace's expanded report view, render the pending Admin decision button in the sticky `Report navigation` bar.
- Use the report recommendation to preserve the existing action: `Approve evaluation` for passing reports and `Reject evaluation` for reports with findings.
- Reuse the existing workspace decision handler so the mock decision behavior remains unchanged.
- Render the report's `Evaluation decision` section in status-only mode so decision context remains visible but its original action button is removed.
- Standalone reports keep their current inline decision controls.

## Testing

- Verify the Suggestion `Action` button exists, is enabled, and clicking it does not change the Suggestion.
- Verify the embedded report navigation contains the pending decision button.
- Verify the embedded report no longer contains a second decision action inside `Report details`.
- Keep existing Developer rejection and standalone report tests unchanged.
