from types import SimpleNamespace

import pytest

from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import CaseResult, RunStatus, TestCase as WorkbenchCase


def report_summary():
    return {
        "identity": {
            "run_id": "run-1",
            "started_at": "2026-07-30T00:00:00+00:00",
            "agent": {"name": "Agent One", "revision": 2},
            "dataset": {"name": "Core", "revision": 3},
        },
        "status": "NEEDS ATTENTION",
        "metrics": {
            "total_cases": 2,
            "passed_cases": 1,
            "pass_rate": 50.0,
            "judge_average": 4.25,
            "verified_tools": 1,
            "required_verifications": 1,
            "evaluation_cost_usd": 0.03,
            "dataset_generation_cost_usd": 0.01,
        },
        "judge_dimensions": {
            "correctness": 4.0,
            "relevance": 4.5,
            "completeness": 4.0,
            "safety": 4.5,
        },
        "tool_funnel": {"requested": 2, "executed": 2, "succeeded": 1, "verified": 1},
        "costs": {"agent": 0.02, "judge": 0.01, "evaluation_total": 0.03, "dataset": 0.01},
        "tokens": {"agent_input_tokens": 120},
        "cases": [
            {
                "case_id": "case-a",
                "status": "PASS",
                "trace_id": "trace-a",
                "judge": {"average": 4.5},
                "tool_evidence": [
                    {
                        "tool_id": "weather",
                        "requested": True,
                        "executed": True,
                        "succeeded": True,
                        "effect_verified": None,
                        "verification_required": False,
                    }
                ],
            },
            {
                "case_id": "case-b",
                "status": "FAIL",
                "trace_id": "trace-b",
                "judge": {"average": 4.0},
                "tool_evidence": [],
            },
        ],
        "failures": [
            {
                "case_id": "case-b",
                "status": "FAIL",
                "deterministic_reasons": {"execution": "Wrong tool"},
                "judge_reasons": {"correctness": "Incorrect"},
                "failed_tool_states": [],
                "trace_id": "trace-b",
            }
        ],
    }


def test_report_figures_use_fixed_labels_and_separate_dataset_cost():
    from src.ui.charts import cost_figure, judge_figure, tool_funnel_figure

    summary = report_summary()
    judge = judge_figure(summary["judge_dimensions"])
    funnel = tool_funnel_figure(summary["tool_funnel"])
    cost = cost_figure(summary["costs"])

    assert list(judge.data[0].y) == ["Correctness", "Relevance", "Completeness", "Safety"]
    assert list(funnel.data[0].x) == ["Requested", "Executed", "Succeeded", "Verified"]
    assert list(cost.data[0].x) == ["Agent", "Judge"]
    assert "Dataset" not in list(cost.data[0].x)


def test_report_view_model_keeps_text_statuses_and_four_state_tool_evidence():
    from src.ui.reports import report_view_model

    view = report_view_model(report_summary())

    assert [row["Status"] for row in view["cases"]] == ["PASS", "FAIL"]
    assert view["tool_evidence"][0]["Effect verification"] == "NOT REQUIRED"
    assert view["costs"] == {
        "Agent": 0.02,
        "Judge": 0.01,
        "Evaluation total": 0.03,
        "Dataset (excluded)": 0.01,
    }


def test_report_view_model_keeps_pass_result_when_optional_evidence_is_absent():
    """Removing optional Judge data must not turn a persisted PASS into INCOMPLETE."""
    from src.ui.reports import report_view_model

    summary = report_summary()
    summary["status"] = "PASS"
    summary["metrics"] = {
        "total_cases": 1,
        "passed_cases": 1,
        "pass_rate": 100.0,
        "judge_average": None,
    }
    summary["judge_dimensions"] = {}
    summary["tool_funnel"] = {}
    summary["cases"] = [{
        "case_id": "case-a",
        "status": "PASS",
        "judge": None,
        "tool_evidence": [],
    }]
    summary["failures"] = []

    view = report_view_model(summary)

    assert view["status"] == "PASS"
    assert view["cases"][0]["Status"] == "PASS"
    assert view["cases"][0]["Judge score"] == "Not available"
    assert view["tool_evidence"] == []
    assert view["judge_available"] is False


def test_report_view_model_distinguishes_missing_usage_from_persisted_zero_usage():
    """Dropping a stored cost field must not make the UI claim it was $0.0000."""
    from src.ui.reports import report_view_model

    summary = report_summary()
    summary.pop("tokens")
    summary.pop("costs")

    missing = report_view_model(summary)
    explicit_zero = report_view_model({**summary, "tokens": {"agent_input_tokens": 0}, "costs": {"agent": 0.0}})

    assert missing["usage_available"] is False
    assert missing["costs"]["Agent"] is None
    assert explicit_zero["usage_available"] is True
    assert explicit_zero["costs"]["Agent"] == 0.0


def test_report_home_is_one_native_table_row_per_report():
    """Returning to the selector-first Report detail must fail this test."""
    from streamlit.testing.v1 import AppTest

    summary = report_summary()
    script = f"""
import streamlit as st
from types import SimpleNamespace
from src.ui.reports import render_reports_module
from src.workbench_models import ReportSnapshot

summary = {summary!r}
reports = [
    ReportSnapshot("report-new", "run-new", 1, "NEEDS ATTENTION", summary, "new.md", "2026-07-30T01:00:00+00:00"),
    ReportSnapshot("report-old", "run-old", 1, "PASS", summary, "old.md", "2026-07-30T00:00:00+00:00"),
]
render_reports_module(SimpleNamespace(list_reports=lambda agent_id: reports), "agent-1")
"""

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert len(app.dataframe) == 1
    assert len(app.dataframe[0].value) == 2
    assert list(app.dataframe[0].value.columns) == [
        "Created",
        "Target revision",
        "Dataset",
        "Dataset revision",
        "Status",
        "Pass rate",
        "Evaluation cost",
        "View",
    ]
    assert not app.selectbox


def test_report_detail_has_back_and_reflect_actions():
    """A selected Report must expose compact navigation without the history selector."""
    from streamlit.testing.v1 import AppTest

    summary = report_summary()
    script = f"""
import streamlit as st
from types import SimpleNamespace
from src.ui.reports import render_reports_module
from src.workbench_models import ReportSnapshot

summary = {summary!r}
report = ReportSnapshot("report-1", "run-1", 1, "NEEDS ATTENTION", summary, "report.md", "2026-07-30T01:00:00+00:00")
st.session_state.report_view = "detail"
st.session_state.selected_report_id = report.report_id
render_reports_module(SimpleNamespace(list_reports=lambda agent_id: [report]), "agent-1")
"""

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert {button.label for button in app.button} >= {"Reports", "Reflect"}
    assert "Test Results" in "\n".join(str(node.value) for node in app.get("markdown"))
    assert not any(item.label == "Report" for item in app.selectbox)


def test_reflect_analysis_lists_agree_suggestions_and_disables_empty_submit(tmp_path):
    """Analysis must expose structured choices and never submit an empty patch."""
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Target", "")
    revision = repository.create_agent_revision(agent.agent_id, {"model": "m1", "prompt": "Answer"}, ())
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    repository.replace_draft_cases(dataset_id, [WorkbenchCase("case", {"query": "Q"}, {"expected_action": "A"})])
    dataset = repository.publish_dataset(dataset_id)
    run = repository.finish_run(repository.create_run(revision.revision_id, dataset.revision_id).run_id, RunStatus.COMPLETED)
    report = repository.save_report(run.run_id, "NEEDS ATTENTION", report_summary(), tmp_path / "report.md")
    script = f"""
import streamlit as st
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.reports import render_reports_module

st.session_state.report_view = "analysis"
st.session_state.selected_report_id = {report.report_id!r}
render_reports_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert len(app.dataframe) == 1
    assert list(app.dataframe[0].value.columns) == [
        "Agree",
        "Area",
        "Evidence",
        "Current",
        "Suggested",
    ]
    assert next(button for button in app.button if button.label == "Submit").disabled
    assert "Target Revision 3" not in "\n".join(str(node.value) for node in app.get("caption"))
    assert "Target Revision 2" in "\n".join(str(node.value) for node in app.get("caption"))


def test_report_history_shows_result_first_sections_in_vertical_order():
    """Moving section render calls out of the Report/Compare tabs must change this order."""
    from streamlit.testing.v1 import AppTest

    summary = report_summary()
    script = f"""
import streamlit as st
from types import SimpleNamespace
from src.ui.reports import render_reports_module
from src.workbench_models import ReportSnapshot

summary = {summary!r}
reports = [
    ReportSnapshot("report-new", "run-new", 1, "NEEDS ATTENTION", summary, "new.md", "2026-07-30T01:00:00+00:00"),
    ReportSnapshot("report-old", "run-old", 1, "NEEDS ATTENTION", summary, "old.md", "2026-07-30T00:00:00+00:00"),
]
comparison = SimpleNamespace(
    pass_rate_delta_shared=0.0, different_dataset_revisions=False,
    agent_changes={{}}, judge_deltas={{}}, tool_state_deltas={{}}, token_deltas={{}},
    cost_delta_usd=0.0, resolved_failure_ids=(), regression_ids=(),
    unchanged_failure_ids=(), added_case_ids=(), removed_case_ids=(), shared_case_ids=(),
)
repository = SimpleNamespace(list_reports=lambda agent_id: reports)
service = SimpleNamespace(compare=lambda baseline_id, current_id: comparison)
st.session_state.report_view = "detail"
st.session_state.selected_report_id = "report-new"
render_reports_module(repository, "agent-1", service)
"""

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    headings = [
        str(node.value).removeprefix("## ")
        for node in app.get("markdown")
        if str(node.value).removeprefix("## ") in {
            "Test Results", "Tool Evidence", "LLM Judge", "Comparison", "Usage & Cost"
        }
    ]
    assert headings.index("Test Results") < headings.index("Tool Evidence")
    assert headings.index("Tool Evidence") < headings.index("LLM Judge")
    assert headings.index("LLM Judge") < headings.index("Comparison")
    assert headings.index("Comparison") < headings.index("Usage & Cost")


def test_case_result_statuses_have_accessible_colors_with_literal_text():
    """Removing status-cell styling would make PASS/FAIL indistinguishable in the case table."""
    from src.ui.reports import case_status_style

    assert case_status_style("PASS") == "color: #176B55; font-weight: 700"
    assert case_status_style("FAIL") == "color: #B3261E; font-weight: 700"
    assert case_status_style("INCOMPLETE") == ""


def test_comparison_renders_missing_cost_delta_as_not_available():
    from streamlit.testing.v1 import AppTest

    script = """
from types import SimpleNamespace
from src.ui.reports import render_comparison

render_comparison(SimpleNamespace(
    pass_rate_delta_shared=0.0, different_dataset_revisions=False,
    agent_changes={}, judge_deltas={"correctness": None}, tool_state_deltas={},
    token_deltas={"agent_input_tokens": None}, cost_delta_usd=None,
    resolved_failure_ids=(), regression_ids=(), unchanged_failure_ids=(),
    added_case_ids=(), removed_case_ids=(), shared_case_ids=(),
))
"""

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert app.metric[2].value == "Not available"


def test_report_baseline_resets_when_selected_report_changes():
    """A stale baseline must not survive a Report selection transition."""
    from streamlit.testing.v1 import AppTest

    summary = report_summary()
    script = f"""
import streamlit as st
from types import SimpleNamespace
from src.ui.reports import render_reports_module
from src.workbench_models import ReportSnapshot

summary = {summary!r}
reports = [
    ReportSnapshot("newest", "run-newest", 1, "NEEDS ATTENTION", summary, "new.md", "2026-07-30T02:00:00+00:00"),
    ReportSnapshot("middle", "run-middle", 1, "NEEDS ATTENTION", summary, "middle.md", "2026-07-30T01:30:00+00:00"),
    ReportSnapshot("previous", "run-previous", 1, "NEEDS ATTENTION", summary, "previous.md", "2026-07-30T01:00:00+00:00"),
    ReportSnapshot("oldest", "run-oldest", 1, "NEEDS ATTENTION", summary, "old.md", "2026-07-30T00:00:00+00:00"),
]
comparison = SimpleNamespace(
    pass_rate_delta_shared=0.0, different_dataset_revisions=False,
    agent_changes={{}}, judge_deltas={{}}, tool_state_deltas={{}}, token_deltas={{}},
    cost_delta_usd=0.0, resolved_failure_ids=(), regression_ids=(),
    unchanged_failure_ids=(), added_case_ids=(), removed_case_ids=(), shared_case_ids=(),
)
repository = SimpleNamespace(list_reports=lambda agent_id: reports)
service = SimpleNamespace(compare=lambda baseline_id, current_id: comparison)
st.session_state.report_view = "detail"
st.session_state.setdefault("selected_report_id", "newest")
render_reports_module(repository, "agent-1", service)
"""

    app = AppTest.from_string(script).run(timeout=20)
    assert app.selectbox[0].value == "middle"
    app.selectbox[0].set_value("oldest").run(timeout=20)
    app.session_state.selected_report_id = "middle"
    app.run(timeout=20)
    assert app.selectbox[0].value == "previous"


def test_comparison_view_uses_shared_case_delta_and_complete_change_groups():
    from src.ui.reports import comparison_view_model

    comparison = SimpleNamespace(
        pass_rate_delta_shared=25.0,
        different_dataset_revisions=True,
        agent_changes={"model": {"before": "m1", "after": "m2"}},
        judge_deltas={"correctness": 0.5},
        tool_state_deltas={"verified": 1},
        token_deltas={"agent_input_tokens": -10},
        cost_delta_usd=-0.01,
        resolved_failure_ids=("case-a",),
        regression_ids=("case-b",),
        unchanged_failure_ids=("case-c",),
        added_case_ids=("case-d",),
        removed_case_ids=("case-e",),
        shared_case_ids=("case-a", "case-b", "case-c"),
    )

    view = comparison_view_model(comparison)

    assert view["Shared-case pass rate delta"] == pytest.approx(25.0)
    assert view["Different dataset revisions"] is True
    assert view["Resolved failures"] == ("case-a",)
    assert view["Regressions"] == ("case-b",)
    assert view["Unchanged failures"] == ("case-c",)
    assert view["Added cases"] == ("case-d",)
    assert view["Removed cases"] == ("case-e",)


def test_report_history_renders_from_sqlite_after_restart(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent One", "")
    agent_revision = repository.create_agent_revision(agent.agent_id, {"model": "m1"}, ())
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    repository.replace_draft_cases(dataset_id, [WorkbenchCase("case-a", {"query": "hello"}, {})])
    dataset_revision = repository.publish_dataset(dataset_id)
    run = repository.create_run(agent_revision.revision_id, dataset_revision.revision_id)
    repository.save_case_result(
        run.run_id,
        CaseResult("case-a", "trace-a", "answer", {}, {}, (), None, (), "PASS"),
    )
    repository.finish_run(run.run_id, RunStatus.COMPLETED)
    summary = report_summary()
    summary["identity"]["run_id"] = run.run_id
    report = repository.save_report(run.run_id, "PASS", summary, tmp_path / "report.md")
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.reports import render_reports_module

render_reports_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""

    first = AppTest.from_string(script).run(timeout=20)
    second = AppTest.from_string(script).run(timeout=20)

    assert not first.exception
    assert not second.exception
    assert report.report_id
    assert first.dataframe[0].value.iloc[0]["Status"] == "PASS"
    assert second.dataframe[0].value.iloc[0]["Status"] == "PASS"
