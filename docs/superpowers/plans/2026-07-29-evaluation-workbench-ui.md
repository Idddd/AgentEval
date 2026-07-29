# Evaluation Workbench UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an English Home workbench that explains the configured target agent and policy, then clarify evaluation, diagnosis, and reporting flows.

**Architecture:** Keep all UI composition in `app.py` and reuse the existing `ToolsConfig`, trace, and report models. Add small pure presentation helpers only where they make the report status and case rows consistent; no evaluator, backend, or trace-schema behavior changes.

**Tech Stack:** Python 3.12, Streamlit, pandas, Plotly, Streamlit AppTest, pytest.

## Global Constraints

- User-facing copy is English.
- Tool and permission-policy content comes from the existing `config/tools.yaml` loader.
- Roadmap controls remain disabled and move to their own tab.
- Generated Markdown retains its existing sections and adds a clear text status summary.
- Run verification with `./.venv/Scripts/python.exe` and pytest `--basetemp=.pytest_tmp`.

---

### Task 1: Report status contract

**Files:**
- Modify: `src/report_generator.py`
- Create: `tests/test_report_generator.py`

**Interfaces:**
- Produces: `report_status(traces: list[TraceRecord]) -> tuple[str, str]`, returning `(status, summary)` where status is `COMPLIANT` or `ACTION REQUIRED`.
- Consumes: existing `TraceRecord` compliance scores.

- [ ] **Step 1: Write a failing test for an all-pass Markdown report**

```python
assert "## Status: COMPLIANT" in ReportGenerator("demo", store).generate(path)
```

- [ ] **Step 2: Run the focused test and verify it fails because the status heading is absent**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_report_generator.py -q --basetemp=.pytest_tmp`

- [ ] **Step 3: Write a failing test for a report containing a compliance failure**

```python
assert "## Status: ACTION REQUIRED" in markdown
assert "1 failing case" in markdown
```

- [ ] **Step 4: Implement `report_status` and render the status heading and failure count before Overview**

```python
def report_status(traces: list[TraceRecord]) -> tuple[str, str]:
    failures = sum(t.get_score(COMPLIANCE) != 1.0 for t in traces)
    if failures:
        return "ACTION REQUIRED", f"{failures} failing case(s) require investigation."
    return "COMPLIANT", "No permission failures were detected."
```

- [ ] **Step 5: Run the focused tests and verify they pass**

Run: `./.venv/Scripts/python.exe -m pytest tests/test_report_generator.py -q --basetemp=.pytest_tmp`

### Task 2: Home workbench and navigation

**Files:**
- Modify: `app.py`
- Modify: `tests/ui_smoke.py`

**Interfaces:**
- Consumes: `ToolsConfig.tools`, `ToolsConfig.roles`, dataset items, traces, and `report_status`.
- Produces: `Home` as the first Streamlit tab, workflow controls, and a separate `Roadmap` tab.

- [ ] **Step 1: Write failing AppTest assertions for Home content and exclusive Roadmap placement**

```python
assert "Target Agent" in markdown_text
assert "Permission policy" in markdown_text
assert "WeatherTool" in markdown_text
assert "COMPLIANT" in markdown_text or "ACTION REQUIRED" in markdown_text
```

- [ ] **Step 2: Run the UI smoke test and verify it fails because Home is missing**

Run: `./.venv/Scripts/python.exe tests/ui_smoke.py`

- [ ] **Step 3: Add Home rendering with target-agent copy, tool cards, role-policy table, and the three ordered workflow actions**

```python
tab_home, tab_dataset, tab_trace, tab_scores, tab_report, tab_roadmap = st.tabs([...])
with tab_home:
    render_target_agent(config)
    render_permission_policy(config)
    render_workflow_actions(...)
```

- [ ] **Step 4: Move existing side-bar actions into Home workflow and move the six roadmap cards into `tab_roadmap`**

Remove duplicated console placement and keep one expandable run-log section on Home.

- [ ] **Step 5: Run the UI smoke test and verify it passes**

Run: `./.venv/Scripts/python.exe tests/ui_smoke.py`

### Task 3: Diagnosis and report visual hierarchy

**Files:**
- Modify: `app.py`
- Modify: `tests/ui_smoke.py`

**Interfaces:**
- Consumes: `report_status`, trace scores, guard spans, and the existing case DataFrame.
- Produces: text-based `PASS`/`FAIL` status, trace decision summaries, and a report status banner.

- [ ] **Step 1: Write failing UI assertions for `ACTION REQUIRED`, `FAIL`, and Trace decision-summary labels after the smoke run**

```python
assert "ACTION REQUIRED" in markdown_text
assert "FAIL" in dataframe_text
assert "Permission Guard" in markdown_text
```

- [ ] **Step 2: Run the UI smoke test and verify it fails because the new states are absent**

Run: `./.venv/Scripts/python.exe tests/ui_smoke.py`

- [ ] **Step 3: Add status columns to case tables, a trace decision summary, and high-contrast `COMPLIANT` / `ACTION REQUIRED` report banners**

Use explicit text, icons, border, and strong foreground/background colors. Do not rely on cell fill color alone.

- [ ] **Step 4: Remove duplicate report tables and retain report overview, status, failure analysis, download, and raw Markdown preview**

- [ ] **Step 5: Run the complete test suite and verify it passes**

Run: `./.venv/Scripts/python.exe -m pytest -q --basetemp=.pytest_tmp`
