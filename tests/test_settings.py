"""LangSmith configuration and backend selection."""
from __future__ import annotations

import asyncio
import sys
from types import ModuleType, SimpleNamespace

import main as cli_main

from src.backends import base
from src.backends.local_backend import LocalJsonBackend, LocalJsonStore
from src.settings import Settings, load_settings


class FakeClient:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.probe_consumed = False

    def list_projects(self, *, limit: int):
        def projects():
            self.probe_consumed = True
            assert limit == 1
            yield object()

        return projects()


class FailingClient(FakeClient):
    def list_projects(self, *, limit: int):
        def projects():
            self.probe_consumed = True
            assert limit == 1
            raise RuntimeError("unavailable")
            yield object()

        return projects()


def test_load_settings_enables_langsmith_after_successful_probe(monkeypatch):
    """Removing the lightweight probe must disable remote tracing."""
    client = FakeClient()
    monkeypatch.setenv("LANGSMITH_API_KEY", "lsv2_pt_test")
    monkeypatch.setenv("LANGSMITH_ENDPOINT", "https://smith.example.test")
    monkeypatch.setenv("LANGSMITH_WORKSPACE_ID", "workspace-test")
    monkeypatch.setitem(
        sys.modules,
        "langsmith",
        SimpleNamespace(
            Client=lambda **kwargs: (
                setattr(client, "kwargs", kwargs) or client
            ),
        ),
    )

    settings = load_settings()

    assert settings.langsmith_enabled is True
    assert settings.langsmith_workspace_id == "workspace-test"
    assert client.kwargs == {
        "api_key": "lsv2_pt_test",
        "api_url": "https://smith.example.test",
        "workspace_id": "workspace-test",
    }


def test_blank_process_key_overrides_dotenv_and_skips_remote_probe(
    monkeypatch, tmp_path
):
    """An explicit blank key must keep smoke tests offline despite .env."""
    client_calls = []
    (tmp_path / ".env").write_text(
        "LANGSMITH_API_KEY=lsv2_pt_from_dotenv\n",
        encoding="utf-8",
    )
    monkeypatch.setattr("src.settings.PROJECT_ROOT", tmp_path)
    monkeypatch.setenv("LANGSMITH_API_KEY", "")
    monkeypatch.setitem(
        sys.modules,
        "langsmith",
        SimpleNamespace(
            Client=lambda **kwargs: (
                client_calls.append(kwargs) or FakeClient(**kwargs)
            ),
        ),
    )

    settings = load_settings()

    assert settings.langsmith_api_key is None
    assert settings.langsmith_enabled is False
    assert client_calls == []


def test_load_settings_consumes_project_iterator_before_enabling(monkeypatch):
    """A lazy LangSmith probe must make a request before remote mode is enabled."""
    client = FakeClient()
    monkeypatch.setenv("LANGSMITH_API_KEY", "lsv2_pt_test")
    monkeypatch.setitem(
        sys.modules,
        "langsmith",
        SimpleNamespace(Client=lambda **_: client),
    )

    settings = load_settings()

    assert settings.langsmith_enabled is True
    assert client.probe_consumed is True


def test_load_settings_uses_local_mode_when_langsmith_probe_fails(monkeypatch):
    """A failed Cloud probe must keep the offline Local JSON fallback."""
    monkeypatch.setenv("LANGSMITH_API_KEY", "lsv2_pt_test")
    monkeypatch.setitem(
        sys.modules,
        "langsmith",
        SimpleNamespace(Client=lambda **_: FailingClient()),
    )

    assert load_settings().langsmith_enabled is False


def test_get_backend_selects_langsmith_only_when_enabled(monkeypatch):
    """The enabled setting must select the remote pair; disabled uses Local JSON."""
    class FakeBackend:
        def __init__(self, settings):
            self.settings = settings

    class FakeStore:
        def __init__(self, settings):
            self.settings = settings

    fake_module = ModuleType("src.backends.langsmith_backend")
    fake_module.LangsmithBackend = FakeBackend
    fake_module.LangsmithStore = FakeStore
    monkeypatch.setitem(sys.modules, "src.backends.langsmith_backend", fake_module)
    enabled = SimpleNamespace(langsmith_enabled=True)
    disabled = SimpleNamespace(langsmith_enabled=False, data_dir="data")

    monkeypatch.setattr("src.settings.load_settings", lambda: enabled)
    monkeypatch.setattr(base, "_cached", None)
    backend, store = base.get_backend(refresh=True)
    assert isinstance(backend, FakeBackend)
    assert isinstance(store, FakeStore)

    monkeypatch.setattr("src.settings.load_settings", lambda: disabled)
    base._cached = None
    backend, store = base.get_backend(refresh=True)
    assert isinstance(backend, LocalJsonBackend)
    assert isinstance(store, LocalJsonStore)


def test_get_backend_uses_supplied_settings_without_probing_again(
    monkeypatch, tmp_path
):
    """A resolved mode is authoritative even if a later probe would alternate."""
    selected_settings = []

    class FakeBackend:
        def __init__(self, settings):
            selected_settings.append(settings)

    class FakeStore:
        def __init__(self, settings):
            selected_settings.append(settings)

    fake_module = ModuleType("src.backends.langsmith_backend")
    fake_module.LangsmithBackend = FakeBackend
    fake_module.LangsmithStore = FakeStore
    monkeypatch.setitem(
        sys.modules, "src.backends.langsmith_backend", fake_module
    )

    probe_calls = 0

    def alternating_probe():
        nonlocal probe_calls
        probe_calls += 1
        return Settings(
            langsmith_enabled=probe_calls % 2 == 0,
            data_dir=tmp_path,
        )

    monkeypatch.setattr("src.settings.load_settings", alternating_probe)
    resolved = Settings(langsmith_enabled=True, data_dir=tmp_path)
    base._cached = None

    backend, store = base.get_backend(settings=resolved, refresh=True)

    assert isinstance(backend, FakeBackend)
    assert isinstance(store, FakeStore)
    assert selected_settings == [resolved, resolved]
    assert probe_calls == 0


def test_main_builds_backend_from_its_single_resolved_settings(
    monkeypatch, tmp_path
):
    settings = Settings(langsmith_enabled=False, data_dir=tmp_path)
    backend = object()
    store = object()
    settings_calls = 0
    backend_calls = []

    def load_once():
        nonlocal settings_calls
        settings_calls += 1
        return settings

    def resolved_backend(*, settings, refresh):
        backend_calls.append((settings, refresh))
        return backend, store

    class FakeReportGenerator:
        def __init__(self, experiment, received_store):
            assert experiment == "exp-atomic"
            assert received_store is store

        def generate(self, output_path):
            assert output_path is None

    monkeypatch.setattr(cli_main, "load_settings", load_once)
    monkeypatch.setattr(cli_main, "get_backend", resolved_backend)
    monkeypatch.setattr(cli_main, "load_tools_config", object)
    monkeypatch.setattr(cli_main, "ReportGenerator", FakeReportGenerator)
    monkeypatch.setattr(
        sys,
        "argv",
        ["main.py", "--step", "report", "--experiment", "exp-atomic"],
    )

    asyncio.run(cli_main.main())

    assert settings_calls == 1
    assert backend_calls == [(settings, True)]
