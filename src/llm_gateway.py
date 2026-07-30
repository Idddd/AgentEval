"""Small provider-neutral LLM gateway with normalized telemetry fields."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from .backends.base import Tracer


@dataclass(frozen=True)
class LlmUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0
    reasoning_tokens: int = 0
    cost_usd: float = 0.0


@dataclass(frozen=True)
class LlmResponse:
    text: str
    model: str
    stop_reason: str | None
    usage: LlmUsage


class LlmGateway(Protocol):
    model: str

    def complete(self, system: str, messages: list[dict], max_tokens: int,
                 json_mode: bool = False) -> LlmResponse: ...


def _number(value: Any) -> int:
    """Convert provider token values, treating absent or invalid fields as zero."""
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _cost(value: Any) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _provider_cost(usage: Any, response: Any) -> float:
    value = _attribute(usage, "cost_usd", "cost", "billed_cost")
    if value is None:
        value = _attribute(response, "cost_usd", "cost", "billed_cost")
    return _cost(value)


def _attribute(value: Any, *names: str) -> Any:
    for name in names:
        candidate = getattr(value, name, None)
        if candidate is not None:
            return candidate
        if isinstance(value, dict) and value.get(name) is not None:
            return value[name]
    return None


class AnthropicGateway:
    """Adapter for Anthropic and Anthropic-compatible messages endpoints."""

    def __init__(self, model: str, *, client: Any | None = None,
                 base_url: str | None = None, api_key: str | None = None):
        if client is None:
            import anthropic

            client = anthropic.Anthropic(base_url=base_url, api_key=api_key)
        self.model = model
        self._client = client

    def complete(self, system: str, messages: list[dict], max_tokens: int,
                 json_mode: bool = False) -> LlmResponse:
        response = self._client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        text = "".join(
            str(_attribute(block, "text") or "")
            for block in (_attribute(response, "content") or [])
            if _attribute(block, "type") == "text"
        )
        usage = _attribute(response, "usage") or {}
        # Anthropic reports cache reads and writes separately. Both are input
        # tokens supplied by the cache, so retain them in the cached bucket.
        cached = _number(_attribute(usage, "cache_read_input_tokens")) + _number(
            _attribute(usage, "cache_creation_input_tokens")
        )
        return LlmResponse(
            text=text,
            model=self.model,
            stop_reason=_attribute(response, "stop_reason"),
            usage=LlmUsage(
                input_tokens=_number(_attribute(usage, "input_tokens")),
                output_tokens=_number(_attribute(usage, "output_tokens")),
                cached_tokens=cached,
                cost_usd=_provider_cost(usage, response),
            ),
        )


class OpenAIGateway:
    """Adapter for the OpenAI chat-completions API."""

    def __init__(self, model: str, *, client: Any | None = None,
                 api_key: str | None = None):
        if client is None:
            from openai import OpenAI

            client = OpenAI(api_key=api_key)
        self.model = model
        self._client = client

    def complete(self, system: str, messages: list[dict], max_tokens: int,
                 json_mode: bool = False) -> LlmResponse:
        request_messages = [{"role": "system", "content": system}, *messages]
        request: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": request_messages,
        }
        if json_mode:
            request["response_format"] = {"type": "json_object"}
        response = self._client.chat.completions.create(**request)
        choices = _attribute(response, "choices") or []
        choice = choices[0] if choices else None
        message = _attribute(choice, "message") if choice is not None else None
        usage = _attribute(response, "usage") or {}
        prompt_details = _attribute(usage, "prompt_tokens_details") or {}
        completion_details = _attribute(usage, "completion_tokens_details") or {}
        return LlmResponse(
            text=str(_attribute(message, "content") or ""),
            model=self.model,
            stop_reason=_attribute(choice, "finish_reason") if choice is not None else None,
            usage=LlmUsage(
                input_tokens=_number(_attribute(usage, "prompt_tokens", "input_tokens")),
                output_tokens=_number(_attribute(usage, "completion_tokens", "output_tokens")),
                cached_tokens=_number(_attribute(prompt_details, "cached_tokens")),
                reasoning_tokens=_number(_attribute(completion_details, "reasoning_tokens")),
                cost_usd=_provider_cost(usage, response),
            ),
        )


class ObservedLlmGateway:
    """Record one normalized LLM completion as a typed generation observation."""

    def __init__(self, gateway: LlmGateway, tracer: Tracer, *, category: str):
        self._gateway = gateway
        self._tracer = tracer
        self.category = category
        self.model = gateway.model
        self.last_trace_id: str | None = None
        self.last_observation_id: str | None = None

    def complete(self, system: str, messages: list[dict], max_tokens: int,
                 json_mode: bool = False) -> LlmResponse:
        request = {
            "system": system,
            "messages": messages,
            "max_tokens": max_tokens,
            "json_mode": json_mode,
        }
        with self._tracer.observation(
            f"{self.category}-generation",
            as_type="generation",
            input=request,
            metadata={"category": self.category},
            model=self.model,
        ) as generation:
            self.last_trace_id = self._tracer.last_trace_id()
            self.last_observation_id = getattr(generation, "observation_id", None)
            try:
                response = self._gateway.complete(system, messages, max_tokens, json_mode)
            except Exception as error:
                generation.set_error(f"{type(error).__name__}: {error}")
                raise
            generation.set_output({"text": response.text, "stop_reason": response.stop_reason})
            usage = response.usage
            usage_details = {
                "input": max(0, usage.input_tokens - usage.cached_tokens),
                "input_cached": usage.cached_tokens,
                "output": usage.output_tokens,
            }
            if usage.reasoning_tokens:
                usage_details["output_reasoning"] = usage.reasoning_tokens
            cost_details = {"total": usage.cost_usd} if usage.cost_usd else None
            generation.set_usage(usage_details, cost_details)
            if self.last_observation_id is None:
                self.last_observation_id = getattr(generation, "id", None)
            return response
