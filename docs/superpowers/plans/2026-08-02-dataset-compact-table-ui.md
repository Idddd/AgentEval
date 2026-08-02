# Dataset Compact Table UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace oversized Dataset controls and case cards with compact toolbars, tab-like navigation, and one-row-per-case tables.

**Architecture:** Keep Dataset state and persistence unchanged. Refactor `src/ui/datasets.py` into small rendering helpers for the list toolbar, detail toolbar, segmented navigation, and case table; use Streamlit native controls and dataframe row actions.

**Tech Stack:** Python 3.11, Streamlit, pytest, Streamlit AppTest.

## Global Constraints

- `Create` is right-aligned beneath the Dataset title.
- `Evaluate`, `Publish`, and `Back` are compact actions at the upper left of Dataset detail.
- Detail navigation and generation/import actions look like small tabs or toolbar controls.
- Every Dataset case occupies exactly one table row.
- Existing Dataset persistence and evaluation routing behavior must remain unchanged.

---

### Task 1: Compact list and detail toolbars

**Files:**
- Modify: `src/ui/datasets.py`
- Test: `tests/test_ui_evaluation_flow.py`

**Interfaces:**
- Consumes: `_set_dataset_view(agent_id: str, view: str)` and `_evaluate_dataset_revision(revision_id: str)`.
- Produces: compact list and detail action groups with unchanged callback behavior.

- [ ] **Step 1: Write failing AppTest assertions** proving Create is in the list header action group, detail actions use `Evaluate`/`Publish`/`Back`, and the old long Evaluate label is absent.
- [ ] **Step 2: Run the focused tests** with `pytest -q tests/test_ui_evaluation_flow.py -k 'dataset_list_toolbar or dataset_detail_toolbar'` and confirm they fail on the current layout.
- [ ] **Step 3: Implement compact native Streamlit horizontal containers** and move Publish out of the draft action area into the detail toolbar.
- [ ] **Step 4: Run the focused tests** and confirm they pass.

### Task 2: Tab-like navigation and case table

**Files:**
- Modify: `src/ui/datasets.py`
- Test: `tests/test_ui_evaluation_flow.py`

**Interfaces:**
- Consumes: Dataset `schema`, `registry.list_draft(dataset_id)`, and existing case callbacks.
- Produces: `_case_table_rows(schema, cases)` and compact row-action handling.

- [ ] **Step 1: Write failing tests** proving segmented detail navigation exists, Draft actions are compact and left-aligned, and two cases produce two table rows.
- [ ] **Step 2: Run focused tests** and confirm failure is caused by the current card-based case renderer.
- [ ] **Step 3: Implement the segmented control and native dataframe** with schema columns and an Actions button column that preserves Edit, Duplicate, and Delete.
- [ ] **Step 4: Run focused tests** and confirm the new UI behavior passes.

### Task 3: Full verification

**Files:**
- Verify: `src/ui/datasets.py`
- Verify: `tests/test_ui_evaluation_flow.py`

**Interfaces:**
- Consumes: the completed Dataset UI.
- Produces: verified application behavior with no regression.

- [ ] **Step 1: Run syntax and full tests** using `python -m py_compile src/ui/datasets.py && pytest -q`.
- [ ] **Step 2: Restart Streamlit** at `http://localhost:8501/` so imported modules refresh.
- [ ] **Step 3: Browser-check Dataset list and detail** for compact typography, spacing, toolbars, tabs, and one-row-per-case rendering.
