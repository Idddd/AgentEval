# Report List, Detail, and Reflect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build list-first Report navigation and a structured Reflect workflow that creates a new immutable Target Revision from accepted suggestions.

**Architecture:** Add a pure deterministic reflection service that emits typed config patches. Refactor the Streamlit Report module into list, detail, and analysis renderers while preserving the existing report-detail functions.

**Tech Stack:** Python 3.11, Streamlit, dataclasses, SQLite repository, Streamlit AppTest, pytest.

## Global Constraints

- Report list uses one native table row per Report and View in the final column.
- Reflect is a small right-aligned detail action.
- Agree is per suggestion and Submit applies accepted suggestions only.
- Submit creates a new immutable Target Revision and preserves Tool bindings.
- Existing Report, Evaluation, Target, and Dataset behavior remains compatible.

---

### Task 1: Structured reflection service

**Files:**
- Create: `src/report_reflection.py`
- Test: `tests/test_report_reflection.py`

**Interfaces:**
- Produces: `ReflectionSuggestion`, `RuleBasedReportReflector.reflect(report, revision)`, and `apply_suggestions(config, suggestions)`.

- [ ] Write failing tests for failure-driven Prompt, Model parameter, and Tool policy suggestions.
- [ ] Run focused tests and confirm missing-interface failures.
- [ ] Implement typed suggestions with allowlisted config patches.
- [ ] Implement accepted-only immutable patch application.
- [ ] Run focused tests and confirm pass.

### Task 2: Report list and detail navigation

**Files:**
- Modify: `src/ui/reports.py`
- Modify: `src/ui/state.py`
- Test: `tests/test_ui_reports.py`

**Interfaces:**
- Produces: report view state `list | detail | analysis`, `_report_rows()`, View, Back, and Reflect callbacks.

- [ ] Write failing AppTests for initial list, table columns, View detail, compact Back, and right-aligned Reflect.
- [ ] Run focused tests and confirm failure against selector-first UI.
- [ ] Implement list/detail renderers while reusing existing detail content.
- [ ] Preserve intentional navigation from Evaluation to the selected Report detail.
- [ ] Run focused tests and confirm pass.

### Task 3: Analysis UI and Target Revision submission

**Files:**
- Modify: `src/ui/reports.py`
- Test: `tests/test_ui_reports.py`

**Interfaces:**
- Consumes: reflection service and `AgentRegistry.revise()`.
- Produces: Agree table, Revision preview, and Submit navigation to Target detail.

- [ ] Write failing AppTests for analysis content and disabled Submit without accepted suggestions.
- [ ] Write a failing integration test accepting one suggestion and proving only its patch is persisted in a new Revision while Tools remain unchanged.
- [ ] Run focused tests and confirm failure.
- [ ] Implement analysis table, accepted-row state, preview, stale-context validation, and submission.
- [ ] Run Report tests and confirm pass.

### Task 4: Verification

**Files:**
- Modify only files required by verified failures.

- [ ] Run Python compilation for new and modified modules.
- [ ] Run the full pytest suite with zero failures.
- [ ] Restart Streamlit and inspect Report list, detail, Reflect analysis, Agree, and Submit.
- [ ] Request independent review and resolve Critical or Important findings.
- [ ] Re-run the full suite after review.
