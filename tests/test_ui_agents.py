from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

from src.agent_registry import AgentRegistry
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import TestCase as WorkbenchCase
from src.workbench_models import ToolBinding


def _binding(tool_id: str, name: str) -> ToolBinding:
    return ToolBinding(tool_id, name, "", "python", {}, {}, {}, {}, (), False, True)


def _summary(*, pass_rate: float, status: str = "PASS") -> dict:
    return {
        "identity": {
            "run_id": "pending",
            "agent": {"name": "Permission Compliance Agent", "revision": 1},
            "dataset": {"name": "Permissions", "revision": 1},
        },
        "status": status,
        "metrics": {"pass_rate": pass_rate},
        "costs": {"evaluation_total": 0.03},
    }


def _persist_reports(repository: SQLiteWorkbenchRepository, agent_id: str, output: Path) -> None:
    revision = repository.get_current_agent_revision(agent_id)
    assert revision is not None
    dataset_id = repository.create_dataset(agent_id, "Permissions")
    repository.replace_draft_cases(dataset_id, [WorkbenchCase("case", {"query": "test"}, {})])
    dataset = repository.publish_dataset(dataset_id)
    for pass_rate in (66.666, 50.0):
        run = repository.create_run(revision.revision_id, dataset.revision_id)
        summary = _summary(pass_rate=pass_rate)
        summary["identity"]["run_id"] = run.run_id
        repository.save_report(run.run_id, "PASS", summary, output / f"{pass_rate}.md")


def _visible_text(app: AppTest) -> str:
    nodes = (
        app.get("title")
        + app.get("header")
        + app.get("subheader")
        + app.get("caption")
        + app.get("text")
        + app.get("markdown")
        + app.get("button")
    )
    return "\n".join(str(node.value) for node in nodes)


def test_agent_home_filters_drafts_and_orders_report_history(tmp_path):
    from src.ui.agents import report_history_rows, valid_agents

    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    registry = AgentRegistry(repository)
    registry.create("test", "")
    agent = registry.create("Permission Compliance Agent", "Permission checks")
    registry.revise(
        agent.agent_id,
        {"model": "local"},
        (_binding("permission", "Permission Tool"),),
    )
    _persist_reports(repository, agent.agent_id, tmp_path)

    assert [agent.name for agent in valid_agents(repository)] == ["Permission Compliance Agent"]
    rows = report_history_rows(repository.list_reports(agent.agent_id))
    assert rows[0]["Time"] >= rows[1]["Time"]
    assert rows[0]["Pass rate delta"] == pytest.approx(-16.666, rel=1e-2)


def test_agent_trend_figures_use_history_in_chronological_order():
    from src.ui.charts import cost_trend_figure, quality_trend_figure

    rows = [
        {"Time": "2026-07-30T12:00:00+00:00", "Pass rate": 50.0, "Cost": 0.03},
        {"Time": "2026-07-30T11:00:00+00:00", "Pass rate": 66.666, "Cost": 0.02},
    ]

    quality = quality_trend_figure(rows)
    cost = cost_trend_figure(rows)

    assert list(quality.data[0].x) == [rows[1]["Time"], rows[0]["Time"]]
    assert list(quality.data[0].y) == [66.666, 50.0]
    assert list(cost.data[0].y) == [0.02, 0.03]


def test_agent_home_renders_selected_agent_overview_without_nested_modules(tmp_path, monkeypatch):
    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    registry = AgentRegistry(repository)
    registry.create("test", "")
    agent = registry.create("Permission Compliance Agent", "Permission checks")
    registry.revise(
        agent.agent_id,
        {"model": "local"},
        (_binding("permission", "Permission Tool"),),
    )
    _persist_reports(repository, agent.agent_id, tmp_path)
    monkeypatch.setenv("WORKBENCH_DB", str(db))

    app = AppTest.from_file("app.py").run(timeout=20)

    assert not app.exception
    assert len(app.selectbox) == 1
    assert app.selectbox[0].label == "Agent"
    text = _visible_text(app)
    for label in ("Target Tools", "Latest Report", "Quality trend", "Cost trend", "Report history"):
        assert label in text
    for label in ("New agent", "Add agent", "Agent module"):
        assert label not in text
    assert "\ntest\n" not in f"\n{text}\n"


def test_view_report_sets_selected_report_and_opens_report_route(tmp_path):
    from src.ui.agents import render_agent_home
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    registry = AgentRegistry(repository)
    agent = registry.create("Permission Compliance Agent", "")
    registry.revise(agent.agent_id, {}, ())
    _persist_reports(repository, agent.agent_id, tmp_path)
    script = f"""
from src.ui.agents import render_agent_home
from src.ui.state import init_ui_state
from src.sqlite_workbench import SQLiteWorkbenchRepository

repository = SQLiteWorkbenchRepository({str(tmp_path / 'workbench.db')!r})
init_ui_state({agent.agent_id!r})
render_agent_home(None, repository, default_agent_id={agent.agent_id!r})
"""

    app = AppTest.from_string(script).run(timeout=20)
    report = repository.list_reports(agent.agent_id)[0]
    next(
        button for button in app.button if button.key == f"view_report_{report.report_id}"
    ).click().run(timeout=20)

    assert app.session_state["selected_report_id"] == report.report_id
    assert app.session_state["active_page"] == "Report"
