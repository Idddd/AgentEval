import pytest

from src.agent_registry import AgentRegistry
from src.config_loader import load_tools_config
from src.legacy_import import import_legacy_agent
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import ToolBinding


def test_editing_tools_creates_a_new_agent_revision(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    service = AgentRegistry(repo)
    agent = service.create("Configurable Agent", "")
    first = service.revise(agent.agent_id, {"model": "m1"}, ())
    tool = ToolBinding("t1", "Lookup", "", "python", {}, {}, {}, {}, (), False, True)
    second = service.revise(agent.agent_id, {"model": "m1"}, (tool,))

    assert (first.revision, second.revision) == (1, 2)
    assert first.tools == ()
    assert second.tools == (tool,)


def test_create_requires_non_empty_trimmed_agent_name(tmp_path):
    service = AgentRegistry(SQLiteWorkbenchRepository(tmp_path / "workbench.db"))

    with pytest.raises(ValueError, match="agent name must not be empty"):
        service.create("  ", "description")


def test_revision_rejects_duplicate_tool_ids(tmp_path):
    service = AgentRegistry(SQLiteWorkbenchRepository(tmp_path / "workbench.db"))
    agent = service.create("Agent", "")
    tool = ToolBinding("same", "Lookup", "", "python", {}, {}, {}, {}, (), False, True)

    with pytest.raises(ValueError, match="tool IDs must be unique"):
        service.revise(agent.agent_id, {}, (tool, tool))


def test_legacy_import_is_idempotent_and_creates_one_revision(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    config = load_tools_config()

    first = import_legacy_agent(repo, config)
    second = import_legacy_agent(repo, config)

    assert first.agent_id == second.agent_id
    assert len(repo.list_agents()) == 1
    assert repo.get_agent(first.agent_id).current_revision == 1
