"""LangSmith configuration and backend selection."""
from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace

from src.backends import base
from src.backends.local_backend import LocalJsonBackend, LocalJsonStore
from src.settings import load_settings


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
