import json

import pytest

from src.dataset_registry import DatasetRegistry
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import RunStatus, TestCase as WorkbenchCase, ToolBinding


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
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
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
    action_keys = {
        f"dataset_add_case_{agent.agent_id}_{dataset_id}",
        f"dataset_generate_llm_{agent.agent_id}_{dataset_id}",
        f"dataset_import_json_{agent.agent_id}_{dataset_id}",
        f"dataset_complete_coverage_{agent.agent_id}_{dataset_id}",
        f"dataset_publish_{agent.agent_id}_{dataset_id}",
    }
    assert {button.key for button in app.button} >= action_keys
    assert next(
        button for button in app.button if button.key == f"dataset_publish_{agent.agent_id}_{dataset_id}"
    ).disabled


def test_dataset_add_and_publish_keep_cases_visible_with_agent_scoped_actions(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

render_datasets_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""
    app = AppTest.from_string(script).run(timeout=20)

    next(
        button
        for button in app.button
        if button.key == f"dataset_add_case_{agent.agent_id}_{dataset_id}"
    ).click().run(timeout=20)
    next(item for item in app.text_input if item.label == "Query").set_value("Created case")
    next(item for item in app.text_area if item.label == "Expected output (JSON)").set_value(
        '{"answer": "ok"}'
    )
    next(button for button in app.button if button.label == "Save case").click().run(timeout=20)

    assert "Created case" in "\n".join(str(node.value) for node in app.get("markdown"))
    next(
        button
        for button in app.button
        if button.key == f"dataset_publish_{agent.agent_id}_{dataset_id}"
    ).click().run(timeout=20)
    app.run(timeout=20)

    assert "Created case" in "\n".join(str(node.value) for node in app.get("markdown"))
    assert [case.input["query"] for case in DatasetRegistry(repository).list_draft(dataset_id)] == [
        "Created case"
    ]


def test_dataset_llm_error_keeps_manual_and_json_actions_available(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

def unavailable_generator(agent_id, cases):
    raise RuntimeError("candidate provider unavailable")

render_datasets_module(
    SQLiteWorkbenchRepository(Path({str(db)!r})),
    {agent.agent_id!r},
    unavailable_generator,
)
"""
    app = AppTest.from_string(script).run(timeout=20)
    next(
        button
        for button in app.button
        if button.key == f"dataset_generate_llm_{agent.agent_id}_{dataset_id}"
    ).click().run(timeout=20)

    assert "LLM generation failed: candidate provider unavailable" in "\n".join(
        str(node.value) for node in app.get("error")
    )
    buttons = {button.key: button for button in app.button}
    assert not buttons[f"dataset_add_case_{agent.agent_id}_{dataset_id}"].disabled
    assert not buttons[f"dataset_import_json_{agent.agent_id}_{dataset_id}"].disabled


def test_evaluation_does_not_reuse_a_published_draft_for_a_different_draft_source(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    repository.create_agent_revision(agent.agent_id, {"model": "test"}, ())
    first_draft_id = repository.create_dataset(agent.agent_id, "First draft")
    second_draft_id = repository.create_dataset(agent.agent_id, "Second draft")
    registry = DatasetRegistry(repository)
    registry.add_cases(first_draft_id, [WorkbenchCase("first", {"query": "First"}, {})])
    registry.add_cases(second_draft_id, [WorkbenchCase("second", {"query": "Second"}, {})])
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.runs import render_runs_module

class Runner:
    def run_revision(self, agent_revision_id, dataset_revision_id, progress):
        raise AssertionError("The runner must not start before the selected draft is published")

render_runs_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r}, Runner())
"""
    app = AppTest.from_string(script).run(timeout=20)
    dot = chr(0xB7)
    first_label = f"Publish current draft {dot} First draft {dot} 1 cases"
    second_label = f"Publish current draft {dot} Second draft {dot} 1 cases"

    next(select for select in app.selectbox if select.label == "Dataset source").set_value(
        first_label
    ).run(timeout=20)
    next(button for button in app.button if button.key == "run_publish_dataset").click().run(timeout=20)
    next(select for select in app.selectbox if select.label == "Dataset source").set_value(
        second_label
    ).run(timeout=20)

    assert next(button for button in app.button if button.key == "run_start").disabled


def test_completed_evaluation_routes_to_its_persisted_report(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    agent_revision = repository.create_agent_revision(agent.agent_id, {"model": "test"}, ())
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    DatasetRegistry(repository).add_cases(
        dataset_id, [WorkbenchCase("case", {"query": "Evaluate"}, {})]
    )
    dataset_revision = DatasetRegistry(repository).publish(dataset_id)
    completed_run = repository.finish_run(
        repository.create_run(agent_revision.revision_id, dataset_revision.revision_id).run_id,
        RunStatus.COMPLETED,
    )
    script = f"""
from pathlib import Path
from src.report_service import ReportService
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.runs import render_runs_module
from src.ui.state import init_ui_state

class CompletedRunner:
    def run_revision(self, agent_revision_id, dataset_revision_id, progress):
        return SQLiteWorkbenchRepository(Path({str(db)!r})).get_run({completed_run.run_id!r})

init_ui_state({agent.agent_id!r})
render_runs_module(
    SQLiteWorkbenchRepository(Path({str(db)!r})),
    {agent.agent_id!r},
    CompletedRunner(),
    ReportService(SQLiteWorkbenchRepository(Path({str(db)!r})), Path({str(tmp_path / 'reports')!r})),
)
"""
    app = AppTest.from_string(script).run(timeout=20)
    next(button for button in app.button if button.key == "run_start").click().run(timeout=20)
    report = repository.list_reports(agent.agent_id)[0]

    assert app.session_state["active_page"] == "Report"
    assert app.session_state["selected_report_id"] == report.report_id


def test_evaluation_does_not_route_to_a_report_that_was_not_persisted(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    agent_revision = repository.create_agent_revision(agent.agent_id, {"model": "test"}, ())
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    DatasetRegistry(repository).add_cases(
        dataset_id, [WorkbenchCase("case", {"query": "Evaluate"}, {})]
    )
    dataset_revision = DatasetRegistry(repository).publish(dataset_id)
    completed_run = repository.finish_run(
        repository.create_run(agent_revision.revision_id, dataset_revision.revision_id).run_id,
        RunStatus.COMPLETED,
    )
    script = f"""
from pathlib import Path
from types import SimpleNamespace
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.runs import render_runs_module
from src.ui.state import init_ui_state

class CompletedRunner:
    def run_revision(self, agent_revision_id, dataset_revision_id, progress):
        return SQLiteWorkbenchRepository(Path({str(db)!r})).get_run({completed_run.run_id!r})

class NonPersistingReportService:
    def create(self, run_id):
        return SimpleNamespace(report_id="not-persisted")

init_ui_state({agent.agent_id!r})
render_runs_module(
    SQLiteWorkbenchRepository(Path({str(db)!r})),
    {agent.agent_id!r},
    CompletedRunner(),
    NonPersistingReportService(),
)
"""
    app = AppTest.from_string(script).run(timeout=20)
    next(button for button in app.button if button.key == "run_start").click().run(timeout=20)

    assert app.session_state["active_page"] == "Agent"
    assert "Report was not persisted for this completed run." in "\n".join(
        str(node.value) for node in app.get("error")
    )


def test_evaluation_does_not_route_to_a_report_for_a_failed_persisted_run(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    agent_revision = repository.create_agent_revision(agent.agent_id, {"model": "test"}, ())
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    DatasetRegistry(repository).add_cases(
        dataset_id, [WorkbenchCase("case", {"query": "Evaluate"}, {})]
    )
    dataset_revision = DatasetRegistry(repository).publish(dataset_id)
    failed_run = repository.finish_run(
        repository.create_run(agent_revision.revision_id, dataset_revision.revision_id).run_id,
        RunStatus.FAILED,
    )
    persisted_report = repository.save_report(
        failed_run.run_id, "INCOMPLETE", {}, tmp_path / "failed-run-report.md"
    )
    script = f"""
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.runs import render_runs_module
from src.ui.state import init_ui_state
from src.workbench_models import RunStatus

class MisleadingRunner:
    def run_revision(self, agent_revision_id, dataset_revision_id, progress):
        stored_run = SQLiteWorkbenchRepository(Path({str(db)!r})).get_run({failed_run.run_id!r})
        return replace(stored_run, status=RunStatus.COMPLETED)

class PersistedReportService:
    def create(self, run_id):
        return SimpleNamespace(report_id={persisted_report.report_id!r})

init_ui_state({agent.agent_id!r})
render_runs_module(
    SQLiteWorkbenchRepository(Path({str(db)!r})),
    {agent.agent_id!r},
    MisleadingRunner(),
    PersistedReportService(),
)
"""
    app = AppTest.from_string(script).run(timeout=20)
    next(button for button in app.button if button.key == "run_start").click().run(timeout=20)

    assert app.session_state["active_page"] == "Agent"
    assert app.session_state["selected_run_id"] == failed_run.run_id
    assert "Report was not persisted for this completed run." in "\n".join(
        str(node.value) for node in app.get("error")
    )
