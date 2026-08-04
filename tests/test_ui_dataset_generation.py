from streamlit.testing.v1 import AppTest

from src.sqlite_workbench import SQLiteWorkbenchRepository


def _open_dataset(app, agent_id, dataset_id):
    app.session_state.selected_dataset_id = dataset_id
    app.session_state[f"dataset_view_{agent_id}"] = "draft"
    return app.run(timeout=20)


def _visible(app, kind):
    return "\n".join(str(node.value) for node in app.get(kind))


def test_generated_batch_shows_fallback_and_case_provenance(tmp_path):
    db = tmp_path / "workbench.db"
    repository = SQLiteWorkbenchRepository(db)
    agent = repository.create_agent("Agent", "")
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    script = f'''
from pathlib import Path
from src.dataset_generation import GeneratedBatch
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.datasets import render_datasets_module

def generate(agent_id, cases, schema, progress):
    progress("Reading Tool metadata")
    return GeneratedBatch(
        candidates=({{
            "case_id": "generated-1",
            "input": {{"query": "Check weather"}},
            "expected_output": {{"expected_action": "Use WeatherTool"}},
            "tags": ["demo-fallback", "tool:weather"],
            "metadata": {{"provenance": {{
                "agent_revision": 3,
                "tool_id": "weather",
                "tool_name": "WeatherTool",
                "requirement": "Correct Tool selection",
            }}}},
        }},),
        source="demo-fallback",
        mode="fallback",
        provider="local",
        model="Authored metadata templates",
        fallback_reason="LLM not configured",
    )

render_datasets_module(
    SQLiteWorkbenchRepository(Path({str(db)!r})),
    {agent.agent_id!r},
    generate,
)
'''
    app = AppTest.from_string(script).run(timeout=20)
    app = _open_dataset(app, agent.agent_id, dataset_id)
    app = next(
        button
        for button in app.button
        if button.key == f"dataset_generate_llm_{agent.agent_id}_{dataset_id}"
    ).click().run(timeout=20)

    assert not app.exception
    captions = _visible(app, "caption")
    assert "AI generated · Grounded in the current Agent Revision" in captions
    assert "Demo fallback" not in captions
    review = app.dataframe[0].value
    assert len(review) == 1
    assert review.iloc[0]["Agent Revision"] == "R3"
    assert review.iloc[0]["Tool"] == "WeatherTool"
    assert review.iloc[0]["Requirement"] == "Correct Tool selection"
    assert review.iloc[0]["Source"] == "AI generated"


def test_settings_requires_successful_connection_test_before_save():
    script = '''
import streamlit as st
from src.settings import LlmConnectionTestResult, Settings
from src.ui.settings_page import SettingsStatus, render_settings_page

def test_connection(draft):
    return LlmConnectionTestResult(True, draft.provider, draft.model, 12, "Connection successful")

def save_connection(draft):
    st.session_state.saved_provider = draft.provider

render_settings_page(
    SettingsStatus("Not configured", "Not configured", "Available", "Available"),
    Settings(),
    test_connection=test_connection,
    save_connection=save_connection,
)
'''
    app = AppTest.from_string(script).run(timeout=20)
    save = next(button for button in app.button if button.label == "Save and use")
    assert save.disabled

    key = next(item for item in app.text_input if item.label == "API key *")
    key.set_value("test-secret")
    app = next(button for button in app.button if button.label == "Test connection").click().run(
        timeout=20
    )

    assert not app.exception
    assert "Connection successful" in _visible(app, "success")
    save = next(button for button in app.button if button.label == "Save and use")
    assert not save.disabled
    app = save.click().run(timeout=20)
    assert app.session_state.saved_provider == "openai"
