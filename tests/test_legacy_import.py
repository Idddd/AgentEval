from src.config_loader import load_tools_config
from src.legacy_import import import_legacy_agent
from src.sqlite_workbench import SQLiteWorkbenchRepository


def test_legacy_import_runs_once(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    tools_config = load_tools_config()

    first = import_legacy_agent(repo, tools_config)
    second = import_legacy_agent(repo, tools_config)

    assert first.agent_id == second.agent_id
    assert len(repo.list_agents()) == 1
    assert repo.get_agent(first.agent_id).current_revision == 1
