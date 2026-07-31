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

    def list_projects(self, *, limit: int):
        assert limit == 1
        return []


class FailingClient(FakeClient):
    def list_projects(self, *, limit: int):
        raise RuntimeError("unavailable")


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
    }


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
