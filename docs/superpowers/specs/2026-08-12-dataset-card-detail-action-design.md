# Dataset Card Detail Action Design

## Goal

Add an explicit `+` action inside each existing Dataset card so a user can open that Dataset's detail directly.

## Current behavior

Dataset cards expose only a radio selection action. The embedded `EvaluationDatasetDetail` is mounted only when the workspace-wide Details mode is open, so a card has no direct way to reveal its detail.

## Interaction design

- Add a new visible `+` button inside every existing Dataset card.
- Keep the existing selection indicator in the card's upper-right area.
- Give the action the accessible name `Open <Dataset name> details`.
- Clicking the card body or radio control continues to select the Dataset only.
- Clicking `+` selects that Dataset, opens workspace Details mode, expands Test coverage, and displays the selected Dataset's embedded detail.
- Clicking `+` must not trigger the surrounding radio label a second time.
- The `New Dataset` card remains unchanged.

## Component boundary

`DatasetCardSelector` receives a new `onOpenDetails(datasetId: string)` callback and owns only the card action rendering. `WorkspaceDrawer` owns the UI state change: select the Dataset, clear any workspace notice, open Details mode, expand the Dataset section, and focus Test coverage.

## Testing

- Component test: every existing Dataset card exposes its own `+` detail action and invokes `onOpenDetails` with the correct Dataset ID.
- Component test: clicking `+` does not invoke the normal `onSelect` callback from label propagation.
- Catalog integration test: clicking a Dataset card's `+` selects that Dataset and renders its Dataset detail under expanded Test coverage.
- Existing card selection and New Dataset creation tests remain valid.
