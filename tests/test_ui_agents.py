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


def _render_home_script(db: Path, agent_id: str, setup: str = "") -> str:
    return f"""
import streamlit as st
from src.ui.agents import render_agent_home
from src.ui.state import init_ui_state, select_agent
from src.sqlite_workbench import SQLiteWorkbenchRepository

repository = SQLiteWorkbenchRepository({str(db)!r})
init_ui_state({agent_id!r})
{setup}
render_agent_home(None, repository, default_agent_id={agent_id!r})
"""


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


def test_target_home_is_filterable_native_list_with_compact_create(tmp_path):
    """Regressing to the selector-first detail page must fail this test."""
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    registry = AgentRegistry(repository)
    first = registry.create("Model only", "")
    registry.revise(first.agent_id, {"model": {"id": "local", "name": "Local"}}, ())
    second = registry.create("Prompt target", "")
    registry.revise(
        second.agent_id,
        {"model": {"id": "local", "name": "Local"}, "prompt": "Be concise"},
        (),
    )

    app = AppTest.from_string(
        _render_home_script(tmp_path / "workbench.db", first.agent_id)
    ).run(timeout=20)

    assert not app.exception
    assert len(app.dataframe) == 1
    assert list(app.dataframe[0].value["Target"]) == ["Model only", "Prompt target"]
    assert next(item for item in app.selectbox if item.label == "Target filter").value == (
        "All targets"
    )
    assert len([button for button in app.button if button.label == "Create"]) == 1
    assert "Latest Report" not in _visible_text(app)


def test_target_filter_limits_list_by_revision_scope(tmp_path):
    """Ignoring the selected scope must not leave unrelated Targets visible."""
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    registry = AgentRegistry(repository)
    model_only = registry.create("Model only", "")
    registry.revise(model_only.agent_id, {"model": "local"}, ())
    with_kb = registry.create("With KB", "")
    registry.revise(
        with_kb.agent_id,
        {"model": "local", "knowledge_bases": [{"id": "kb"}]},
        (),
    )
    app = AppTest.from_string(
        _render_home_script(tmp_path / "workbench.db", model_only.agent_id)
    ).run(timeout=20)

    app = next(item for item in app.selectbox if item.label == "Target filter").set_value(
        "With KB"
    ).run(timeout=20)

    assert list(app.dataframe[0].value["Target"]) == ["With KB"]


def test_create_target_is_modular_and_hides_target_list(tmp_path):
    """Create must be a dedicated form, not content appended below the list."""
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    registry = AgentRegistry(repository)
    agent = registry.create("Existing", "")
    registry.revise(agent.agent_id, {"model": "local"}, ())
    app = AppTest.from_string(
        _render_home_script(tmp_path / "workbench.db", agent.agent_id)
    ).run(timeout=20)

    app = next(button for button in app.button if button.label == "Create").click().run(
        timeout=20
    )
    visible = _visible_text(app)

    assert not app.exception
    assert len(app.dataframe) == 0
    for heading in (
        "Target information",
        "Model",
        "Prompt",
        "Resources",
        "Revision preview",
    ):
        assert heading in visible
    assert {item.label for item in app.multiselect} >= {
        "Tools",
        "MCP servers",
        "Knowledge bases",
    }
    assert (
        "Authentication is not stored in Target. Supply Tool, MCP, and KB "
        "authorization through the Dataset `header` field."
    ) in visible


def test_cancel_create_target_clears_transient_form_values(tmp_path):
    """Cancel and reopen must not resurrect a discarded Target name."""
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    registry = AgentRegistry(repository)
    agent = registry.create("Existing", "")
    registry.revise(agent.agent_id, {"model": "local"}, ())
    app = AppTest.from_string(
        _render_home_script(tmp_path / "workbench.db", agent.agent_id)
    ).run(timeout=20)
    app = next(button for button in app.button if button.label == "Create").click().run(
        timeout=20
    )
    app = next(item for item in app.text_input if item.label == "Name *").set_value(
        "Discard me"
    ).run(timeout=20)
    app = next(button for button in app.button if button.label == "Cancel").click().run(
        timeout=20
    )
    app = next(button for button in app.button if button.label == "Create").click().run(
        timeout=20
    )

    assert next(item for item in app.text_input if item.label == "Name *").value == ""


def test_model_only_create_persists_revision_and_opens_detail(tmp_path):
    """A valid Model-only form must atomically create Revision 1 and open it."""
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    registry = AgentRegistry(repository)
    existing = registry.create("Existing", "")
    registry.revise(existing.agent_id, {"model": "local"}, ())
    app = AppTest.from_string(
        _render_home_script(tmp_path / "workbench.db", existing.agent_id)
    ).run(timeout=20)
    app = next(button for button in app.button if button.label == "Create").click().run(
        timeout=20
    )
    next(item for item in app.text_input if item.label == "Name *").set_value(
        "New model benchmark"
    )
    next(item for item in app.selectbox if item.label == "Model *").set_value(
        "gpt-5.1"
    )
    app = next(
        button for button in app.button if button.label == "Create target revision"
    ).click().run(timeout=20)

    created = next(agent for agent in repository.list_agents() if agent.name == "New model benchmark")
    revision = repository.get_current_agent_revision(created.agent_id)
    assert revision is not None
    assert revision.revision == 1
    assert revision.config_snapshot["model"]["id"] == "gpt-5.1"
    assert app.session_state["selected_agent_id"] == created.agent_id
    assert "New model benchmark" in _visible_text(app)
    assert "Component" in list(app.dataframe[0].value.columns)


def test_create_target_persists_multiple_catalog_resources(tmp_path):
    """Dropping all but one Tool, MCP, or KB selection must fail this test."""
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    registry = AgentRegistry(repository)
    existing = registry.create("Existing", "")
    registry.revise(existing.agent_id, {"model": "local"}, ())
    app = AppTest.from_string(
        _render_home_script(tmp_path / "workbench.db", existing.agent_id)
    ).run(timeout=20)
    app = next(button for button in app.button if button.label == "Create").click().run(
        timeout=20
    )
    next(item for item in app.text_input if item.label == "Name *").set_value(
        "Combined target"
    )
    next(item for item in app.selectbox if item.label == "Model *").set_value(
        "gpt-5.1"
    )
    tools = next(item for item in app.multiselect if item.label == "Tools")
    mcps = next(item for item in app.multiselect if item.label == "MCP servers")
    kbs = next(item for item in app.multiselect if item.label == "Knowledge bases")
    tools.set_value(list(tools.options[:2]))
    mcps.set_value(list(mcps.options[:2]))
    kbs.set_value(list(kbs.options[:2]))
    app = next(
        button for button in app.button if button.label == "Create target revision"
    ).click().run(timeout=20)

    created = next(agent for agent in repository.list_agents() if agent.name == "Combined target")
    revision = repository.get_current_agent_revision(created.agent_id)
    assert revision is not None
    assert len(revision.tools) == 2
    assert len(revision.config_snapshot["mcp_servers"]) == 2
    assert len(revision.config_snapshot["knowledge_bases"]) == 2
    assert not app.exception


def test_target_detail_has_component_table_back_and_evaluate(tmp_path):
    """Detail must stay compact and Evaluate the selected Target."""
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    registry = AgentRegistry(repository)
    agent = registry.create("Target detail", "Inspect me")
    registry.revise(
        agent.agent_id,
        {"model": {"id": "local", "name": "Local"}, "prompt": "Be safe"},
        (_binding("permission", "Permission Tool"),),
    )
    script = _render_home_script(
        tmp_path / "workbench.db",
        agent.agent_id,
        "st.session_state.target_view = 'detail'",
    )
    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert list(app.dataframe[0].value["Component"]) == [
        "Model",
        "Prompt",
        "Tools",
        "MCP",
        "KB",
    ]
    assert {button.label for button in app.button} >= {"Targets", "Evaluate"}

    app = next(button for button in app.button if button.label == "Evaluate").click().run(
        timeout=20
    )
    assert app.session_state["selected_agent_id"] == agent.agent_id
    assert app.session_state["active_page"] == "Evaluation"


def test_target_detail_accepts_legacy_scalar_mcp_and_kb_entries(tmp_path):
    """Legacy string resources must render instead of crashing on `.get()`."""
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    registry = AgentRegistry(repository)
    agent = registry.create("Legacy resources", "")
    registry.revise(
        agent.agent_id,
        {
            "model": "local",
            "mcp_servers": ["legacy-mcp"],
            "knowledge_bases": ["legacy-kb"],
        },
        (),
    )
    app = AppTest.from_string(_render_home_script(
        tmp_path / "workbench.db",
        agent.agent_id,
        "st.session_state.target_view = 'detail'",
    )).run(timeout=20)

    assert not app.exception
    selections = dict(
        zip(app.dataframe[0].value["Component"], app.dataframe[0].value["Selection"])
    )
    assert selections["MCP"] == "legacy-mcp"
    assert selections["KB"] == "legacy-kb"


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


def test_agent_home_keeps_external_selection_when_selector_state_is_stale(tmp_path):
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    registry = AgentRegistry(repository)
    first = registry.create("First", "")
    registry.revise(first.agent_id, {}, ())
    second = registry.create("Second", "")
    registry.revise(second.agent_id, {}, ())

    script = _render_home_script(
        tmp_path / "workbench.db",
        first.agent_id,
        f"st.session_state.agent_selector = {first.agent_id!r}\nselect_agent({second.agent_id!r})",
    )
    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert app.session_state["selected_agent_id"] == second.agent_id
    assert app.selectbox[0].label == "Target filter"
    assert app.selectbox[0].value == "All targets"


def test_agent_home_detail_uses_durable_selected_agent(tmp_path):
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    registry = AgentRegistry(repository)
    first = registry.create("First", "")
    registry.revise(first.agent_id, {}, ())
    second = registry.create("Second", "")
    registry.revise(second.agent_id, {}, ())

    app = AppTest.from_string(_render_home_script(
        tmp_path / "workbench.db",
        first.agent_id,
        f"select_agent({second.agent_id!r})\nst.session_state.target_view = 'detail'",
    )).run(timeout=20)

    assert not app.exception
    assert app.session_state["selected_agent_id"] == second.agent_id
    assert "Second" in _visible_text(app)


def test_report_history_keeps_unknown_cost_and_cost_chart_omits_it(tmp_path):
    from src.ui.agents import report_history_rows
    from src.ui.charts import cost_trend_figure

    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    registry = AgentRegistry(repository)
    agent = registry.create("Permission Compliance Agent", "")
    revision = registry.revise(agent.agent_id, {}, ())
    dataset_id = repository.create_dataset(agent.agent_id, "Permissions")
    repository.replace_draft_cases(dataset_id, [WorkbenchCase("case", {"query": "test"}, {})])
    dataset = repository.publish_dataset(dataset_id)
    for pass_rate, cost in ((75.0, 0.02), (50.0, None), (25.0, 0.03)):
        run = repository.create_run(revision.revision_id, dataset.revision_id)
        summary = _summary(pass_rate=pass_rate)
        summary["identity"]["run_id"] = run.run_id
        if cost is None:
            summary.pop("costs")
        else:
            summary["costs"]["evaluation_total"] = cost
        repository.save_report(run.run_id, "PASS", summary, tmp_path / f"{pass_rate}.md")

    rows = report_history_rows(repository.list_reports(agent.agent_id))
    assert rows[1]["Cost"] is None
    cost = cost_trend_figure(rows)
    assert list(cost.data[0].y) == [0.02, 0.03]


def test_agent_home_displays_unknown_latest_cost_and_hides_insufficient_cost_trend(tmp_path):
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    registry = AgentRegistry(repository)
    agent = registry.create("Permission Compliance Agent", "")
    revision = registry.revise(agent.agent_id, {}, ())
    dataset_id = repository.create_dataset(agent.agent_id, "Permissions")
    repository.replace_draft_cases(dataset_id, [WorkbenchCase("case", {"query": "test"}, {})])
    dataset = repository.publish_dataset(dataset_id)
    for pass_rate, include_cost in ((66.666, True), (50.0, False)):
        run = repository.create_run(revision.revision_id, dataset.revision_id)
        summary = _summary(pass_rate=pass_rate)
        summary["identity"]["run_id"] = run.run_id
        if not include_cost:
            summary.pop("costs")
        repository.save_report(run.run_id, "PASS", summary, tmp_path / f"{pass_rate}.md")

    app = AppTest.from_string(
        _render_home_script(
            tmp_path / "workbench.db",
            agent.agent_id,
            "st.session_state.target_view = 'detail'",
        )
    ).run(timeout=20)

    assert not app.exception
    assert next(metric for metric in app.metric if metric.label == "Evaluation cost").value == "Not available"
    assert not any(chart.key == "agent_cost_trend" for chart in app.get("plotly_chart"))


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
    assert app.selectbox[0].label == "Target filter"
    text = _visible_text(app)
    assert "Permission Compliance Agent" in list(app.dataframe[0].value["Target"])
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
import streamlit as st
from src.ui.agents import render_agent_home
from src.ui.state import init_ui_state
from src.sqlite_workbench import SQLiteWorkbenchRepository

repository = SQLiteWorkbenchRepository({str(tmp_path / 'workbench.db')!r})
init_ui_state({agent.agent_id!r})
st.session_state.target_view = "detail"
render_agent_home(None, repository, default_agent_id={agent.agent_id!r})
"""

    app = AppTest.from_string(script).run(timeout=20)
    report = repository.list_reports(agent.agent_id)[0]
    next(
        button for button in app.button if button.key == f"view_report_{report.report_id}"
    ).click().run(timeout=20)

    assert app.session_state["selected_report_id"] == report.report_id
    assert app.session_state["active_page"] == "Report"
