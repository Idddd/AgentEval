# Case Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reviewed LLM and JSON candidate-case creation to the Dataset page.

**Architecture:** A pure `case_studio` module validates raw candidates and deterministically creates dataset items. The UI owns temporary drafts in session state and persists only user-selected cases. LLM output is JSON-only candidate input and cannot set expected results.

**Tech Stack:** Python, Streamlit, existing Anthropic/OpenAI configuration, pytest.

## Global Constraints

- Only deterministic `compute_case` derives expected output.
- Pasted JSON works without model credentials.
- Invalid or duplicate drafts never enter the dataset.
- Accepted drafts use `metadata.custom = true`.

---

### Task 1: Candidate validation and coverage gaps

**Files:**
- Create: `src/case_studio.py`
- Create: `tests/test_case_studio.py`

- [ ] Write failing tests for valid conversion, unknown-tool rejection, duplicate rejection, and missing tool-role coverage.
- [ ] Implement `validate_candidate`, `candidate_to_item`, and `coverage_gaps` using `compute_case`.
- [ ] Run `pytest tests/test_case_studio.py -q`.

### Task 2: LLM candidate generation

**Files:**
- Modify: `src/intent.py`
- Modify: `tests/test_case_studio.py`

- [ ] Write a failing test for JSON response parsing into raw candidate dictionaries.
- [ ] Add a narrow generator interface that reuses configured LLM clients and requests JSON-only candidates.
- [ ] Run focused tests.

### Task 3: Dataset Case Studio UI

**Files:**
- Modify: `app.py`
- Modify: `tests/ui_smoke.py`

- [ ] Write failing smoke coverage for JSON paste preview and adding selected drafts.
- [ ] Render LLM draft actions, JSON textarea, editable review rows, and selected-case persistence.
- [ ] Display unavailable LLM state without blocking JSON import.
- [ ] Run smoke and full pytest suite.
