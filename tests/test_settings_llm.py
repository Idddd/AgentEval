from types import SimpleNamespace

from src.llm_gateway import LlmResponse, LlmUsage
from src.settings import (
    LlmConnectionDraft,
    load_settings,
    save_llm_settings,
    test_llm_connection as probe_llm_connection,
)


def test_connection_probe_uses_selected_provider_and_returns_safe_status(monkeypatch):
    captured = {}

    class Gateway:
        def __init__(self, model, **kwargs):
            captured.update(model=model, **kwargs)

        def complete(self, *args, **kwargs):
            return LlmResponse("OK", "served-model", "stop", LlmUsage())

    monkeypatch.setattr("src.llm_gateway.OpenAIGateway", Gateway)
    result = probe_llm_connection(
        LlmConnectionDraft("openai", "https://gateway.test/v1", "chosen-model", "secret")
    )

    assert result.success is True
    assert result.model == "served-model"
    assert captured["model"] == "chosen-model"
    assert captured["base_url"] == "https://gateway.test/v1"
    assert captured["api_key"] == "secret"


def test_connection_failure_redacts_provider_exception(monkeypatch):
    class Gateway:
        def __init__(self, *args, **kwargs):
            pass

        def complete(self, *args, **kwargs):
            raise RuntimeError("request failed with api_key=super-secret")

    monkeypatch.setattr("src.llm_gateway.OpenAIGateway", Gateway)
    result = probe_llm_connection(
        LlmConnectionDraft("openai", None, "chosen-model", "super-secret")
    )

    assert result.success is False
    assert "RuntimeError" in result.message
    assert "super-secret" not in result.message


def test_save_llm_settings_is_atomic_and_preserves_unrelated_values(tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text('UNRELATED="keep"\nOPENAI_API_KEY="old"\n', encoding="utf-8")
    save_llm_settings(
        LlmConnectionDraft(
            "anthropic", "https://anthropic-compatible.test", "model-v2", 'key"with\\chars'
        ),
        env_path=env_path,
    )

    contents = env_path.read_text(encoding="utf-8")
    assert 'UNRELATED="keep"' in contents
    assert 'LLM_PROVIDER="anthropic"' in contents
    assert 'ANTHROPIC_MODEL="model-v2"' in contents
    assert 'ANTHROPIC_AUTH_TOKEN="key\\"with\\\\chars"' in contents
    assert 'OPENAI_API_KEY=""' in contents
