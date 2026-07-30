from streamlit.testing.v1 import AppTest

from src.sqlite_workbench import SQLiteWorkbenchRepository


def visible_text(app):
    nodes = (
        app.get("title")
        + app.get("header")
        + app.get("subheader")
        + app.get("caption")
        + app.get("markdown")
        + app.get("text")
        + app.get("info")
    )
    return "\n".join(str(node.value) for node in nodes)


def build_demo_app(tmp_path):
    script = f'''\
from pathlib import Path
from src.ui.state import init_ui_state
from src.ui.demo import render_demo_workspace
init_ui_state()
render_demo_workspace(Path({str(tmp_path / "traces.jsonl")!r}))
'''
    return AppTest.from_string(script).run(timeout=20)


def build_full_app(tmp_path, monkeypatch):
    db = tmp_path / "workbench.db"
    monkeypatch.setenv("WORKBENCH_DB", str(db))
    return AppTest.from_file("app.py").run(timeout=20), db


def test_demo_workspace_opens_on_tools_with_preview_controls(tmp_path):
    app = build_demo_app(tmp_path)
    text = visible_text(app)
    assert not app.exception
    assert "Permission Compliance Agent" in text
    assert "Demo" in text
    assert "WeatherTool" in text
    assert "EmployeeQueryTool" in text
    assert "SystemRestartTool" in text
    assert {button.key for button in app.button} >= {
        "demo_edit_agent",
        "demo_add_tool",
        "demo_new_agent",
    }


def test_demo_flow_reaches_complete_report(tmp_path):
    app = build_demo_app(tmp_path)
    module = next(radio for radio in app.radio if radio.key == "demo_module")
    app = module.set_value("Dataset").run(timeout=20)
    assert "Permission Compliance Regression" in visible_text(app)
    assert "6 test cases" in visible_text(app)
    assert "Blocked before Tool execution" in visible_text(app)

    app = next(radio for radio in app.radio if radio.key == "demo_module").set_value(
        "Evaluation"
    ).run(timeout=20)
    assert "Deterministic checks" in visible_text(app)
    assert "LLM-as-a-Judge" in visible_text(app)
    app = next(button for button in app.button if button.key == "demo_run").click().run(
        timeout=20
    )
    text = visible_text(app)
    assert "Demo evaluation" in text
    assert "NEEDS ATTENTION" in text
    assert "PASS" in text
    assert "FAIL" in text
    assert "demo-safe" in text
    assert "demo-blocked" in text
    assert "Tool execution evidence" in text
    assert "Agent and Judge costs" in text


def test_preview_control_does_not_create_agent(tmp_path):
    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    repository.create_agent("Existing Agent", "")
    before = repository.list_agents()

    app = build_demo_app(tmp_path)
    app = next(
        button for button in app.button if button.key == "demo_new_agent"
    ).click().run(timeout=20)

    after = SQLiteWorkbenchRepository(db).list_agents()
    assert before == after
    assert "Configuration UI preview" in visible_text(app)


def test_reset_demo_state_restores_session_without_deleting_agents(tmp_path):
    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Keep Me", "")
    script = '''\
import streamlit as st
from src.ui.state import init_ui_state, reset_demo_state
init_ui_state("demo-permission-compliance")
st.session_state.selected_agent_id = "other"
st.session_state.active_page = "Report"
st.session_state.demo_module = "Report"
st.session_state.demo_next_module = "Evaluation"
st.session_state.demo_report_summary = {"status": "PASS"}
st.session_state.demo_preview_notice = "open"
st.session_state.demo_reset_confirm = True
reset_demo_state("demo-permission-compliance")
st.write(st.session_state.selected_agent_id)
st.write(st.session_state.active_page)
st.write(st.session_state.demo_module)
st.write(str(st.session_state.demo_report_summary))
st.write(str(st.session_state.demo_preview_notice))
st.write(str(st.session_state.demo_reset_confirm))
'''

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert "demo-permission-compliance" in visible_text(app)
    assert "Agent" in visible_text(app)
    assert "Tools" in visible_text(app)
    assert SQLiteWorkbenchRepository(db).get_agent(agent.agent_id) == agent


def test_bottom_reset_requires_confirmation_and_restores_demo(tmp_path, monkeypatch):
    app, _ = build_full_app(tmp_path, monkeypatch)
    app = next(r for r in app.radio if r.key == "demo_module").set_value(
        "Dataset"
    ).run(timeout=20)
    app = next(b for b in app.button if b.key == "reset_demo").click().run(
        timeout=20
    )
    assert "Reset the presentation state?" in visible_text(app)
    assert {button.key for button in app.button} >= {
        "confirm_reset_demo",
        "cancel_reset_demo",
    }
    assert next(r for r in app.radio if r.key == "demo_module").value == "Dataset"
    app = next(
        button for button in app.button if button.key == "confirm_reset_demo"
    ).click().run(timeout=20)
    assert next(r for r in app.radio if r.key == "demo_module").value == "Tools"
    assert "Clear caches" not in visible_text(app)
