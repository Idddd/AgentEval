"""Environment configuration and runtime mode detection."""
from __future__ import annotations

import os
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Settings:
    llm_provider: str = "fallback"
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    openai_model: str = "gpt-4o-mini"
    anthropic_base_url: str | None = None
    anthropic_auth_token: str | None = None
    anthropic_model: str = "deepseek-v4-flash"
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    langfuse_host: str = "https://cloud.langfuse.com"
    langfuse_enabled: bool = False   # result of auth_check()
    openai_enabled: bool = False
    anthropic_enabled: bool = False
    data_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "data")
    workbench_db: Path = field(default_factory=lambda: PROJECT_ROOT / "data" / "workbench.db")

    @property
    def llm_mode(self) -> str:
        if self.llm_provider == "anthropic" and self.anthropic_enabled:
            return f"deepseek({self.anthropic_model})"
        if self.llm_provider == "openai" and self.openai_enabled:
            return f"openai({self.openai_model})"
        return "rule"


@dataclass(frozen=True)
class LlmConnectionDraft:
    provider: str
    base_url: str | None
    model: str
    api_key: str


@dataclass(frozen=True)
class LlmConnectionTestResult:
    success: bool
    provider: str
    model: str
    latency_ms: int
    message: str


_PLACEHOLDER_PREFIXES = ("sk-...", "pk-...", "")


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value or value in _PLACEHOLDER_PREFIXES:
        return None
    return value


def load_settings(probe: bool = True) -> Settings:
    """Load .env; with probe=True, run a Langfuse auth_check to pick the mode."""
    load_dotenv(PROJECT_ROOT / ".env", override=True)
    openai_key = _clean(os.getenv("OPENAI_API_KEY"))
    openai_base_url = _clean(os.getenv("OPENAI_BASE_URL"))
    anthropic_base_url = _clean(os.getenv("ANTHROPIC_BASE_URL"))
    anthropic_token = _clean(os.getenv("ANTHROPIC_AUTH_TOKEN"))
    requested_provider = str(os.getenv("LLM_PROVIDER", "")).strip().casefold()
    if requested_provider not in {"openai", "anthropic"}:
        requested_provider = (
            "anthropic"
            if anthropic_base_url and anthropic_token
            else "openai" if openai_key else "fallback"
        )
    s = Settings(
        llm_provider=requested_provider,
        openai_api_key=openai_key,
        openai_base_url=openai_base_url,
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip(),
        anthropic_base_url=anthropic_base_url,
        anthropic_auth_token=anthropic_token,
        anthropic_model=os.getenv("ANTHROPIC_MODEL", "deepseek-v4-flash").strip(),
        langfuse_public_key=_clean(os.getenv("LANGFUSE_PUBLIC_KEY")),
        langfuse_secret_key=_clean(os.getenv("LANGFUSE_SECRET_KEY")),
        langfuse_host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
        workbench_db=Path(os.getenv("WORKBENCH_DB", str(PROJECT_ROOT / "data" / "workbench.db"))),
    )
    s.openai_enabled = s.llm_provider == "openai" and s.openai_api_key is not None
    s.anthropic_enabled = (
        s.llm_provider == "anthropic"
        and bool(s.anthropic_base_url and s.anthropic_auth_token)
    )

    if probe and s.langfuse_public_key and s.langfuse_secret_key:
        try:
            from langfuse import get_client

            s.langfuse_enabled = bool(get_client().auth_check())
        except Exception:
            s.langfuse_enabled = False

    print(f"[mode] trace_backend={'langfuse' if s.langfuse_enabled else 'local-json'} "
          f"llm={s.llm_mode}")
    return s


def connection_draft_from_settings(settings: Settings) -> LlmConnectionDraft:
    """Return the active provider without exposing it through display models."""
    if settings.llm_provider == "anthropic":
        return LlmConnectionDraft(
            "anthropic",
            settings.anthropic_base_url,
            settings.anthropic_model,
            settings.anthropic_auth_token or "",
        )
    return LlmConnectionDraft(
        "openai",
        settings.openai_base_url,
        settings.openai_model,
        settings.openai_api_key or "",
    )


def test_llm_connection(
    draft: LlmConnectionDraft, *, timeout_seconds: float = 10.0
) -> LlmConnectionTestResult:
    """Probe one provider with a tiny request and return only redacted status."""
    provider = draft.provider.casefold()
    if provider not in {"openai", "anthropic"}:
        raise ValueError("Unsupported LLM provider")
    if not draft.api_key.strip():
        raise ValueError("API key is required")
    if not draft.model.strip():
        raise ValueError("Model is required")
    if provider == "anthropic" and not (draft.base_url or "").strip():
        raise ValueError("Base URL is required for Anthropic-compatible providers")

    from .llm_gateway import AnthropicGateway, OpenAIGateway

    gateway = (
        AnthropicGateway(
            draft.model.strip(),
            base_url=(draft.base_url or "").strip(),
            api_key=draft.api_key.strip(),
            timeout=timeout_seconds,
        )
        if provider == "anthropic"
        else OpenAIGateway(
            draft.model.strip(),
            base_url=(draft.base_url or "").strip() or None,
            api_key=draft.api_key.strip(),
            timeout=timeout_seconds,
        )
    )
    started = time.perf_counter()
    try:
        response = gateway.complete(
            "You are a connection probe. Reply with OK only.",
            [{"role": "user", "content": "OK"}],
            8,
        )
    except Exception as error:
        latency_ms = int((time.perf_counter() - started) * 1000)
        return LlmConnectionTestResult(
            False,
            provider,
            draft.model.strip(),
            latency_ms,
            f"Connection failed ({type(error).__name__}); credentials and details are hidden.",
        )
    latency_ms = int((time.perf_counter() - started) * 1000)
    return LlmConnectionTestResult(
        bool(response.text.strip()),
        provider,
        response.model,
        latency_ms,
        "Connection successful" if response.text.strip() else "Provider returned an empty response",
    )


def save_llm_settings(
    draft: LlmConnectionDraft, *, env_path: Path | None = None
) -> None:
    """Atomically persist an explicitly tested local provider configuration."""
    provider = draft.provider.casefold()
    if provider not in {"openai", "anthropic"}:
        raise ValueError("Unsupported LLM provider")
    if not draft.api_key.strip() or not draft.model.strip():
        raise ValueError("A tested model and API key are required")
    if provider == "anthropic" and not (draft.base_url or "").strip():
        raise ValueError("Base URL is required for Anthropic-compatible providers")
    path = Path(env_path or PROJECT_ROOT / ".env")
    updates = {
        "LLM_PROVIDER": provider,
        "OPENAI_API_KEY": draft.api_key.strip() if provider == "openai" else "",
        "OPENAI_BASE_URL": (draft.base_url or "").strip() if provider == "openai" else "",
        "OPENAI_MODEL": draft.model.strip() if provider == "openai" else "gpt-4o-mini",
        "ANTHROPIC_BASE_URL": (draft.base_url or "").strip() if provider == "anthropic" else "",
        "ANTHROPIC_AUTH_TOKEN": draft.api_key.strip() if provider == "anthropic" else "",
        "ANTHROPIC_MODEL": draft.model.strip() if provider == "anthropic" else "deepseek-v4-flash",
    }
    _write_env_updates(path, updates)


def _write_env_updates(path: Path, updates: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    remaining = dict(updates)
    rendered: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else None
        if key in remaining:
            rendered.append(_env_assignment(key, remaining.pop(key)))
        else:
            rendered.append(line)
    if rendered and rendered[-1] != "":
        rendered.append("")
    rendered.extend(_env_assignment(key, value) for key, value in remaining.items())
    content = "\n".join(rendered).rstrip() + "\n"
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", delete=False
    ) as handle:
        handle.write(content)
        temporary = Path(handle.name)
    os.replace(temporary, path)


def _env_assignment(key: str, value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'{key}="{escaped}"'
