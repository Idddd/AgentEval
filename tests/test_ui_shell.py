"""Shell routing and selected-Agent context coverage."""
from __future__ import annotations

from streamlit.testing.v1 import AppTest

from src.agent_registry import AgentRegistry
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import ToolBinding


def _binding(tool_id: str) -> ToolBinding:
    return ToolBinding(tool_id, tool_id.title(), "", "python", {}, {}, {}, {}, (), False, True)


def _shell_script(database_path: str, agent_id: str, *, invalid_selection: bool = False) -> str:
    selected = "missing-agent" if invalid_selection else agent_id
    return f'''\
import streamlit as st
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui import shell

repository = SQLiteWorkbenchRepository({database_path!r})
st.session_state.selected_agent_id = {selected!r}
{'st.session_state.active_page = "Dataset"' if invalid_selection else ''}

def render_agent_home(registry, repository, *, default_agent_id):
    st.title("Agent overview")
    st.caption("Agent selector")

def render_datasets_module(repository, agent_id, llm_generate):
    st.subheader("Dataset draft")

def render_runs_module(repository, agent_id, runner, report_service):
    st.subheader("New evaluation")

def render_reports_module(repository, agent_id, report_service, *, langfuse_base_url=None):
    st.subheader("Report history")

originals = (
    shell.render_agent_home,
    shell.render_datasets_module,
    shell.render_runs_module,
    shell.render_reports_module,
)
shell.render_agent_home = render_agent_home
shell.render_datasets_module = render_datasets_module
shell.render_runs_module = render_runs_module
shell.render_reports_module = render_reports_module
try:
    shell.render_shell(None, repository, default_agent_id={agent_id!r})
finally:
    (
        shell.render_agent_home,
        shell.render_datasets_module,
        shell.render_runs_module,
        shell.render_reports_module,
    ) = originals
'''


def _visible_text(app: AppTest) -> str:
    nodes = (
        app.get("title")
        + app.get("header")
        + app.get("subheader")
        + app.get("caption")
        + app.get("text")
        + app.get("markdown")
        + app.get("warning")
    )
    return "\n".join(str(node.value) for node in nodes)


def _seed_repository(tmp_path):
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = AgentRegistry(repository).create("Permission Compliance Agent", "")
    AgentRegistry(repository).revise(
        agent.agent_id,
        {"model": "local"},
        (_binding("permissions"), _binding("audit"), _binding("approve")),
    )
    return repository, agent


def test_shell_dispatches_every_sidebar_destination_with_locked_agent_context(tmp_path):
    """Replacing a route handler must fail this test by removing its unique page output."""
    repository, agent = _seed_repository(tmp_path)
    app = AppTest.from_string(_shell_script(str(repository.db_path), agent.agent_id)).run(timeout=20)

    expected = {
        "Agent": "Agent overview",
        "Dataset": "Dataset draft",
        "Evaluation": "New evaluation",
        "Report": "Report history",
        "Settings": "Environment status",
    }
    navigation = next(radio for radio in app.radio if radio.key == "active_page")
    for page, page_text in expected.items():
        app = navigation.set_value(page).run(timeout=20)
        text = _visible_text(app)
        assert page_text in text
        if page in {"Dataset", "Evaluation", "Report"}:
            assert "Selected Agent" in text
            assert "Agent selector" not in text
        navigation = next(radio for radio in app.radio if radio.key == "active_page")


def test_shell_returns_invalid_selected_agent_to_agent_home_with_guidance(tmp_path):
    """Removing selected-Agent validation must expose downstream pages to missing records."""
    repository, agent = _seed_repository(tmp_path)
    app = AppTest.from_string(
        _shell_script(str(repository.db_path), agent.agent_id, invalid_selection=True)
    ).run(timeout=20)

    assert not app.exception
    assert app.session_state["active_page"] == "Agent"
    assert "Select an Agent to continue." in _visible_text(app)
