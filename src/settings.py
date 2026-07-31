"""Environment configuration and runtime mode detection."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Settings:
    openai_api_key: str | None = None
    anthropic_base_url: str | None = None
    anthropic_auth_token: str | None = None
    anthropic_model: str = "deepseek-v4-flash"
    langsmith_api_key: str | None = None
    langsmith_endpoint: str | None = None
    langsmith_workspace_id: str | None = None
    langsmith_enabled: bool = False
    openai_enabled: bool = False
    anthropic_enabled: bool = False
    data_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "data")

    @property
    def llm_mode(self) -> str:
        if self.anthropic_enabled:
            return f"deepseek({self.anthropic_model})"
        if self.openai_enabled:
            return "openai"
        return "rule"


_PLACEHOLDER_PREFIXES = ("sk-...", "pk-...", "")


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value or value in _PLACEHOLDER_PREFIXES:
        return None
    return value


def load_settings(probe: bool = True) -> Settings:
    """Load .env and select remote tracing after a lightweight LangSmith probe."""
    load_dotenv(PROJECT_ROOT / ".env", override=False)
    s = Settings(
        openai_api_key=_clean(os.getenv("OPENAI_API_KEY")),
        anthropic_base_url=_clean(os.getenv("ANTHROPIC_BASE_URL")),
        anthropic_auth_token=_clean(os.getenv("ANTHROPIC_AUTH_TOKEN")),
        anthropic_model=os.getenv("ANTHROPIC_MODEL", "deepseek-v4-flash").strip(),
        langsmith_api_key=_clean(os.getenv("LANGSMITH_API_KEY")),
        langsmith_endpoint=_clean(os.getenv("LANGSMITH_ENDPOINT")),
        langsmith_workspace_id=_clean(os.getenv("LANGSMITH_WORKSPACE_ID")),
    )
    s.openai_enabled = s.openai_api_key is not None
    s.anthropic_enabled = bool(s.anthropic_base_url and s.anthropic_auth_token)

    if probe and s.langsmith_api_key:
        try:
            from langsmith import Client

            client_options = {"api_key": s.langsmith_api_key}
            if s.langsmith_endpoint:
                client_options["api_url"] = s.langsmith_endpoint
            if s.langsmith_workspace_id:
                client_options["workspace_id"] = s.langsmith_workspace_id
            client = Client(**client_options)
            next(iter(client.list_projects(limit=1)), None)
            s.langsmith_enabled = True
        except Exception:
            s.langsmith_enabled = False

    print(f"[mode] trace_backend={'langsmith' if s.langsmith_enabled else 'local-json'} "
          f"llm={s.llm_mode}")
    return s
