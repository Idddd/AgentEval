from __future__ import annotations

from pathlib import Path

from langsmith.utils import LangSmithNotFoundError
import streamlit as st
from streamlit.testing.v1 import AppTest

from src.backends.langsmith_backend import LangsmithBackend, LangsmithStore
from src.backends.local_backend import LocalJsonBackend, LocalJsonStore
from src.settings import Settings


PROJECT_ROOT = Path(__file__).resolve().parent.parent
APP_PATH = PROJECT_ROOT / "app.py"


def _sidebar_status_text(at: AppTest) -> str:
    return " ".join(
        status.value
        for status in [*at.sidebar.success, *at.sidebar.warning]
    )


def _run_app_with_runtime(
    monkeypatch,
    runtime_settings: Settings,
    backend,
    store,
) -> tuple[AppTest, list[tuple[Settings | None, bool]]]:
    settings_calls = 0

    def alternating_settings() -> Settings:
        nonlocal settings_calls
        settings_calls += 1
        if settings_calls == 1:
            return runtime_settings
        return Settings(
            langsmith_enabled=not runtime_settings.langsmith_enabled,
            data_dir=runtime_settings.data_dir,
        )

    backend_calls: list[tuple[Settings | None, bool]] = []

    def resolved_backend(
        settings: Settings | None = None, refresh: bool = False
    ):
        backend_calls.append((settings, refresh))
        return backend, store

    monkeypatch.setattr(
        "src.settings.load_settings", alternating_settings
    )
    monkeypatch.setattr(
        "src.backends.base.get_backend", resolved_backend
    )
    monkeypatch.chdir(PROJECT_ROOT)
    st.cache_resource.clear()

    at = AppTest.from_file(str(APP_PATH)).run()

    assert settings_calls == 1
    return at, backend_calls


def test_sidebar_identifies_local_json_when_langsmith_is_unavailable(
    monkeypatch, tmp_path
):
    settings = Settings(langsmith_enabled=False, data_dir=tmp_path)
    at, backend_calls = _run_app_with_runtime(
        monkeypatch,
        settings,
        LocalJsonBackend(tmp_path),
        LocalJsonStore(tmp_path),
    )

    assert not at.exception, f"initial render failed: {at.exception}"
    assert backend_calls == [(settings, True)]
    assert (
        "Trace Backend: Local JSON (LangSmith unavailable)"
        in _sidebar_status_text(at)
    )


class _FreshProjectClient:
    def __init__(self):
        self.dataset_requests: list[str] = []
        self.project_requests: list[tuple[str, bool]] = []
        self.missing_project_iterator_consumed = False

    def list_datasets(self, *, dataset_name: str):
        self.dataset_requests.append(dataset_name)
        assert dataset_name == "agenteval__agent_permission_eval_v1"
        return iter(())

    def list_runs(self, *, project_name: str, is_root: bool):
        self.project_requests.append((project_name, is_root))
        assert project_name == "agenteval__exp_v1"
        assert is_root is True

        def missing_project():
            self.missing_project_iterator_consumed = True
            raise LangSmithNotFoundError("project does not exist")
            yield

        return missing_project()


def test_cloud_sidebar_and_fresh_project_render_without_credentials(
    monkeypatch, tmp_path
):
    settings = Settings(langsmith_enabled=True, data_dir=tmp_path)
    client = _FreshProjectClient()
    backend = LangsmithBackend(settings, client=client)
    store = LangsmithStore(settings, client=client)

    at, backend_calls = _run_app_with_runtime(
        monkeypatch, settings, backend, store
    )

    assert not at.exception, f"initial render failed: {at.exception}"
    assert backend_calls == [(settings, True)]
    assert "Trace Backend: LangSmith" in _sidebar_status_text(at)
    assert client.dataset_requests == [
        "agenteval__agent_permission_eval_v1"
    ]
    assert client.project_requests == [("agenteval__exp_v1", True)]
    assert client.missing_project_iterator_consumed is True
