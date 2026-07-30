from streamlit.testing.v1 import AppTest

from src.sqlite_workbench import SQLiteWorkbenchRepository


def visible_text(app: AppTest) -> str:
    nodes = (
        app.get("title")
        + app.get("header")
        + app.get("subheader")
        + app.get("caption")
        + app.get("markdown")
        + app.get("text")
        + app.get("info")
        + app.get("warning")
        + app.get("error")
        + app.get("metric")
    )
    return "\n".join(str(node.value) for node in nodes)


def build_full_app(tmp_path, monkeypatch):
    db = tmp_path / "workbench.db"
    monkeypatch.setenv("WORKBENCH_DB", str(db))
    return AppTest.from_file("app.py").run(timeout=30), db


def test_app_starts_on_persisted_demo_agent_home(tmp_path, monkeypatch):
    app, db = build_full_app(tmp_path, monkeypatch)

    assert not app.exception
    text = visible_text(app)
    assert "Permission Compliance Agent" in text
    assert "Latest Report" in text
    assert "100.0%" in text
    assert next(radio for radio in app.radio if radio.key == "active_page").value == "Agent"

    repository = SQLiteWorkbenchRepository(db)
    agents = [agent for agent in repository.list_agents() if agent.current_revision > 0]
    assert len(agents) == 1
    assert len(repository.list_reports(agents[0].agent_id)) == 1


def test_primary_demo_run_opens_result_first_report(tmp_path, monkeypatch):
    app, db = build_full_app(tmp_path, monkeypatch)
    app = next(radio for radio in app.radio if radio.key == "active_page").set_value(
        "Evaluation"
    ).run(timeout=30)
    app = next(button for button in app.button if button.key == "run_start").click().run(
        timeout=30
    )

    assert not app.exception
    assert next(radio for radio in app.radio if radio.key == "active_page").value == "Report"
    text = visible_text(app)
    assert "NEEDS ATTENTION" in text
    assert "Test Results" in text
    assert "Tool Evidence" in text
    assert "LLM Judge" in text
    assert "Comparison" in text
    assert "Usage & Cost" in text

    repository = SQLiteWorkbenchRepository(db)
    agent = next(agent for agent in repository.list_agents() if agent.current_revision > 0)
    reports = repository.list_reports(agent.agent_id)
    assert len(reports) == 2
    assert reports[0].summary["metrics"]["passed_cases"] == 5
    assert reports[0].summary["metrics"]["pass_rate"] == 5 / 6 * 100


def test_reset_returns_home_without_deleting_report_history(tmp_path, monkeypatch):
    app, db = build_full_app(tmp_path, monkeypatch)
    app = next(radio for radio in app.radio if radio.key == "active_page").set_value(
        "Report"
    ).run(timeout=30)
    repository = SQLiteWorkbenchRepository(db)
    agent = next(agent for agent in repository.list_agents() if agent.current_revision > 0)
    report_count = len(repository.list_reports(agent.agent_id))

    app = next(button for button in app.button if button.key == "reset_demo").click().run(
        timeout=30
    )
    assert "Reset the presentation state?" in visible_text(app)
    app = next(
        button for button in app.button if button.key == "confirm_reset_demo"
    ).click().run(timeout=30)

    assert not app.exception
    assert next(radio for radio in app.radio if radio.key == "active_page").value == "Agent"
    assert "Clear caches" not in visible_text(app)
    assert len(SQLiteWorkbenchRepository(db).list_reports(agent.agent_id)) == report_count
