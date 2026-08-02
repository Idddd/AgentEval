"""Marketplace page AppTest coverage (plan Task 7, Step 4)."""
import pytest
from streamlit.testing.v1 import AppTest

from tests.test_marketplace_manifest import VALID

PAGE = "pages/1_Marketplace.py"


@pytest.fixture()
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("AGENT_EVAL_DB", str(tmp_path / "marketplace.db"))
    test_app = AppTest.from_file(PAGE, default_timeout=30)
    test_app.run()
    assert not test_app.exception
    return test_app


def test_empty_states_are_instructional(app):
    infos = "\n".join(block.value for block in app.info)
    assert "No agents registered yet" in infos
    assert "No runs yet" in infos


def test_register_agent_then_listed(app):
    app.text_area(key="manifest_input").set_value(VALID)
    app.button(key="register_button").click().run()
    assert not app.exception
    assert any("Registered acme/travel-planner" in s.value for s in app.success)
    markdown = "\n".join(str(block.value) for block in app.markdown)
    assert "acme/travel-planner" in markdown


def test_invalid_manifest_shows_error(app):
    app.text_area(key="manifest_input").set_value("manifest_version: 7")
    app.button(key="register_button").click().run()
    assert any("Registration failed" in e.value for e in app.error)


def test_run_eval_enqueues_run(app):
    app.text_area(key="manifest_input").set_value(VALID)
    app.button(key="register_button").click().run()
    app.button(key="run_acme/travel-planner").click().run()
    assert not app.exception
    assert any("QUEUED" in s.value for s in app.success)
    markdown = "\n".join(str(block.value) for block in app.markdown)
    assert "QUEUED" in markdown
