# Dataset Module List UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a list-first Dataset module with fixed create fields, mutually exclusive views, Dataset-scoped evaluation history, and direct evaluation of a selected published revision.

**Architecture:** Keep the existing single Streamlit shell and repository domain. Add small pure presentation helpers in `src/ui/datasets.py`, reuse existing repository methods to resolve revisions, runs, and reports, and keep all navigation in `src/ui/state.py`. Preserve existing database records and apply the new schema only to newly created Datasets.

**Tech Stack:** Python 3.11, Streamlit, SQLite, pytest, Streamlit AppTest

## Global Constraints

- Target, Dataset, Evaluation, and Report are peer modules without step numbers.
- New Dataset schemas always contain locked `query`, `expected_action`, and `header` columns.
- Existing Dataset schemas and records are not migrated.
- Prefer list and table presentation over bordered cards.
- Never render Dataset list, Draft cases, and Create Dataset at the same time.

---

### Task 1: Fixed create schema

**Files:**
- Modify: `src/workbench_models.py`
- Modify: `src/ui/datasets.py`
- Test: `tests/test_workbench_models.py`
- Test: `tests/test_ui_evaluation_flow.py`

**Interfaces:**
- Consumes: `CREATE_FORM_TEMPLATE: DatasetSchema`
- Produces: `_initial_create_columns() -> list[dict[str, str]]` with locked built-in metadata

- [ ] Write tests asserting the exact built-in names, kinds, types, and required flags and asserting a custom column can be appended.
- [ ] Run the focused tests and verify they fail because the current template contains `expected_tool_called` and `headers`.
- [ ] Change the template to `query`, `expected_action`, and `header`; mark built-in form rows as locked and render custom rows with add/delete controls.
- [ ] Run the focused tests and verify they pass.

### Task 2: Mutually exclusive Dataset views

**Files:**
- Modify: `src/ui/datasets.py`
- Modify: `src/ui/state.py`
- Test: `tests/test_ui_evaluation_flow.py`
- Test: `tests/test_ui_state.py`

**Interfaces:**
- Produces: `_dataset_view_key(agent_id: str) -> str`
- Produces: `_set_dataset_view(agent_id: str, view: str) -> None`
- Valid views: `list`, `draft`, `schema`, `history`, `create`

- [ ] Add AppTest cases proving the initial list does not render Draft cases and Create does not render either list or Draft.
- [ ] Run the focused cases and verify the current always-visible Draft behavior fails them.
- [ ] Add explicit Dataset view state and return after rendering each view.
- [ ] Render Dataset rows and case rows as divider-separated lists without per-row bordered containers.
- [ ] Run the focused tests and verify all view exclusivity cases pass.

### Task 3: Dataset details and evaluation history

**Files:**
- Modify: `src/ui/datasets.py`
- Test: `tests/test_ui_evaluation_flow.py`

**Interfaces:**
- Produces: `_dataset_history(repository, agent_id, dataset_id) -> list[dict[str, Any]]`
- Uses: `list_runs(agent_id)`, `get_dataset_revision(revision_id)`, `list_reports(agent_id)`

- [ ] Add tests with two Datasets and multiple revisions proving history includes every run for the selected Dataset and excludes the other Dataset.
- [ ] Run the history test and verify it fails because no Dataset history view exists.
- [ ] Implement the history join and render Run, Revision, Started, Status, Pass rate, Cases, Cost, and Report action in list form.
- [ ] Add Schema view coverage using the persisted Dataset-level schema.
- [ ] Run the focused tests and verify details and history pass.

### Task 4: Evaluate selected Dataset

**Files:**
- Modify: `src/ui/datasets.py`
- Modify: `src/ui/runs.py`
- Modify: `src/ui/state.py`
- Test: `tests/test_ui_evaluation_flow.py`

**Interfaces:**
- Produces session key: `requested_dataset_revision_id`
- Consumes existing: `request_navigation("Evaluation")`

- [ ] Add tests proving an unpublished Dataset has no Evaluate action and a published Dataset routes its current revision to Evaluation.
- [ ] Run focused tests and verify they fail because Dataset has no Evaluate action.
- [ ] Set `requested_dataset_revision_id` before pending navigation and consume it when Evaluation builds its Dataset Revision selector.
- [ ] Run the focused tests and verify routing and selection pass.

### Task 5: Target terminology and regression verification

**Files:**
- Modify: `src/ui/shell.py`
- Modify: `src/ui/state.py`
- Modify: `app.py`
- Test: `tests/test_ui_shell.py`
- Test: `tests/test_ui_demo.py`

**Interfaces:**
- User-facing page label: `Target`
- Internal compatibility route: update all callers atomically from `Agent` to `Target`

- [ ] Add shell tests for the four peer module labels and readable selected Target context.
- [ ] Run focused shell tests and verify they fail on current Agent copy and malformed separators.
- [ ] Update route labels, CSS icons, context copy, and route guards without changing domain model names.
- [ ] Run all UI tests, then run the complete pytest suite.
- [ ] Refresh `http://localhost:8501/` and verify Dataset List, Create, Draft, Schema, History, Evaluate, and Report navigation visually.

