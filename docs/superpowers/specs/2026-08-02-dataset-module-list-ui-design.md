# Dataset Module List UI Design

## Goal

Make Target, Dataset, Evaluation, and Report independent modules. Redesign the
Dataset module around compact lists so users can select a Dataset, inspect its
draft and schema, review Dataset-scoped evaluation history, and evaluate its
latest published revision without overlapping views.

## Navigation and terminology

- Rename the user-facing `Agent` module to `Target`. Domain class and database
  names remain unchanged.
- Keep `Target`, `Dataset`, `Evaluation`, and `Report` as peer modules. Do not
  display step numbers or completion states.
- Replace the broken selected-context separator with readable centered dots.
- Keep Settings visually separated from the four main modules.

## Dataset views

The Dataset module renders exactly one primary view at a time:

1. **Datasets** — a compact list of Dataset records for the selected Target.
2. **Draft cases** — the editable cases for the selected Dataset.
3. **Schema** — the declared Dataset columns as a compact list.
4. **Evaluation history** — runs for every published revision of the selected
   Dataset.
5. **Create Dataset** — a focused creation form that replaces the other views.

Opening Create Dataset must hide the Dataset list and Draft cases. Returning to
the list must clear the create view. Selecting a Dataset opens Draft cases and
stores only its ID in transient session state.

## Dataset list

Each list row shows name, draft case count, latest published revision,
evaluation count, and last evaluated time. A row action selects the Dataset.
The list does not use a bordered card per Dataset.

Once a Dataset is selected, the page header shows its name and status in the
form `Published R1 · Draft has 6 cases`. A primary **Evaluate published
revision** button is shown only when `current_revision > 0`. It navigates to the
Evaluation module with the selected Dataset Revision preselected. A Dataset
with no published revision shows no Evaluate button.

## Evaluation history

History is scoped to the selected Dataset, not only its current revision. Runs
are joined through `EvalRun.dataset_revision_id` and
`DatasetRevision.dataset_id`. Each row shows Run, Dataset Revision, started
time, status, pass rate, case count, evaluation cost, and a Report action when a
Report exists. Detailed case evidence remains in the Report module.

## Create Dataset schema

Every newly created Dataset starts with three built-in columns:

- `query`: input, string, value required.
- `expected_action`: output, string, value required.
- `header`: input, JSON, value optional.

The built-in column names, kinds, and types are locked in the create form and
cannot be deleted or duplicated. Users may add custom columns such as
`expected_tool_called`; custom columns support kind, name, type, required, and
description and may be deleted. Existing Dataset schemas and cases are not
migrated.

The form uses divider-separated list rows instead of nested bordered cards. It
validates non-empty Dataset name, valid unique column names, at least one input
column, and at least one output column before persistence.

## State and errors

- `dataset_view_<agent_id>` stores the active Dataset view.
- `selected_dataset_id` stores the selected Dataset ID.
- Opening Create sets the view before widgets render; Cancel returns to the
  list and clears create-only draft state.
- Missing or deleted Dataset selections return safely to the list.
- Evaluation navigation uses the existing pending-page mechanism so the
  sidebar widget state is not mutated after construction.
- Repository, validation, runner, or Report lookup errors remain visible in the
  relevant module and do not break global navigation.

## Visual rules

- Prefer tables, definition lists, and divider-separated rows.
- Do not wrap each Dataset, Schema column, case, or history row in a card.
- Use one primary action in the page header. Row actions are secondary.
- Preserve the existing dark-green sidebar and pale neutral canvas.

## Verification

- Model tests prove the exact built-in create schema.
- Streamlit AppTest coverage proves Create, List, Draft, Schema, and History are
  mutually exclusive.
- UI tests prove custom columns can be added while built-in columns remain.
- UI tests prove Dataset history contains runs from the selected Dataset only.
- UI tests prove Evaluate is unavailable for an unpublished Dataset and routes
  a published revision into Evaluation.
- Existing Dataset parsing, publishing, Evaluation, Report, and demo tests must
  continue to pass.

