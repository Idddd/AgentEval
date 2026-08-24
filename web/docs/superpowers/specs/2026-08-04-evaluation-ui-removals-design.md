# Evaluation UI Removals

## Goal

Simplify the current UI by removing two visible controls without changing their underlying routes, state, or mock functionality.

## Changes

- Remove the `Reset demo` button from the shared Evaluation page header.
- Remove the legacy `Evaluations` item from the Observer sidebar group.
- Keep the reset action, legacy Evaluations route, and existing feature code intact.

## Verification

- Confirm Evaluation pages no longer render `Reset demo`.
- Confirm the Observer sidebar contains only `Traces` and `Cost`.
- Run the focused navigation tests and TypeScript typecheck.
