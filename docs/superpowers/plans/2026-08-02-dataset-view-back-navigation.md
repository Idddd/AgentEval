# Dataset View and Back Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the awkward Dataset Open and Back controls with clear link-style navigation.

**Architecture:** Keep the existing ButtonColumn callback and Dataset state transitions. Change only the visible row label and move the return control out of the execution-action toolbar.

**Tech Stack:** Python 3.11, Streamlit, Streamlit AppTest, pytest.

## Global Constraints

- Dataset table row navigation reads `View` and is the last column.
- Detail return navigation appears above the title as `Datasets` with a left arrow.
- Evaluate and Publish remain grouped execution actions.

---

### Task 1: Dataset navigation controls

**Files:**
- Modify: `src/ui/datasets.py`
- Test: `tests/test_ui_evaluation_flow.py`

**Interfaces:**
- Consumes: `_handle_dataset_list_action()` and `_set_dataset_view()`.
- Produces: unchanged state transitions with revised control placement and copy.

- [ ] **Step 1: Add failing AppTest assertions** for final-column `View`, absence of `Open`, and detail `Datasets` navigation above execution actions.
- [ ] **Step 2: Run focused tests** and confirm failure against current `Open` and grouped `Back` controls.
- [ ] **Step 3: Change labels and layout** while retaining the existing callbacks and keys.
- [ ] **Step 4: Run focused and full tests**, restart Streamlit, and inspect the real UI.
