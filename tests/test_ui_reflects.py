from streamlit.testing.v1 import AppTest

from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import RunStatus, TestCase as WorkbenchCase


def _seed_reports(tmp_path):
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    target = repository.create_agent("Support Target", "")
    revision = repository.create_agent_revision(
        target.agent_id, {"model": "m1", "prompt": "Answer accurately"}, ()
    )
    dataset_id = repository.create_dataset(target.agent_id, "Support cases")
    repository.replace_draft_cases(
        dataset_id,
        [WorkbenchCase("case-1", {"query": "Q"}, {"expected_action": "A"})],
    )
    dataset = repository.publish_dataset(dataset_id)
    run_one = repository.finish_run(
        repository.create_run(revision.revision_id, dataset.revision_id).run_id,
        RunStatus.COMPLETED,
    )
    run_two = repository.finish_run(
        repository.create_run(revision.revision_id, dataset.revision_id).run_id,
        RunStatus.COMPLETED,
    )
    failing = repository.save_report(
        run_one.run_id,
        "NEEDS ATTENTION",
        {
            "identity": {"agent": {"name": target.name, "revision": 1}},
            "metrics": {"pass_rate": 50.0},
            "failures": [{"case_id": "case-1"}],
            "tool_funnel": {},
        },
        tmp_path / "failing.md",
    )
    passing = repository.save_report(
        run_two.run_id,
        "PASS",
        {
            "identity": {"agent": {"name": target.name, "revision": 1}},
            "metrics": {"pass_rate": 100.0},
            "failures": [],
            "tool_funnel": {},
        },
        tmp_path / "passing.md",
    )
    return repository, target, failing, passing


def test_reflect_home_lists_reports_targets_and_suggestion_summaries(tmp_path):
    """Dropping clean Reports or Target context from the global list must fail."""
    repository, target, failing, passing = _seed_reports(tmp_path)
    script = f'''\
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.reflects import render_reflect_module

render_reflect_module(SQLiteWorkbenchRepository({str(repository.db_path)!r}))
'''

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert len(app.dataframe) == 1
    table = app.dataframe[0].value
    assert list(table.columns) == [
        "Report", "Target", "Target revision", "Status", "Suggestions", "Created", "Action"
    ]
    assert set(table["Report"]) == {failing.report_id, passing.report_id}
    assert set(table["Target"]) == {target.name}
    assert "No suggestions" in set(table["Suggestions"])
    assert any("Prompt" in value for value in table["Suggestions"])


def test_reflect_action_selects_exact_target_and_opens_report_analysis(tmp_path):
    """A row action must not open a Report under the wrong Target context."""
    repository, target, failing, passing = _seed_reports(tmp_path)
    script = f'''\
import streamlit as st
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.reflects import _open_reflection

repository = SQLiteWorkbenchRepository({str(repository.db_path)!r})
st.session_state.reflect_list_actions = {{"row": 1, "label": "Reflect"}}
_open_reflection(repository, ({failing.report_id!r}, {passing.report_id!r}))
st.text(f"target={{st.session_state.selected_agent_id}}")
st.text(f"report={{st.session_state.selected_report_id}}")
st.text(f"view={{st.session_state.report_view}}")
st.text(f"page={{st.session_state.pending_page}}")
'''

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    values = {str(item.value) for item in app.text}
    assert values == {
        f"target={target.agent_id}",
        f"report={passing.report_id}",
        "view=analysis",
        "page=Report",
    }
