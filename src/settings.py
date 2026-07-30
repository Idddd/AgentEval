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
    """Load .env; with probe=True, run a Langfuse auth_check to pick the mode."""
    load_dotenv(PROJECT_ROOT / ".env", override=True)
    s = Settings(
        openai_api_key=_clean(os.getenv("OPENAI_API_KEY")),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip(),
        anthropic_base_url=_clean(os.getenv("ANTHROPIC_BASE_URL")),
        anthropic_auth_token=_clean(os.getenv("ANTHROPIC_AUTH_TOKEN")),
        anthropic_model=os.getenv("ANTHROPIC_MODEL", "deepseek-v4-flash").strip(),
        langfuse_public_key=_clean(os.getenv("LANGFUSE_PUBLIC_KEY")),
        langfuse_secret_key=_clean(os.getenv("LANGFUSE_SECRET_KEY")),
        langfuse_host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
        workbench_db=Path(os.getenv("WORKBENCH_DB", str(PROJECT_ROOT / "data" / "workbench.db"))),
    )
    s.openai_enabled = s.openai_api_key is not None
    s.anthropic_enabled = bool(s.anthropic_base_url and s.anthropic_auth_token)

    if probe and s.langfuse_public_key and s.langfuse_secret_key:
        try:
            from langfuse import get_client

            s.langfuse_enabled = bool(get_client().auth_check())
        except Exception:
            s.langfuse_enabled = False

    print(f"[mode] trace_backend={'langfuse' if s.langfuse_enabled else 'local-json'} "
          f"llm={s.llm_mode}")
    return s
