# Compact Create Dataset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Create Dataset as a narrow, compact editor with simple column rows.

**Architecture:** Keep all existing session-state and schema-building functions. Refactor only `_render_create_form` and add small rendering helpers so layout decisions remain separate from validation and persistence.

**Tech Stack:** Python 3.11, Streamlit, Streamlit AppTest, pytest.

## Global Constraints

- Editor width is approximately 660px and left aligned.
- Fixed fields remain locked and render as compact summaries.
- Custom fields remain editable, duplicable, and deletable.
- Existing validation and successful creation routing remain unchanged.

---

### Task 1: Compact Create Dataset editor

**Files:**
- Modify: `src/ui/datasets.py`
- Test: `tests/test_ui_evaluation_flow.py`

**Interfaces:**
- Consumes: `_initial_create_columns()`, `_sync_column_field()`, `_validate_create_form()`, `_build_schema_from_columns()`.
- Produces: the same Dataset create actions and session-state transitions in a narrower layout.

- [ ] **Step 1: Add failing AppTest coverage** proving fixed fields are summaries, Basic information has one Name control, and a custom field uses a compact horizontal configuration.
- [ ] **Step 2: Run the focused tests** and confirm failure against the current vertically expanded custom-column editor.
- [ ] **Step 3: Refactor `_render_create_form`** into a 660px container, concise locked rows, compact custom rows, and a horizontal Create/Cancel toolbar.
- [ ] **Step 4: Run focused and full tests** with `pytest -q tests/test_ui_evaluation_flow.py` followed by `pytest -q`.
- [ ] **Step 5: Restart Streamlit and inspect the real page** at `http://localhost:8501/`.
