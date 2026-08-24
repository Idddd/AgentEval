# Direct Evaluation Start Design

## Goal

Start the mock Evaluation directly from the Test coverage step instead of stopping at a separate Start evaluation confirmation step.

## Root cause

`continueWithSelectedDataset()` currently publishes or confirms the selected Dataset, clears `datasetSelectionPending`, and only advances focus to the Evaluation section. The next render then exposes a second action that calls `startEvaluation()`. The second action already creates the Run correctly; the first action is the redundant confirmation transition.

## Interaction design

- Replace the Test coverage primary action label `Next` with `Run evaluation` when a Dataset and at least one Guardrail pack are selected.
- Clicking the action performs any required Dataset publish/confirmation work and immediately starts the Evaluation.
- Do not render the intermediate `Start evaluation` action state for this path.
- After Run creation, preserve the existing behavior: show `Report in progress`, progress, logs, and Result details.
- Keep validation messages and Admin restrictions unchanged.
- Keep Dataset creation and Guardrail pack selection behavior unchanged.

## Implementation approach

Use one explicit event handler that first completes Dataset preparation and then calls the existing Run creation logic. Avoid an effect-driven auto-start because it could create duplicate Runs on rerender. Keep the Evaluation details component because it remains useful while a Run is active and for existing non-Onboarding workflows.

## Testing

- Update the Onboarding workflow test to expect `Run evaluation` at Test coverage rather than a `Next` transition to Start evaluation.
- Click once and assert that the drawer immediately exposes running progress and Result details.
- Assert that `Start evaluation` is not shown as an intermediate current step.
- Preserve focused tests for validation failures and Guardrail role restrictions.
