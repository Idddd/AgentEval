# Single-Flow Agent Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-level Agent-to-Dataset-to-Evaluation-to-Report workflow with a durable Permission Compliance demo, locked Agent context, historical trends, result-first Reports, and optional Judge/Tool evidence.

**Architecture:** Keep SQLite as the product source of truth and reuse the existing Dataset, Eval Run, Report, and comparison services. Add an idempotent domain-level demo fixture and deterministic local runner, then replace nested Agent workspace tabs with sidebar page dispatch. Streamlit session state holds only route and selection context; persisted records survive refresh and demo reset.

**Tech Stack:** Python 3.12, Streamlit, SQLite, Plotly, pytest, Streamlit `AppTest`

## Global Constraints

- UI copy is English.
- Sidebar destinations are exactly `Agent`, `Dataset`, `Evaluation`, `Report`, and `Settings`.
- Agent selection is editable only on Agent Home; downstream pages display a locked Agent context.
- Records with `current_revision == 0` are hidden, never automatically deleted.
- Missing Judge output or Tool evidence does not change an otherwise passing case or Report.
- Report content order is Test Results, Tool Evidence, LLM Judge, Comparison, then Usage & Cost.
- `Reset demo` clears only transient UI state and never calls Streamlit cache clearing or deletes SQLite data.
- Existing Dataset manual entry, JSON import, LLM review, coverage completion, editing, and publishing remain available.
- Every Eval Run and Report is immutable and durable.
- Preserve the modular Agent revision and Tool binding model; do not hard-code Weather, Employee, or Restart behavior into generic UI modules.

---

## File Structure

- `src/demo_workspace.py`: fixture constants, idempotent SQLite seeding, and deterministic local demo runner.
- `src/workbench_repository.py`: public current-revision lookup used by domain and UI services.
- `src/sqlite_workbench.py`: SQLite implementation of the current-revision lookup.
- `src/eval_runner.py`: generic run status semantics when Judge output is absent.
- `src/ui/state.py`: single-level route state, Agent selection, downstream selection clearing, and non-destructive reset.
- `src/ui/shell.py`: sole navigation router and locked-context validation.
- `src/ui/agents.py`: Agent selector and Agent Home overview/history/trends.
- `src/ui/datasets.py`: existing Dataset editor with Agent context header and route-safe keys.
- `src/ui/runs.py`: Evaluation page, runner resolution, durable Report navigation.
- `src/ui/reports.py`: result-first Report layout, history, comparison, optional evidence, usage and cost.
- `src/ui/settings_page.py`: read-only LLM, Langfuse, SQLite, and fixture status.
- `src/ui/charts.py`: quality and cost trend figures for Agent Home.
- `app.py`: startup fixture seeding, runner selection, settings status, and shell wiring.
- `tests/test_demo_workspace.py`: fixture idempotence, baseline persistence, and local demo runs.
- `tests/test_eval_run_persistence.py`: missing-Judge pass semantics.
- `tests/test_ui_state.py`: route/selection/reset state tests.
- `tests/test_ui_agents.py`: valid Agent filtering and Agent Home history/trends.
- `tests/test_ui_evaluation_flow.py`: locked context, Dataset actions, durable run-to-Report flow.
- `tests/test_ui_reports.py`: result-first view model and optional evidence behavior.
- `tests/test_ui_shell.py`: real sidebar dispatch and Settings page.
- `tests/ui_smoke.py`: end-to-end primary demo flow.
- `README.md`: updated startup and demo walkthrough.

---

### Task 1: Make Optional Judge Data Non-Blocking

**Files:**
- Modify: `src/eval_runner.py`
- Modify: `src/report_service.py`
- Test: `tests/test_eval_run_persistence.py`
- Test: `tests/test_report_service.py`

**Interfaces:**
- Consumes: existing `EvalRunner.run_revision(...) -> EvalRun` and `ReportService.create(run_id) -> ReportSnapshot`.
- Produces: case status based on execution and required deterministic assertions; nullable Judge data remains presentation-only.

- [ ] **Step 1: Add failing runner tests for missing Judge output**

Add a Judge stub that raises `JudgeIncompleteError` and assert that a case with
complete adapter output and passing required deterministic scores is stored as
`PASS`, while its `judge` field remains `None`:

```python
class MissingJudge:
    def evaluate(self, *args, **kwargs):
        raise JudgeIncompleteError("provider unavailable")


def test_missing_judge_does_not_change_passing_case(tmp_path):
    repository, revision, dataset, adapter = seed_workbench(tmp_path)
    run = asyncio.run(
        EvalRunner(repository, adapter, PassingEvaluator(), MissingJudge()).run_revision(
            revision.revision_id, dataset.revision_id
        )
    )
    assert run.status is RunStatus.COMPLETED
    assert run.case_results[0].status == "PASS"
    assert run.case_results[0].judge is None
    assert "JUDGE_INCOMPLETE" in run.case_results[0].deterministic_reasons["judge"]
```

Add a companion assertion that a required deterministic score below `1.0`
still produces `FAIL` even when Judge data is absent.

- [ ] **Step 2: Run the focused tests and verify the missing-Judge test fails**

Run: `python -m pytest tests/test_eval_run_persistence.py -k "missing_judge" -v`

Expected: FAIL because the current runner stores `INCOMPLETE` and makes the Run
`PARTIAL`.

- [ ] **Step 3: Change the minimal status decision in `EvalRunner.run_revision`**

Use execution success and deterministic assertions as the gate:

```python
if deterministic_failed:
    status = "FAIL"
elif judge_result is not None and not judge_result.passed:
    status = "FAIL"
else:
    status = "PASS"
```

Keep the Judge error reason for diagnostics. Do not synthesize a `JudgeResult`.
An exception before usable adapter/evaluator output continues to leave the case
`INCOMPLETE`, so operational failures are not counted as passes.

- [ ] **Step 4: Add and run Report aggregation tests**

Create a completed Run containing a `PASS` CaseResult with `judge=None` and
`tool_evidence=()`, call `ReportService.create`, and assert:

```python
assert report.status == "PASS"
assert report.summary["metrics"]["pass_rate"] == 100.0
assert report.summary["metrics"]["judge_average"] is None
assert report.summary["judge_dimensions"] == {}
assert report.summary["cases"][0]["judge"] is None
assert report.summary["cases"][0]["tool_evidence"] == []
```

Update `ReportService.create` to persist `None` for an unavailable Judge
average and `{}` for unavailable dimensions rather than numeric zeroes.

Run: `python -m pytest tests/test_eval_run_persistence.py tests/test_report_service.py -v`

Expected: PASS.

- [ ] **Step 5: Commit the status semantics**

```bash
git add src/eval_runner.py src/report_service.py tests/test_eval_run_persistence.py tests/test_report_service.py
git commit -m "fix: keep optional evaluation evidence non-blocking"
```

---

### Task 2: Persist the Permission Compliance Demo Fixture

**Files:**
- Modify: `src/demo_workspace.py`
- Modify: `src/workbench_repository.py`
- Modify: `src/sqlite_workbench.py`
- Test: `tests/test_demo_workspace.py`
- Test: `tests/test_sqlite_workbench.py`

**Interfaces:**
- Consumes: `WorkbenchRepository`, `ReportService`, `DEMO_TOOLS`, and `DEMO_CASES`.
- Produces: `WorkbenchRepository.get_current_agent_revision(agent_id: str) -> AgentRevision | None`.
- Produces: `DemoWorkspaceSeed(agent_id: str, agent_revision_id: str, dataset_id: str | None, dataset_revision_id: str | None, baseline_report_id: str | None)` and `seed_demo_workspace(repository, report_service, trace_path) -> DemoWorkspaceSeed`.
- Produces: `DemoEvalRunner.run_revision(agent_revision_id, dataset_revision_id, progress=None) -> EvalRun` as an async method compatible with `render_runs_module`.

- [ ] **Step 1: Add failing idempotent-seed tests**

Write tests using a temporary SQLite repository and Report output directory:

```python
first = seed_demo_workspace(repository, reports, tmp_path / "traces.jsonl")
second = seed_demo_workspace(repository, reports, tmp_path / "traces.jsonl")

assert second == first
assert len([a for a in repository.list_agents() if a.current_revision > 0]) == 1
assert len(repository.list_reports(first.agent_id)) == 1
baseline = repository.get_report(first.baseline_report_id)
assert baseline.summary["metrics"]["pass_rate"] == 100.0
assert len(repository.get_dataset_revision(first.dataset_revision_id).cases) == 6
```

Also seed an unrelated Agent first and assert the fixture is still created. This
proves the marker check is not implemented as "any Agent exists."

- [ ] **Step 2: Run the fixture tests and verify failure**

Run: `python -m pytest tests/test_demo_workspace.py -k "seed" -v`

Expected: FAIL because the seed API and durable baseline do not exist.

- [ ] **Step 3: Implement fixture identity and discovery**

First add the repository lookup:

```python
def get_current_agent_revision(self, agent_id: str) -> AgentRevision | None:
    agent = self.get_agent(agent_id)
    if agent.current_revision == 0:
        return None
    # SQLite implementation selects the revision_id for agent_id + revision,
    # then delegates deserialization to get_agent_revision.
```

Add this signature to `WorkbenchRepository` and cover revision-zero, current
revision, and missing-Agent behavior in `tests/test_sqlite_workbench.py`.

Add constants and a frozen result type:

```python
DEMO_FIXTURE_ID = "permission-compliance-v1"

@dataclass(frozen=True)
class DemoWorkspaceSeed:
    agent_id: str
    agent_revision_id: str
    dataset_id: str | None
    dataset_revision_id: str | None
    baseline_report_id: str | None
```

Discover the fixture by scanning valid Agents' current revisions and matching
`revision.config_snapshot.get("demo_fixture") == DEMO_FIXTURE_ID`. Ignore
revision-zero profiles. When found, use the oldest existing Report's Run to
resolve the fixture's Dataset identifiers. If history has been intentionally
removed, return `None` identifiers and do not recreate deleted Reports. When
the fixture Agent itself is absent, create the Agent, revision, draft,
published Dataset revision, baseline Run, case results, and Report through the
existing public repository/service APIs.

Use this revision snapshot:

```python
{
    "demo_fixture": DEMO_FIXTURE_ID,
    "model": "Deterministic local demo",
    "adapter": "permission-compliance",
    "judge_model": "Recorded demo judge",
}
```

- [ ] **Step 4: Implement the repository-backed local demo runner**

Move the deterministic case loop behind `DemoEvalRunner`. It must load the
provided immutable revisions, use `ToolExecutor` and `_adapter_registry()` for
actual allowed Tool calls, create blocked evidence for denied calls, persist
one `CaseResult` per case, and finish the Run.

Expose an explicit regression flag:

```python
class DemoEvalRunner:
    def __init__(self, repository, trace_path: Path, *, inject_regression: bool = True): ...

    async def run_revision(
        self, agent_revision_id: str, dataset_revision_id: str, progress=None
    ) -> EvalRun: ...
```

`inject_regression=False` creates the all-pass baseline. The normal UI runner
uses `True`, so `bypass-denied` executes after denial and produces one FAIL.
Judge and usage snapshots may use the existing deterministic demo values, but
they must be stored as real `JudgeResult` and `UsageCost` objects.

- [ ] **Step 5: Verify baseline and regression persistence**

Extend the test to run the returned fixture with `DemoEvalRunner(...,
inject_regression=True)`, create a Report, and assert:

```python
assert report.summary["metrics"]["passed_cases"] == 5
assert report.summary["metrics"]["pass_rate"] == pytest.approx(83.333, rel=1e-3)
assert len(repository.list_reports(seed.agent_id)) == 2
assert any(case["tool_evidence"] for case in report.summary["cases"])
```

Run: `python -m pytest tests/test_demo_workspace.py -v`

Expected: PASS.

- [ ] **Step 6: Commit the durable fixture**

```bash
git add src/demo_workspace.py src/workbench_repository.py src/sqlite_workbench.py tests/test_demo_workspace.py tests/test_sqlite_workbench.py
git commit -m "feat: persist the permission compliance demo"
```

---

### Task 3: Replace Nested Navigation with Stable Route State

**Files:**
- Modify: `src/ui/state.py`
- Modify: `src/ui/shell.py`
- Modify: `tests/test_ui_demo.py`
- Create: `tests/test_ui_state.py`

**Interfaces:**
- Produces: `PAGES = ("Agent", "Dataset", "Evaluation", "Report", "Settings")`.
- Produces: `init_ui_state(default_agent_id: str | None = None) -> None`.
- Produces: `navigate(page: str) -> None`, `select_agent(agent_id: str) -> None`, and `reset_demo_state(default_agent_id: str | None = None) -> None`.

- [ ] **Step 1: Write failing state tests**

Use a small `AppTest.from_string` script and assert:

```python
init_ui_state("demo-agent")
select_agent("second-agent")
assert st.session_state.selected_agent_id == "second-agent"
assert "selected_report_id" not in st.session_state
assert "selected_run_id" not in st.session_state
navigate("Dataset")
assert st.session_state.active_page == "Dataset"
reset_demo_state("demo-agent")
assert st.session_state.active_page == "Agent"
assert st.session_state.selected_agent_id == "demo-agent"
```

Add a test that `navigate("Unknown")` raises `ValueError` and that Reset does
not touch a sentinel key representing persisted state.

- [ ] **Step 2: Run the state tests and verify failure**

Run: `python -m pytest tests/test_ui_state.py -v`

Expected: FAIL because the current state uses plural routes and nested demo
module fields.

- [ ] **Step 3: Implement route and selection state**

Replace nested navigation defaults with:

```python
PAGES = ("Agent", "Dataset", "Evaluation", "Report", "Settings")
_PAGE_SELECTION_KEYS = ("selected_dataset_id", "selected_dataset_revision_id",
                        "selected_run_id", "selected_report_id")
```

`select_agent` sets the new ID, clears `_PAGE_SELECTION_KEYS`, and keeps the
user on Agent Home. `reset_demo_state` clears transient editor/review keys plus
the selection keys, resets confirmation flags, selects the fixture Agent, and
navigates to `Agent`. Remove `demo_module`, `demo_next_module`, and
`demo_report_summary` from defaults.

- [ ] **Step 4: Keep the application runnable during the route migration**

Update the shell radio to use `PAGES`. In this intermediate commit, route
`Agent` to the existing `render_agents_page` and retain a concise placeholder
for the other four pages; Task 5 replaces every placeholder with its real
renderer. Update reset assertions in `tests/test_ui_demo.py` from `Agents` to
`Agent` while retaining the still-active nested demo flow tests.

```python
page = st.radio(
    "Global navigation", PAGES, key="active_page", label_visibility="collapsed"
)
if page == "Agent":
    render_agents_page(...)
else:
    _render_placeholder(page)
```

- [ ] **Step 5: Run the tests**

Run: `python -m pytest tests/test_ui_state.py tests/test_ui_demo.py -v`

Expected: PASS, and the application still opens on Agent while the remaining
page renderers are connected in later tasks.

- [ ] **Step 6: Commit route state**

```bash
git add src/ui/state.py src/ui/shell.py tests/test_ui_state.py tests/test_ui_demo.py
git commit -m "refactor: centralize workbench route state"
```

---

### Task 4: Build Agent Home with Selector, History, and Trends

**Files:**
- Modify: `src/ui/agents.py`
- Modify: `src/ui/charts.py`
- Modify: `tests/test_ui_agents.py`

**Interfaces:**
- Consumes: `select_agent`, `navigate`, `repository.list_agents()`, `repository.list_reports(agent_id)`, and the selected Agent revision.
- Produces: `valid_agents(repository) -> list[AgentProfile]` and `render_agent_home(registry, repository, *, default_agent_id) -> None`.
- Produces: `report_history_rows(reports) -> list[dict[str, Any]]`, `quality_trend_figure(rows)`, and `cost_trend_figure(rows)`.

- [ ] **Step 1: Write failing Agent filtering and history tests**

Persist one revision-zero Agent named `test`, one valid Agent with a revision,
and two Reports. Assert:

```python
assert [agent.name for agent in valid_agents(repository)] == ["Permission Compliance Agent"]
rows = report_history_rows(repository.list_reports(agent.agent_id))
assert rows[0]["Time"] >= rows[1]["Time"]
assert rows[0]["Pass rate delta"] == pytest.approx(-16.666, rel=1e-2)
```

An AppTest of Agent Home must contain one Agent selectbox, `Target Tools`,
`Latest Report`, `Quality trend`, `Cost trend`, and `Report history`, and must
not contain `New agent`, `Add agent`, `Agent module`, or the blank `test` name.

- [ ] **Step 2: Run focused Agent UI tests and verify failure**

Run: `python -m pytest tests/test_ui_agents.py -v`

Expected: FAIL because the page currently renders Agent cards, creation, and a
nested workspace.

- [ ] **Step 3: Implement valid Agent selection and overview**

Filter profiles with `current_revision > 0`. Render a single selectbox whose
values map to persisted `agent_id`. On change, call `select_agent`. The page
then renders basic information and a read-only Target Tools table from the
current immutable revision through `repository.get_current_agent_revision`.

```python
def valid_agents(repository: WorkbenchRepository) -> list[AgentProfile]:
    return [agent for agent in repository.list_agents() if agent.current_revision > 0]


def render_agent_home(registry, repository, *, default_agent_id: str) -> None:
    agents = valid_agents(repository)
    # The selectbox stores agent_id; every panel below reads that immutable context.
    selected = repository.get_agent(st.session_state.selected_agent_id)
    revision = repository.get_current_agent_revision(selected.agent_id)
```

Do not import or call `render_demo_workspace`, `render_datasets_module`,
`render_runs_module`, or `render_reports_module` from `src/ui/agents.py`.

- [ ] **Step 4: Implement Report view models and trends**

Build history rows newest first with keys:

```python
{
    "Report ID": report.report_id,
    "Time": report.created_at,
    "Agent revision": identity["agent"]["revision"],
    "Dataset revision": identity["dataset"]["revision"],
    "Status": summary["status"],
    "Pass rate": metrics["pass_rate"],
    "Pass rate delta": current_rate - preceding_rate,
    "Cost": costs["evaluation_total"],
}
```

Render Latest Report for one or more Reports. Render Plotly quality and cost
line charts only when at least two points exist. A `View report` action sets
`selected_report_id` and calls `navigate("Report")`.

- [ ] **Step 5: Run Agent and chart tests**

Run: `python -m pytest tests/test_ui_agents.py tests/test_ui_reports.py -v`

Expected: PASS for Agent Home and existing Report helpers.

- [ ] **Step 6: Commit Agent Home**

```bash
git add src/ui/agents.py src/ui/charts.py tests/test_ui_agents.py
git commit -m "feat: add agent home history and trends"
```

---

### Task 5: Implement Real Sidebar Dispatch and Locked Agent Context

**Files:**
- Modify: `src/ui/shell.py`
- Create: `src/ui/settings_page.py`
- Create: `tests/test_ui_shell.py`

**Interfaces:**
- Consumes: `PAGES`, `navigate`, `render_agent_home`, `render_datasets_module`, `render_runs_module`, and `render_reports_module`.
- Produces: `locked_agent(repository, selected_agent_id) -> AgentProfile | None`, `render_agent_context(agent, revision)`, and a real page dispatch for every sidebar destination.
- Consumes a runner provider with signature `Callable[[str], object | None]`.

- [ ] **Step 1: Write failing sidebar routing tests**

Build an AppTest shell with a seeded repository and stub render dependencies.
For each sidebar value, set the radio and assert unique visible page text:

```python
expected = {
    "Agent": "Agent overview",
    "Dataset": "Dataset draft",
    "Evaluation": "New evaluation",
    "Report": "Report history",
    "Settings": "Environment status",
}
```

Assert that Dataset, Evaluation, and Report contain `Selected Agent` and do not
contain an Agent selector. With an invalid selected Agent, assert the route
returns to Agent and displays `Select an Agent to continue.`

- [ ] **Step 2: Run shell tests and verify failure**

Run: `python -m pytest tests/test_ui_shell.py -v`

Expected: FAIL because only Agents dispatches a real page.

- [ ] **Step 3: Replace the placeholder router**

Change the sidebar radio to `PAGES` with key `active_page`. Validate the active
Agent before any downstream dispatch. Render a shared read-only context header:

```text
Selected Agent
Permission Compliance Agent · Revision 1 · 3 Target Tools
Change Agent from Agent Home
```

Use one dispatch table, with Settings intentionally allowed without an Agent:

```python
if page == "Agent":
    render_agent_home(registry, repository, default_agent_id=default_agent_id)
elif page == "Settings":
    render_settings_page(settings_status)
else:
    agent = locked_agent(repository, st.session_state.selected_agent_id)
    if agent is None:
        navigate("Agent")
        st.warning("Select an Agent to continue.")
        st.rerun()
    render_agent_context(agent, repository.get_current_agent_revision(agent.agent_id))
    if page == "Dataset":
        render_datasets_module(repository, agent.agent_id, llm_generate)
    elif page == "Evaluation":
        render_runs_module(repository, agent.agent_id, runner_provider(agent.agent_id), report_service)
    else:
        render_reports_module(repository, agent.agent_id, report_service,
                              langfuse_base_url=langfuse_base_url)
```

Dispatch Dataset, Evaluation, and Report directly to their existing module
renderers. Resolve Evaluation's runner with `runner_provider(agent.agent_id)`.
Delete `_render_placeholder` and remove the nested `demo_trace_path` parameter
from shell rendering.

- [ ] **Step 4: Add the Settings status page**

Implement:

```python
@dataclass(frozen=True)
class SettingsStatus:
    llm: str
    langfuse: str
    database: str
    demo_fixture: str
```

`render_settings_page(status)` renders `Environment status` and four read-only
rows. Values are `Connected`, `Not configured`, `Available`, or a concise
sanitized error. Never render keys, secrets, or tokens.

- [ ] **Step 5: Run shell tests**

Run: `python -m pytest tests/test_ui_shell.py -v`

Expected: PASS.

- [ ] **Step 6: Commit the single-level shell**

```bash
git add src/ui/shell.py src/ui/settings_page.py tests/test_ui_shell.py
git commit -m "feat: route the single-flow workbench"
```

---

### Task 6: Restore Dataset and Evaluation as First-Class Pages

**Files:**
- Modify: `src/ui/datasets.py`
- Modify: `src/ui/runs.py`
- Modify: `tests/test_ui_evaluation_flow.py`

**Interfaces:**
- Consumes: locked `agent_id`, existing `CandidateGenerator`, `DatasetRegistry`, runner, and `ReportService`.
- Produces: Dataset actions that remain visible above the case list and Evaluation completion that calls `navigate("Report")`.

- [ ] **Step 1: Add failing first-class page tests**

Extend the AppTest coverage to assert the Dataset page preserves these keys:

```python
{
    "dataset_add_case",
    "dataset_generate_llm",
    "dataset_import_json",
    "dataset_complete_coverage",
    "dataset_publish",
}
```

Add a case, rerun, and assert it remains visible. Publish it and assert the
draft still contains the case. Test LLM failure with a raising generator and
assert the manual and JSON actions remain enabled.

For Evaluation, use a runner stub returning a persisted completed Run and a
ReportService stub returning a Report. Assert completion sets:

```python
assert st.session_state.active_page == "Report"
assert st.session_state.selected_report_id == report.report_id
```

- [ ] **Step 2: Run the focused tests and verify navigation failure**

Run: `python -m pytest tests/test_ui_evaluation_flow.py -v`

Expected: Dataset editor tests pass or need only key isolation; Evaluation
navigation fails because it still writes `active_agent_module`.

- [ ] **Step 3: Make Dataset widgets Agent-safe**

Scope all action and editor keys with `agent_id` and `dataset_id` so switching
Agents cannot reuse stale form state. Keep actions before the review list and
case list. Preserve existing cases after publish; publishing creates an
immutable revision but does not clear the draft.

Use this LLM boundary behavior:

```python
try:
    candidates = llm_generate(agent_id, cases)
except Exception as error:
    st.error(f"LLM generation failed: {error}")
else:
    _set_review(dataset_id, parsed_candidates, "llm")
```

The error path must not return from the page.

- [ ] **Step 4: Update Evaluation context and completion route**

Remove editable Agent selection from the module. Keep Agent and Dataset
revision selectors because they select immutable revisions belonging to the
already locked Agent. After Report creation:

```python
st.session_state.selected_run_id = run.run_id
st.session_state.selected_report_id = report.report_id
navigate("Report")
st.rerun()
```

Use `repository.get_current_agent_revision(agent_id)` as the locked Agent
revision; remove the Agent Revision selectbox. Keep the Dataset revision/source
selector because it chooses data within the locked Agent. Update copy so Judge
is described as optional supporting assessment. Required
deterministic assertions and execution failures remain authoritative.

- [ ] **Step 5: Run Dataset and Evaluation tests**

Run: `python -m pytest tests/test_ui_evaluation_flow.py tests/test_case_studio.py -v`

Expected: PASS.

- [ ] **Step 6: Commit the page flow**

```bash
git add src/ui/datasets.py src/ui/runs.py tests/test_ui_evaluation_flow.py
git commit -m "feat: restore dataset and evaluation pages"
```

---

### Task 7: Make Reports Result-First and Evidence-Optional

**Files:**
- Modify: `src/ui/reports.py`
- Modify: `src/ui/charts.py`
- Modify: `tests/test_ui_reports.py`

**Interfaces:**
- Consumes: immutable `ReportSnapshot.summary`, `ReportService.compare`, and optional `langfuse_base_url`.
- Produces: `report_view_model(summary)` with nullable Judge fields, case result counts, evidence rows, comparison inputs, token totals, and cost totals.

- [ ] **Step 1: Write failing view-model tests**

Pass a Report summary with one PASS case, `judge=None`, and empty Tool evidence.
Assert:

```python
view = report_view_model(summary)
assert view["status"] == "PASS"
assert view["cases"][0]["Status"] == "PASS"
assert view["cases"][0]["Judge score"] == "Not available"
assert view["tool_evidence"] == []
assert view["judge_available"] is False
```

Add an AppTest that inspects visible heading order and verifies:

```python
assert headings.index("Test Results") < headings.index("Tool Evidence")
assert headings.index("Tool Evidence") < headings.index("LLM Judge")
assert headings.index("LLM Judge") < headings.index("Comparison")
assert headings.index("Comparison") < headings.index("Usage & Cost")
```

- [ ] **Step 2: Run Report UI tests and verify failure**

Run: `python -m pytest tests/test_ui_reports.py -v`

Expected: FAIL because Judge absence currently displays `INCOMPLETE` and cost
appears before failure details/comparison.

- [ ] **Step 3: Rebuild `render_report_summary` in result-first order**

Render the status banner, identity, pass rate, pass/fail counts, case table, and
failure reasons under `Test Results`. PASS uses green text and FAIL uses red
text, with the literal status always present.

Render Tool Evidence next. When empty, show `Not available for this run`.
Render LLM Judge after evidence. Only construct `judge_figure` when Judge data
exists; otherwise show the same empty text. Do not render numeric `0.00/5` for
missing Judge data.

```python
st.markdown("## Test Results")
render_result_kpis(view)
render_case_results(view)
render_failure_reasons(view, langfuse_base_url)

st.markdown("## Tool Evidence")
render_tool_evidence(view) if view["tool_evidence"] else st.caption("Not available for this run")

st.markdown("## LLM Judge")
if view["judge_available"]:
    st.plotly_chart(judge_figure(view["judge_dimensions"]), width="stretch")
else:
    st.caption("Not available for this run")
```

- [ ] **Step 4: Place comparison before usage and cost**

Move comparison into the same vertical Report page rather than a top-level
`Report/Compare` tab. With at least two Reports, default baseline to the
immediately preceding Report and allow a different selection. With one Report,
render `Comparison requires at least two Reports.`

Render `Usage & Cost` last with token totals first and Agent/Judge/Dataset cost
scope below. Missing usage is displayed as `Not available`, not `$0.0000`,
unless the persisted data explicitly records zero.

```python
st.markdown("## Comparison")
render_report_comparison(repository, reports, selected, report_service)

st.markdown("## Usage & Cost")
if view["usage_available"]:
    render_usage_and_cost(view)
else:
    st.caption("Not available for this run")
```

- [ ] **Step 5: Run Report, comparison, and chart tests**

Run: `python -m pytest tests/test_ui_reports.py tests/test_report_compare.py tests/test_report_service.py -v`

Expected: PASS.

- [ ] **Step 6: Commit result-first Reports**

```bash
git add src/ui/reports.py src/ui/charts.py tests/test_ui_reports.py
git commit -m "feat: prioritize results in durable reports"
```

---

### Task 8: Wire Startup, Runner Resolution, and Non-Destructive Reset

**Files:**
- Modify: `app.py`
- Modify: `src/ui/shell.py`
- Modify: `tests/test_ui_demo.py`
- Modify: `tests/ui_smoke.py`

**Interfaces:**
- Consumes: `seed_demo_workspace`, `DemoEvalRunner`, `SettingsStatus`, and `render_shell`.
- Produces: `runner_provider(agent_id: str) -> object | None` that returns the local demo runner for the seeded Agent and the configured LLM runner for other Agents.

- [ ] **Step 1: Replace session-only demo UI tests with startup-flow tests**

Remove assertions for `demo_module`, `demo_next_module`, `demo_report_summary`,
`New agent`, and `Add tool`. Add an AppTest of `app.py` asserting:

```python
assert "Permission Compliance Agent" in visible_text(app)
assert "Latest Report" in visible_text(app)
assert "100.0%" in visible_text(app)
assert {radio.value for radio in app.radio if radio.key == "active_page"} == {"Agent"}
```

Navigate to Evaluation, run the local demo, and assert the active page becomes
Report with `5 PASS`, `1 FAIL`, and a visible comparison against the baseline.

- [ ] **Step 2: Run the startup tests and verify failure**

Run: `python -m pytest tests/test_ui_demo.py tests/ui_smoke.py -v`

Expected: FAIL because app startup still creates a session-only demo and the
old sidebar does not expose Evaluation.

- [ ] **Step 3: Seed before rendering and build the runner provider**

In `app.py`, after constructing the repository and ReportService:

```python
demo_seed = seed_demo_workspace(
    repository, report_service, settings.data_dir / "demo-tool-traces.jsonl"
)
demo_runner = DemoEvalRunner(
    repository, settings.data_dir / "demo-tool-traces.jsonl", inject_regression=True
)
configured_runner = build_runner(settings, repository)

def runner_provider(agent_id: str):
    return demo_runner if agent_id == demo_seed.agent_id else configured_runner
```

Pass `default_agent_id=demo_seed.agent_id`, `runner_provider`, generated
`SettingsStatus`, and the existing LLM generator/Langfuse base URL to the shell.

- [ ] **Step 4: Finish reset behavior and remove obsolete UI**

The Reset confirmation remains at the bottom of the sidebar. Confirming calls
`reset_demo_state(default_agent_id)`, reruns, and returns to Agent Home. Delete
the shell's import/use of `src/ui/demo.py`; keep the file only until all tests
and imports have migrated, then delete it in this step if `rg "ui.demo|render_demo_workspace"`
returns no production references.

Verify the code contains no calls to:

```python
st.cache_data.clear()
st.cache_resource.clear()
```

- [ ] **Step 5: Run startup and smoke tests**

Run: `python -m pytest tests/test_ui_demo.py tests/ui_smoke.py -v`

Expected: PASS.

- [ ] **Step 6: Commit application wiring**

```bash
git add app.py src/ui/shell.py src/ui/demo.py tests/test_ui_demo.py tests/ui_smoke.py
git commit -m "feat: wire the durable single-flow demo"
```

If `src/ui/demo.py` was deleted, stage it with `git add -u src/ui/demo.py`.

---

### Task 9: Update Documentation and Verify the Complete Demo

**Files:**
- Modify: `README.md`
- Modify: `app.py`
- Test: all files under `tests/`

**Interfaces:**
- Consumes: completed single-flow UI and existing Docker/local startup commands.
- Produces: an English operator walkthrough matching the rendered workflow.

- [ ] **Step 1: Update README startup and demo flow**

Document the exact local commands already supported by the repository, the LAN
URL behavior, and this walkthrough:

```text
1. Agent — select Permission Compliance Agent and review its baseline.
2. Dataset — review/add/import/generate cases and publish a revision.
3. Evaluation — confirm locked revisions and start the local run.
4. Report — inspect 5 PASS / 1 FAIL, evidence, Judge, comparison, then cost.
5. Reset demo — return to Agent Home without deleting history.
```

State that LLM generation is optional for Dataset editing and that Langfuse is
optional for the deterministic local demo.

- [ ] **Step 2: Run code-quality and focused semantic checks**

Run:

```bash
python -m pytest tests/test_demo_workspace.py tests/test_eval_run_persistence.py tests/test_report_service.py tests/test_ui_state.py tests/test_ui_agents.py tests/test_ui_evaluation_flow.py tests/test_ui_reports.py tests/test_ui_shell.py -v
```

Expected: PASS.

- [ ] **Step 3: Run the full automated suite**

Run: `python -m pytest -q`

Expected: all tests PASS. Record the exact count and warning summary in the
implementation handoff.

- [ ] **Step 4: Run static repository checks**

Run:

```bash
git diff --check
rg -n "demo_module|active_agent_module|render_demo_workspace|_render_placeholder|st\.cache_(data|resource)\.clear" app.py src tests
```

Expected: `git diff --check` has no output. The search has no production
matches; a test may mention a removed name only when explicitly asserting its
absence.

- [ ] **Step 5: Perform browser verification**

Start one server bound for local and LAN access:

```bash
python -m streamlit run app.py --server.address 0.0.0.0 --server.port 8501
```

Verify in the visible browser:

1. every sidebar destination opens the correct page;
2. Agent can be changed only on Agent Home;
3. the `test` placeholder is not visible;
4. Dataset actions stay above the list and a new case persists;
5. Evaluation produces a durable Report and automatically opens it;
6. Test Results appear before evidence/Judge/comparison/cost;
7. missing optional evidence renders `Not available` without changing PASS;
8. Agent Home shows baseline and regression trends after the run;
9. Reset returns to Agent Home and preserves both Reports;
10. no Streamlit Clear caches dialog appears.

- [ ] **Step 6: Commit documentation and final polish**

```bash
git add README.md app.py
git commit -m "docs: update the single-flow demo guide"
```

If browser verification required a small UI correction, include the exact
modified UI and test files in this final commit and rerun their focused tests
before committing.

---

## Completion Evidence

Before declaring the implementation complete, capture:

- focused test command and pass count;
- full `python -m pytest -q` pass count and warnings;
- `git diff --check` result;
- branch status;
- localhost and LAN URLs used for browser verification;
- a concise note confirming that Reset preserved Report history.
