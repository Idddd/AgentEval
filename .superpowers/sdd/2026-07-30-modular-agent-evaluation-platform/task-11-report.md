# Task 11 Delivery Report

## Status

Complete and verified. Task 11 adds Agent-scoped Dataset drafts, the contextual
four-stage Run wizard, structured Report visualization/history, and
revision-aware comparison in the approved Eval Studio visual language.

## Delivered

- `src/ui/datasets.py`
  - Creates an empty Agent-owned Dataset draft on first use; it never seeds cases.
  - Provides stable actions for Add case, Generate with LLM, Import JSON,
    Complete coverage, and Publish revision.
  - Keeps LLM/JSON candidates in an editable, selectable review step before
    adding them to the durable ordered draft.
  - Supports Edit, Duplicate, and Delete row actions and disables publishing
    for an empty draft.
- `src/ui/runs.py`
  - Provides four explicit stages: Agent Revision, Dataset Revision/current
    draft publishing, evaluator/Judge/cost review, and run start.
  - Calls `EvalRunner.run_revision()` with per-case progress and creates/selects
    the resulting Report through `ReportService`.
  - Blocks start for disabled, missing, or unknown-adapter Tools required by
    selected cases.
  - Shows Agent-scoped run history with time, immutable revision identities,
    run status, quality status, and Evaluation cost.
- `src/ui/reports.py`
  - Reads only `ReportSnapshot.summary` for report rendering.
  - Shows a textual status banner, compact four-up KPIs, fixed Judge dimensions,
    Tool funnel, textual case statuses, four-state Tool evidence, separated
    Agent/Judge/Evaluation/Dataset costs, failures, trace references, and durable
    history.
  - Provides selected-Agent comparison with the different-Dataset warning,
    shared-case pass-rate delta, Agent diff, Judge/Tool/token/cost deltas,
    resolved failures, regressions, unchanged failures, and added/removed cases.
- `src/ui/charts.py`
  - Provides labelled, accessible Plotly charts for Judge, Tool funnel, and
    Evaluation cost only, using Eval Studio colors.
- `tests/test_ui_evaluation_flow.py` and `tests/test_ui_reports.py`
  - Cover additive JSON import, malformed input, Tool availability gating,
    empty Dataset actions, chart/category semantics, textual evidence states,
    comparison groups, and Report History across a reopened SQLite repository.

## Verification

- Focused Task 11 suite:
  - `python -m pytest tests/test_ui_evaluation_flow.py tests/test_ui_reports.py -q`
  - Result: `8 passed`.
- Task 8–11 service/interface suite:
  - `python -m pytest tests/test_report_service.py tests/test_report_compare.py tests/test_eval_run_persistence.py tests/test_ui_evaluation_flow.py tests/test_ui_reports.py -q`
  - Result: `17 passed`.
- Full suite:
  - `python -m pytest -q --basetemp=.pytest_tmp_task11_full`
  - Result: `96 passed, 1 warning`.
  - The warning is the existing Pytest collection warning for the domain
    dataclass named `TestCase` in `tests/test_dataset_registry.py`.

## Integration Note

Task 10 owns `app.py`, `src/ui/shell.py`, `src/ui/agents.py`, and
`src/ui/state.py`, so Task 11 did not edit them. The small required wiring is:

1. Import `render_datasets_module`, `render_runs_module`, and
   `render_reports_module` in `src/ui/agents.py`.
2. Replace the non-Tools placeholder branches in `render_agent_workspace()`:
   - `Datasets` → `render_datasets_module(repository, agent.agent_id,
     llm_generate)`
   - `Runs` → `render_runs_module(repository, agent.agent_id, runner,
     report_service)`
   - `Reports` → `render_reports_module(repository, agent.agent_id,
     report_service, langfuse_base_url=...)`
3. Thread those optional service dependencies through `render_shell()`,
   `render_agents_page()`, and `render_agent_workspace()` from app composition.
4. Make the workspace `New evaluation` button set
   `st.session_state.active_agent_module = "Runs"`.

The renderer contracts are intentionally dependency-injected so a real or fake
runner can be used. A runner supplies `run_revision(agent_revision_id,
dataset_revision_id, progress=callback)` and may return an `EvalRun` directly or
as an awaitable. The Report service supplies `create(run_id)` and
`compare(baseline_report_id, current_report_id)`.

## Concerns

- The Dataset LLM action needs a candidate generator injected by app
  composition. Without one, the UI displays a muted cream configuration notice
  rather than fabricating cases.
- The current Tool availability check intentionally mirrors Task 10's known
  adapters: `python`, `http`, `mock`, and `langfuse`. A future adapter registry
  should replace this shared constant at the service boundary.
