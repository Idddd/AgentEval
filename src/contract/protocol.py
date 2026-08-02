"""Wire types for the agent-eval/v1 contract."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

PROTOCOL_VERSION = "agent-eval/v1"

GATEWAY_URL_ENV = "EVAL_GATEWAY_URL"
RUN_TOKEN_ENV = "EVAL_RUN_TOKEN"


@dataclass(frozen=True)
class InvokeRequest:
    run_id: str
    case_id: str
    input: str
    context: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class InvokeResponse:
    output: str = ""
    status: str = "ok"          # "ok" | "error"
    error: str | None = None


@dataclass(frozen=True)
class GuardVerdict:
    allowed: bool
    reason: str = ""


@dataclass(frozen=True)
class ToolResult:
    ok: bool
    output: Any = None
    error: str | None = None
