import json

import pytest

from src.dataset_registry import DatasetRegistry
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import (
    DatasetColumn,
    DatasetSchema,
    RunStatus,
    TestCase as WorkbenchCase,
    ToolBinding,
)


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


def open_dataset(app, agent_id, dataset_id):
    app.session_state.selected_dataset_id = dataset_id
    app.session_state[f"dataset_view_{agent_id}"] = "draft"
    return app.run(timeout=20)


def test_dataset_list_is_a_native_table_with_create_action(tmp_path):
    """A responsive table must replace the wrapping hand-built column grid."""
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    repository.create_dataset(agent.agent_id, "Dataset")
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

render_datasets_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""
    app = AppTest.from_string(script).run(timeout=20)

    assert len(app.dataframe) == 1
    assert app.dataframe[0].value.iloc[0]["Name"] == "Dataset"
    assert list(app.dataframe[0].value.columns)[-1] == "View"
    assert app.dataframe[0].value.iloc[0]["View"] == "View"
    assert "Open" not in app.dataframe[0].value.columns
    assert "Create" in [button.label for button in app.button]


def test_dataset_detail_uses_compact_actions_and_tab_navigation(tmp_path):
    """Catch regressions to oversized controls and the long Evaluate label."""
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    registry = DatasetRegistry(repository)
    registry.add_cases(
        dataset_id,
        [WorkbenchCase("one", {"query": "One"}, {"expected_action": "Reply"})],
    )
    registry.publish(dataset_id)
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

render_datasets_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""
    app = open_dataset(AppTest.from_string(script).run(timeout=20), agent.agent_id, dataset_id)

    labels = [button.label for button in app.button]
    assert all(label in labels for label in ("Evaluate", "Publish", "Datasets"))
    assert "Back" not in labels
    assert "Evaluate published revision" not in labels
    assert [control.label for control in app.segmented_control] == ["Dataset view"]


def test_dataset_cases_render_one_dataframe_row_per_case(tmp_path):
    """Removing the table or returning to per-case cards must fail this test."""
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    DatasetRegistry(repository).add_cases(
        dataset_id,
        [
            WorkbenchCase("one", {"query": "One"}, {"expected_action": "First"}),
            WorkbenchCase("two", {"query": "Two"}, {"expected_action": "Second"}),
        ],
    )
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

render_datasets_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""
    app = open_dataset(AppTest.from_string(script).run(timeout=20), agent.agent_id, dataset_id)

    assert len(app.dataframe) == 1
    assert len(app.dataframe[0].value) == 2
    assert "Current ordered cases" not in "\n".join(
        str(node.value) for node in app.get("markdown")
    )


def test_duplicate_case_gets_a_unique_primary_input_value():
    """The Duplicate row action must not violate draft input uniqueness."""
    from src.ui.datasets import _duplicate_case
    from src.workbench_models import CREATE_FORM_TEMPLATE

    original = WorkbenchCase(
        "one", {"query": "One"}, {"expected_action": "First"}
    )

    clone = _duplicate_case(original, CREATE_FORM_TEMPLATE, [original])

    assert clone.case_id != original.case_id
    assert clone.input["query"] == "One (copy)"
    assert clone.expected_output == original.expected_output


def test_coverage_cases_fill_required_schema_fields():
    """Coverage generation must not create cases rejected by the active schema."""
    from src.ui.datasets import _coverage_cases

    schema = DatasetSchema(
        (
            DatasetColumn("query", "input", "string", required=True),
            DatasetColumn("expected_action", "output", "string", required=True),
            DatasetColumn("expected_tool_called", "output", "string", required=False),
        )
    )

    generated = _coverage_cases((binding("weather"),), (), schema)

    assert len(generated) == 1
    assert generated[0].expected_output == {
        "expected_action": "Call Weather for Exercise the happy path",
        "expected_tool_called": "weather",
    }
    assert schema.validate_case(generated[0]) == []


def test_json_import_adds_reviewed_cases_without_replacing_the_draft(tmp_path):
    from src.ui.datasets import add_imported_cases

    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repository.create_agent("Agent", "")
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    registry = DatasetRegistry(repository)
    registry.add_cases(
        dataset_id,
        [WorkbenchCase("existing", {"query": "Existing"}, {"expected_action": "respond"})],
    )

    added = add_imported_cases(
        registry,
        dataset_id,
        json.dumps(
            [
                {
                    "case_id": "imported",
                    "input": {"query": "Imported"},
                    "expected_output": {"expected_action": "ok"},
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
    app = open_dataset(app, agent.agent_id, dataset_id)

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


def test_no_datasets_state_shows_create_button_and_no_autocreate(tmp_path):
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
    assert any(
        button.key == f"dataset_create_button_{agent.agent_id}" for button in app.button
    )
    assert not any(button.key.startswith(f"dataset_select_{agent.agent_id}") for button in app.button)
    assert _dataset_rows_count(repository, agent.agent_id) == 0


def _dataset_rows_count(repository, agent_id):
    with repository._connect() as connection:
        return connection.execute(
            "SELECT COUNT(*) FROM datasets WHERE agent_id = ?", (agent_id,)
        ).fetchone()[0]


def test_create_button_opens_form_prefilled_with_three_columns(tmp_path):
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
    next(
        button
        for button in app.button
        if button.key == f"dataset_create_button_{agent.agent_id}"
    ).click().run(timeout=20)

    assert not app.exception
    name_inputs = [input for input in app.text_input if input.label == "Name *"]
    assert len(name_inputs) == 1  # Dataset name; built-ins are concise locked rows.
    visible = "\n".join(
        str(node.value)
        for node in app.get("markdown") + app.get("text") + app.get("caption")
    )
    assert all(name in visible for name in ("query", "expected_action", "header"))


def test_create_view_hides_dataset_list_and_draft_content(tmp_path):
    """Opening Create must not leave Dataset list or Draft cases on screen."""
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    repository.create_dataset(agent.agent_id, "Existing dataset")
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

render_datasets_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""
    app = AppTest.from_string(script).run(timeout=20)
    initial_text = "\n".join(
        str(node.value)
        for node in app.get("markdown") + app.get("text") + app.get("subheader")
    )

    assert "Datasets" in initial_text
    assert "Dataset draft" not in initial_text

    app = next(
        button
        for button in app.button
        if button.key == f"dataset_create_button_{agent.agent_id}"
    ).click().run(timeout=20)
    create_text = "\n".join(
        str(node.value)
        for node in app.get("markdown") + app.get("text") + app.get("subheader")
    )

    assert "Create dataset" in create_text
    assert "Datasets" not in create_text
    assert "Dataset draft" not in create_text


def test_create_form_submit_creates_dataset_and_selects_it(tmp_path):
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
    next(
        button
        for button in app.button
        if button.key == f"dataset_create_button_{agent.agent_id}"
    ).click().run(timeout=20)

    next(input for input in app.text_input if input.label == "Name *").set_value("My dataset")
    next(
        button for button in app.button if button.key == f"dataset_create_submit_{agent.agent_id}"
    ).click().run(timeout=20)

    assert not app.exception
    rows = _all_dataset_rows(repository, agent.agent_id)
    assert len(rows) == 1
    assert rows[0]["name"] == "My dataset"
    from src.dataset_registry import DatasetRegistry
    schema = DatasetRegistry(repository).schema_for(rows[0]["dataset_id"])
    assert [c.name for c in schema.columns] == ["query", "expected_action", "header"]


def test_create_form_appends_a_custom_schema_field_after_locked_fields(tmp_path):
    """Custom fields must extend rather than replace the built-in schema."""
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
    app = next(
        button
        for button in app.button
        if button.key == f"dataset_create_button_{agent.agent_id}"
    ).click().run(timeout=20)
    app = next(button for button in app.button if button.label == "+ Add column").click().run(
        timeout=20
    )

    name_inputs = [item for item in app.text_input if item.label == "Name *"]
    name_inputs[0].set_value("Custom schema")
    name_inputs[1].set_value("expected_tool_called")
    kind_selects = [item for item in app.selectbox if item.label == "Kind"]
    kind_selects[-1].set_value("output")
    app = next(
        button
        for button in app.button
        if button.key == f"dataset_create_submit_{agent.agent_id}"
    ).click().run(timeout=20)

    row = _all_dataset_rows(repository, agent.agent_id)[0]
    schema = DatasetRegistry(repository).schema_for(row["dataset_id"])
    assert [column.name for column in schema.columns] == [
        "query",
        "expected_action",
        "header",
        "expected_tool_called",
    ]
    assert schema.columns[-1].kind == "output"


def test_custom_column_uses_compact_more_popover(tmp_path):
    """Returning to the expanded five-control custom-column stack must fail."""
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
    app = next(button for button in app.button if button.label == "Create").click().run(
        timeout=20
    )
    app = next(button for button in app.button if button.label == "+ Add column").click().run(
        timeout=20
    )

    assert len(app.get("popover")) == 1
    assert len([item for item in app.text_input if item.label == "Name *"]) == 2


def test_custom_column_more_actions_preserve_editable_state(tmp_path):
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
    app = next(button for button in app.button if button.label == "Create").click().run(
        timeout=20
    )
    app = next(button for button in app.button if button.label == "+ Add column").click().run(
        timeout=20
    )
    app = [item for item in app.text_input if item.label == "Name *"][-1].set_value(
        "expected_tool_called"
    ).run(timeout=20)
    app = next(item for item in app.text_input if item.label == "Description").set_value(
        "Expected Tool identifier"
    ).run(timeout=20)

    app = next(button for button in app.button if button.label == "Duplicate").click().run(
        timeout=20
    )
    assert len([item for item in app.text_input if item.label == "Name *"]) == 3
    assert any(item.value == "expected_tool_called_copy" for item in app.text_input)

    app = [button for button in app.button if button.label == "Delete"][-1].click().run(
        timeout=20
    )
    assert len([item for item in app.text_input if item.label == "Name *"]) == 2


def test_cancel_create_resets_form_before_reopening(tmp_path):
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
    app = next(button for button in app.button if button.label == "Create").click().run(
        timeout=20
    )
    app = next(item for item in app.text_input if item.label == "Name *").set_value(
        "Discard me"
    ).run(timeout=20)
    app = next(button for button in app.button if button.label == "+ Add column").click().run(
        timeout=20
    )
    app = next(button for button in app.button if button.label == "Cancel").click().run(
        timeout=20
    )
    app = next(button for button in app.button if button.label == "Create").click().run(
        timeout=20
    )

    assert next(item for item in app.text_input if item.label == "Name *").value == ""
    assert len([item for item in app.text_input if item.label == "Name *"]) == 1


def test_duplicated_custom_column_remains_editable():
    from src.ui.datasets import _new_column_dict
    from src.workbench_models import DatasetColumn

    clone = _new_column_dict(
        DatasetColumn("expected_tool_called", "output", "string", required=False),
        locked=False,
    )

    assert clone["_locked"] == "no"


def _all_dataset_rows(repository, agent_id):
    with repository._connect() as connection:
        return [
            dict(row)
            for row in connection.execute(
                "SELECT dataset_id, name FROM datasets WHERE agent_id = ? ORDER BY created_at",
                (agent_id,),
            ).fetchall()
        ]


def test_dataset_history_aggregates_all_selected_dataset_revisions_only(tmp_path):
    """Joining history by Agent alone must not leak runs from another Dataset."""
    from src.ui.datasets import _dataset_history

    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repository.create_agent("Agent", "")
    agent_revision = repository.create_agent_revision(agent.agent_id, {"model": "test"}, ())
    selected_id = repository.create_dataset(agent.agent_id, "Selected")
    other_id = repository.create_dataset(agent.agent_id, "Other")
    registry = DatasetRegistry(repository)
    registry.add_cases(selected_id, [WorkbenchCase("selected", {"query": "One"}, {"expected_action": "one"})])
    first_revision = registry.publish(selected_id)
    registry.add_cases(selected_id, [WorkbenchCase("selected-2", {"query": "Two"}, {"expected_action": "two"})])
    second_revision = registry.publish(selected_id)
    registry.add_cases(other_id, [WorkbenchCase("other", {"query": "Other"}, {"expected_action": "other"})])
    other_revision = registry.publish(other_id)

    selected_runs = []
    for revision, pass_rate in ((first_revision, 100.0), (second_revision, 50.0)):
        run = repository.finish_run(
            repository.create_run(agent_revision.revision_id, revision.revision_id).run_id,
            RunStatus.COMPLETED,
        )
        repository.save_report(
            run.run_id,
            "PASS",
            {"metrics": {"pass_rate": pass_rate, "total_cases": len(revision.cases), "evaluation_cost_usd": 0.01}},
            tmp_path / f"{run.run_id}.md",
        )
        selected_runs.append(run.run_id)
    other_run = repository.finish_run(
        repository.create_run(agent_revision.revision_id, other_revision.revision_id).run_id,
        RunStatus.COMPLETED,
    )

    history = _dataset_history(repository, agent.agent_id, selected_id)

    assert {row["run_id"] for row in history} == set(selected_runs)
    assert other_run.run_id not in {row["run_id"] for row in history}
    assert {row["dataset_revision"] for row in history} == {1, 2}
    assert {row["pass_rate"] for row in history} == {100.0, 50.0}
    assert all(row["report_id"] for row in history)


def test_selected_published_dataset_requests_its_revision_for_evaluation(tmp_path):
    """Evaluate must route the selected published revision, never the live draft."""
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    registry = DatasetRegistry(repository)
    registry.add_cases(dataset_id, [WorkbenchCase("case", {"query": "Evaluate"}, {"expected_action": "evaluate"})])
    revision = registry.publish(dataset_id)
    script = f"""
from pathlib import Path
import streamlit as st
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module
from src.ui.state import init_ui_state

init_ui_state({agent.agent_id!r})
render_datasets_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""
    app = open_dataset(
        AppTest.from_string(script).run(timeout=20), agent.agent_id, dataset_id
    )

    app = next(
        button
        for button in app.button
        if button.key == f"dataset_evaluate_{agent.agent_id}_{dataset_id}"
    ).click().run(timeout=20)

    assert app.session_state["active_page"] == "Evaluation"
    assert app.session_state["requested_dataset_revision_id"] == revision.revision_id


def test_create_form_rejects_empty_name(tmp_path):
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
    next(
        button
        for button in app.button
        if button.key == f"dataset_create_button_{agent.agent_id}"
    ).click().run(timeout=20)

    next(
        button for button in app.button if button.key == f"dataset_create_submit_{agent.agent_id}"
    ).click().run(timeout=20)

    assert any("Name is required" in str(e.value) for e in app.get("error"))
    assert _dataset_rows_count(repository, agent.agent_id) == 0


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
    app = open_dataset(app, agent.agent_id, dataset_id)

    next(
        button
        for button in app.button
        if button.key == f"dataset_add_case_{agent.agent_id}_{dataset_id}"
    ).click().run(timeout=20)
    next(item for item in app.text_input if item.label == "query *").set_value("Created case")
    next(item for item in app.text_input if item.label == "expected_action *").set_value(
        "search"
    )
    next(button for button in app.button if button.label == "Save case").click().run(timeout=20)

    assert app.dataframe[0].value.iloc[0]["query"] == "Created case"
    next(
        button
        for button in app.button
        if button.key == f"dataset_publish_{agent.agent_id}_{dataset_id}"
    ).click().run(timeout=20)
    app.run(timeout=20)

    assert app.dataframe[0].value.iloc[0]["query"] == "Created case"
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

def unavailable_generator(agent_id, cases, schema):
    raise RuntimeError("candidate provider unavailable")

render_datasets_module(
    SQLiteWorkbenchRepository(Path({str(db)!r})),
    {agent.agent_id!r},
    unavailable_generator,
)
"""
    app = AppTest.from_string(script).run(timeout=20)
    app = open_dataset(app, agent.agent_id, dataset_id)
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


def test_evaluation_run_history_is_one_native_table_row_per_run(tmp_path):
    """Returning to per-run cards must fail this test."""
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    agent_revision = repository.create_agent_revision(agent.agent_id, {"model": "test"}, ())
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    registry = DatasetRegistry(repository)
    registry.add_cases(
        dataset_id,
        [WorkbenchCase("case", {"query": "Evaluate"}, {"expected_action": "reply"})],
    )
    dataset_revision = registry.publish(dataset_id)
    for status in (RunStatus.COMPLETED, RunStatus.FAILED):
        run = repository.create_run(agent_revision.revision_id, dataset_revision.revision_id)
        repository.finish_run(run.run_id, status)
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.runs import render_runs_module

render_runs_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""
    app = AppTest.from_string(script).run(timeout=20)

    assert len(app.dataframe) == 1
    assert len(app.dataframe[0].value) == 2
    assert list(app.dataframe[0].value.columns) == [
        "Started",
        "Target revision",
        "Dataset revision",
        "Status",
        "Quality",
        "Cost",
    ]


def test_evaluation_configuration_is_compact_not_a_step_wizard(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    repository.create_agent_revision(agent.agent_id, {"model": "test"}, ())
    script = f"""
from pathlib import Path
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.runs import render_runs_module

render_runs_module(SQLiteWorkbenchRepository(Path({str(db)!r})), {agent.agent_id!r})
"""
    app = AppTest.from_string(script).run(timeout=20)
    visible = "\n".join(str(node.value) for node in app.get("markdown"))

    assert "### Evaluation" in visible
    assert "Confirm Target Revision" not in visible
    assert "Select Dataset Revision" not in visible
    assert "Review evaluators and cost scope" not in visible
    assert next(button for button in app.button if button.key == "run_start").label == (
        "Start evaluation"
    )


def test_evaluation_does_not_reuse_a_published_draft_for_a_different_draft_source(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    repository.create_agent_revision(agent.agent_id, {"model": "test"}, ())
    first_draft_id = repository.create_dataset(agent.agent_id, "First draft")
    second_draft_id = repository.create_dataset(agent.agent_id, "Second draft")
    registry = DatasetRegistry(repository)
    registry.add_cases(first_draft_id, [WorkbenchCase("first", {"query": "First"}, {"expected_action": "first"})])
    registry.add_cases(second_draft_id, [WorkbenchCase("second", {"query": "Second"}, {"expected_action": "second"})])
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
        dataset_id, [WorkbenchCase("case", {"query": "Evaluate"}, {"expected_action": "evaluate"})]
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
        dataset_id, [WorkbenchCase("case", {"query": "Evaluate"}, {"expected_action": "evaluate"})]
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

    assert app.session_state["active_page"] == "Target"
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
        dataset_id, [WorkbenchCase("case", {"query": "Evaluate"}, {"expected_action": "evaluate"})]
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

    assert app.session_state["active_page"] == "Target"
    assert app.session_state["selected_run_id"] == failed_run.run_id
    assert "Report was not persisted for this completed run." in "\n".join(
        str(node.value) for node in app.get("error")
    )


def test_evaluation_handles_a_persisted_report_with_a_missing_persisted_run(tmp_path):
    from streamlit.testing.v1 import AppTest

    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    agent_revision = repository.create_agent_revision(agent.agent_id, {"model": "test"}, ())
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    DatasetRegistry(repository).add_cases(
        dataset_id, [WorkbenchCase("case", {"query": "Evaluate"}, {"expected_action": "evaluate"})]
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

class DanglingReportRepository:
    def __init__(self, backing):
        self.backing = backing

    def get_report(self, report_id):
        return SimpleNamespace(report_id=report_id, run_id="missing-persisted-run")

    def get_run(self, run_id):
        if run_id == "missing-persisted-run":
            raise KeyError(run_id)
        return self.backing.get_run(run_id)

    def __getattr__(self, name):
        return getattr(self.backing, name)

class CompletedRunner:
    def run_revision(self, agent_revision_id, dataset_revision_id, progress):
        return SQLiteWorkbenchRepository(Path({str(db)!r})).get_run({completed_run.run_id!r})

class DanglingReportService:
    def create(self, run_id):
        return SimpleNamespace(report_id="dangling-report")

init_ui_state({agent.agent_id!r})
render_runs_module(
    DanglingReportRepository(SQLiteWorkbenchRepository(Path({str(db)!r}))),
    {agent.agent_id!r},
    CompletedRunner(),
    DanglingReportService(),
)
"""
    app = AppTest.from_string(script).run(timeout=20)
    next(button for button in app.button if button.key == "run_start").click().run(timeout=20)

    assert not app.exception
    assert app.session_state["active_page"] == "Target"
    assert app.session_state["selected_run_id"] == completed_run.run_id
    assert "Report was not persisted for this completed run." in "\n".join(
        str(node.value) for node in app.get("error")
    )
