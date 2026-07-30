from types import SimpleNamespace

import pytest

from src.backends.local_backend import LocalJsonStore, LocalTracer
from src.llm_gateway import (
    AnthropicGateway,
    LlmResponse,
    LlmUsage,
    ObservedLlmGateway,
    OpenAIGateway,
)
from src.intent import LlmIntentAnalyzer, generate_case_candidates_response
from src.settings import Settings


class FakeGateway:
    model = "fake-model"

    def complete(self, system, messages, max_tokens, json_mode=False):
        return LlmResponse(
            text='{"ok": true}', model=self.model, stop_reason="end_turn",
            usage=LlmUsage(input_tokens=120, output_tokens=30, cached_tokens=10,
                           reasoning_tokens=0, cost_usd=0.004),
        )


def test_observed_gateway_records_generation_usage(tmp_path):
    tracer = LocalTracer(tmp_path / "traces.jsonl")
    gateway = ObservedLlmGateway(FakeGateway(), tracer, category="judge")

    with tracer.start_trace("judge", user_id="eval", tags=[], metadata={}):
        response = gateway.complete("system", [{"role": "user", "content": "x"}], 100, True)

    assert response.usage.input_tokens == 120
    trace = LocalJsonStore(tmp_path).get_trace(tracer.last_trace_id())
    generation = trace.find_span("judge-generation")
    assert generation.observation_type == "generation"
    assert generation.usage_details == {"input": 110, "input_cached": 10, "output": 30}
    assert generation.cost_details == {"total": 0.004}
    assert gateway.last_trace_id == trace.trace_id
    assert gateway.last_observation_id == generation.id


def test_observed_gateway_marks_generation_error_before_reraising(tmp_path):
    class FailingGateway:
        model = "broken-model"

        def complete(self, *args, **kwargs):
            raise RuntimeError("provider down")

    tracer = LocalTracer(tmp_path / "traces.jsonl")
    gateway = ObservedLlmGateway(FailingGateway(), tracer, category="agent")
    with pytest.raises(RuntimeError, match="provider down"):
        with tracer.start_trace("agent", user_id="u", tags=[], metadata={}):
            gateway.complete("system", [], 10)

    trace = LocalJsonStore(tmp_path).get_trace(tracer.last_trace_id())
    assert trace.find_span("agent-generation").status_message == "RuntimeError: provider down"


def test_anthropic_gateway_normalizes_text_cache_usage_and_cost():
    response = SimpleNamespace(
        content=[SimpleNamespace(type="text", text="one"), SimpleNamespace(type="tool_use", text="x"),
                 SimpleNamespace(type="text", text=" two")],
        stop_reason="end_turn",
        usage=SimpleNamespace(input_tokens=100, output_tokens=15, cache_read_input_tokens=20,
                              cache_creation_input_tokens=3, cost_usd=0.25),
    )

    class Client:
        class messages:
            @staticmethod
            def create(**kwargs):
                return response

    result = AnthropicGateway("claude-test", client=Client()).complete("sys", [], 25)

    assert result == LlmResponse("one two", "claude-test", "end_turn", LlmUsage(100, 15, 23, 0, 0.25))


def test_openai_gateway_normalizes_json_cached_and_reasoning_usage():
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content='{"ok":true}'), finish_reason="stop")],
        usage=SimpleNamespace(prompt_tokens=50, completion_tokens=12,
                              prompt_tokens_details=SimpleNamespace(cached_tokens=8),
                              completion_tokens_details=SimpleNamespace(reasoning_tokens=4),
                              cost=0.01),
    )

    class Client:
        class chat:
            class completions:
                @staticmethod
                def create(**kwargs):
                    assert kwargs["response_format"] == {"type": "json_object"}
                    return response

    result = OpenAIGateway("gpt-test", client=Client()).complete("sys", [], 25, json_mode=True)

    assert result == LlmResponse('{"ok":true}', "gpt-test", "stop", LlmUsage(50, 12, 8, 4, 0.01))


def test_intent_and_case_generation_accept_an_injected_gateway():
    class Gateway:
        model = "test-model"

        def __init__(self):
            self.responses = iter([
                LlmResponse("WeatherTool", self.model, "stop", LlmUsage()),
                LlmResponse('{"candidates": [{"query": "Weather in Paris"}]}', self.model,
                            "stop", LlmUsage(7, 3, 1, 0, 0.02)),
            ])

        def complete(self, system, messages, max_tokens, json_mode=False):
            return next(self.responses)

    gateway = Gateway()
    analyzer = LlmIntentAnalyzer(Settings(openai_enabled=True), gateway)
    identified = analyzer.identify("What is the weather?", {"WeatherTool": SimpleNamespace(
        name="WeatherTool", description="forecast",
    )})
    candidates, generated = generate_case_candidates_response(
        Settings(openai_enabled=True), "create a weather case", gateway,
    )

    assert identified == "WeatherTool"
    assert candidates == [{"query": "Weather in Paris"}]
    assert generated.usage.cost_usd == 0.02
