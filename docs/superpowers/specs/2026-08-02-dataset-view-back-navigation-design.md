# Dataset View and Back Navigation Design

## Goal

Clarify Dataset navigation by making each row action a plain `View` link-style control and separating detail-page navigation from evaluation actions.

## Design

- The Dataset table's final column is `View`, rendered as a tertiary text action without an arrow or button-like background.
- Dataset detail places a tertiary `Datasets` return control with a left-arrow icon above the Dataset title.
- `Evaluate` and `Publish` remain grouped below the metadata as execution actions.
- Existing Dataset selection, revision evaluation, and publish behavior remain unchanged.

## Verification

- AppTest asserts `View` row copy and the detail navigation/action hierarchy.
- Browser inspection verifies real placement and visual weight.
- The full pytest suite must pass.
