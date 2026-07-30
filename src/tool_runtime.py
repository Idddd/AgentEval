"""Small adapter runtime that turns a requested tool call into traceable evidence."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter
from typing import Any, Callable, Protocol

from .backends.base import Tracer
from .workbench_models import ToolBinding, ToolEvidence


@dataclass(frozen=True)
class ToolRequest:
    call_id: str
    tool_id: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class ToolResult:
    output: dict[str, Any] | None
    error: str | None
    receipt: dict[str, Any] | None


class ToolAdapter(Protocol):
    def __call__(self, arguments: dict[str, Any]) -> dict[str, Any]: ...


class ToolAdapterRegistry:
    def __init__(self):
        self._factories: dict[str, Callable[[ToolBinding], ToolAdapter]] = {}

    def register(self, connection_type: str,
                 factory: Callable[[ToolBinding], ToolAdapter]) -> None:
        self._factories[connection_type] = factory

    def build(self, binding: ToolBinding) -> ToolAdapter:
        if binding.connection_type not in self._factories:
            raise KeyError(f"no adapter registered for '{binding.connection_type}'")
        return self._factories[binding.connection_type](binding)


_SECRET_KEY_PARTS = ("authorization", "api_key", "token", "secret", "password")


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[REDACTED]" if any(part in key.lower() for part in _SECRET_KEY_PARTS)
            else _redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_redact(item) for item in value)
    return value


class ToolExecutor:
    def __init__(self, tracer: Tracer, registry: ToolAdapterRegistry):
        self._tracer = tracer
        self._registry = registry

    def execute(self, binding: ToolBinding,
                request: ToolRequest) -> tuple[ToolResult, ToolEvidence]:
        started = datetime.now(timezone.utc)
        timer = perf_counter()
        arguments = _redact(request.arguments)
        output: dict[str, Any] | None = None
        receipt: dict[str, Any] | None = None
        error: str | None = None
        observation_id: str | None = None
        try:
            with self._tracer.observation(
                binding.name, as_type="tool", input=arguments,
                metadata={"call_id": request.call_id, "tool_id": request.tool_id},
            ) as observation:
                observation_id = observation.observation_id
                try:
                    raw_output = self._registry.build(binding)(request.arguments)
                    output = _redact(raw_output)
                    raw_receipt = raw_output.get("receipt") if isinstance(raw_output, dict) else None
                    receipt = _redact(raw_receipt) if isinstance(raw_receipt, dict) else None
                    observation.set_output(output)
                except Exception as exc:
                    error = f"{type(exc).__name__}: {exc}"
                    observation.set_error(error)
                    observation.set_output({"error": error})
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
        ended = datetime.now(timezone.utc)
        succeeded = error is None
        effect_verified = (
            bool(receipt) if binding.verification_required else None
        )
        evidence = ToolEvidence(
            call_id=request.call_id, tool_id=request.tool_id, requested=True,
            executed=True, succeeded=succeeded, effect_verified=effect_verified,
            verification_required=binding.verification_required,
            requested_arguments=arguments, executed_arguments=arguments,
            output=output, error=error, trace_id=self._tracer.last_trace_id() or "",
            observation_id=observation_id, started_at=started.isoformat(),
            ended_at=ended.isoformat(), latency_ms=(perf_counter() - timer) * 1000,
            receipt=receipt,
        )
        return ToolResult(output=output, error=error, receipt=receipt), evidence
