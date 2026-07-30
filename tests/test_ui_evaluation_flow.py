import json

import pytest

from src.dataset_registry import DatasetRegistry
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import TestCase as WorkbenchCase, ToolBinding


def binding(
    tool_id: str, *, enabled: bool = True, connection_type: str = "python"
) -> ToolBinding:
    return ToolBinding(
        tool_id,
        tool_id.title(),
        "",
        connection_type,
        {},
        {},
        {},
        {},
        ("Exercise the happy path",),
        False,
        enabled,
    )


def test_json_import_adds_reviewed_cases_without_replacing_the_draft(tmp_path):
    from src.ui.datasets import add_imported_cases

    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repository.create_agent("Agent", "")
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    registry = DatasetRegistry(repository)
    registry.add_cases(dataset_id, [WorkbenchCase("existing", {"query": "Existing"}, {})])

    added = add_imported_cases(
        registry,
        dataset_id,
        json.dumps(
            [
                {
                    "case_id": "imported",
                    "input": {"query": "Imported"},
                    "expected_output": {"answer": "ok"},
                    "tags": ["smoke"],
                }
            ]
        ),
    )

    assert [case.case_id for case in registry.list_draft(dataset_id)] == [
        "existing",
        "imported",
    ]
    assert added[0].tags == ("smoke",)


def test_json_import_rejects_non_array_payload(tmp_path):
    from src.ui.datasets import add_imported_cases

    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repository.create_agent("Agent", "")
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")

    with pytest.raises(ValueError, match="JSON array"):
        add_imported_cases(DatasetRegistry(repository), dataset_id, '{"query": "x"}')


def test_run_readiness_lists_disabled_and_missing_tools():
    from src.ui.runs import unavailable_case_tools

    cases = (
        WorkbenchCase("one", {"query": "One"}, {"expected_tool_called": "weather"}),
        WorkbenchCase("two", {"query": "Two"}, {"expected_tool_called": "payments"}),
        WorkbenchCase("three", {"query": "Three"}, {"expected_tool_called": None}),
        WorkbenchCase("four", {"query": "Four"}, {"expected_tool_called": "mystery"}),
    )

    assert unavailable_case_tools(
        cases,
        (binding("weather", enabled=False), binding("mystery", connection_type="custom")),
    ) == (
        "mystery",
        "payments",
        "weather",
    )


def test_dataset_empty_state_exposes_all_add_actions(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

render_datasets_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""
    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    nodes = app.get("markdown") + app.get("text") + app.get("subheader")
    text = "\n".join(str(node.value) for node in nodes)
    assert "No cases in the current draft" in text
    assert {button.key for button in app.button} >= {
        "dataset_add_case",
        "dataset_generate_llm",
        "dataset_import_json",
        "dataset_complete_coverage",
        "dataset_publish",
    }
    assert next(button for button in app.button if button.key == "dataset_publish").disabled
