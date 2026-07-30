from src.agent_registry import AgentRegistry
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import ToolBinding
from streamlit.testing.v1 import AppTest


def visible_text(app):
    nodes = (
        app.get("title")
        + app.get("header")
        + app.get("subheader")
        + app.get("text")
        + app.get("markdown")
    )
    return "\n".join(str(node.value) for node in nodes)


def binding(tool_id, name):
    return ToolBinding(tool_id, name, "", "python", {}, {}, {}, {}, (), False, True)


def test_agents_page_and_tool_switching(tmp_path, monkeypatch):
    db = tmp_path / "workbench.db"
    repo = SQLiteWorkbenchRepository(db)
    registry = AgentRegistry(repo)
    one = registry.create("Agent One", "")
    registry.revise(one.agent_id, {}, (binding("one", "Tool One"),))
    two = registry.create("Agent Two", "")
    registry.revise(two.agent_id, {}, (binding("two", "Tool Two"),))
    monkeypatch.setenv("WORKBENCH_DB", str(db))

    app = AppTest.from_file("app.py").run(timeout=20)

    assert not app.exception
    assert "Agents" in visible_text(app)
    assert "Agent One" in visible_text(app)
    assert "Tool One" in visible_text(app)
    next(
        button for button in app.button if button.key == f"select_agent_{two.agent_id}"
    ).click().run(timeout=20)
    assert "Tool Two" in visible_text(app)
    assert "Tool One" not in visible_text(app)
    assert "Reset Demo" not in visible_text(app)
    assert "Roadmap" not in visible_text(app)
