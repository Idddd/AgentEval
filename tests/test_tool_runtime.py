from __future__ import annotations

import asyncio

from src.agent import TargetAgent
from src.backends.local_backend import LocalTracer
from src.config_loader import ToolDef, ToolsConfig
from src.intent import RuleIntentAnalyzer
from src.tool_runtime import ToolAdapterRegistry, ToolExecutor, ToolRequest
from src.workbench_models import ToolBinding


def binding(*, verification_required):
    return ToolBinding(
        "restart", "Restart", "Restart a service", "python", {},
        {"type": "object"}, {"type": "object"}, {}, (),
        verification_required, True,
    )


def test_executor_records_success_and_receipt(tmp_path):
    local_tracer = LocalTracer(tmp_path / "traces.jsonl")
    mutable_tool_binding = binding(verification_required=True)
    registry = ToolAdapterRegistry()
    registry.register("python", lambda binding: lambda arguments: {
        "result": "restarted", "receipt": {"request_id": "req-1"}
    })
    executor = ToolExecutor(local_tracer, registry)
    with local_tracer.start_trace("run", user_id="u", tags=[], metadata={}):
        result, evidence = executor.execute(
            mutable_tool_binding,
            ToolRequest("call-1", mutable_tool_binding.tool_id, {"service": "orders"}),
        )
    assert result.output["result"] == "restarted"
    assert evidence.requested is True
    assert evidence.executed is True
    assert evidence.succeeded is True
    assert evidence.effect_verified is True
    assert evidence.observation_id


def test_executor_records_adapter_error(tmp_path):
    local_tracer = LocalTracer(tmp_path / "traces.jsonl")
    read_only_tool_binding = binding(verification_required=False)
    registry = ToolAdapterRegistry()
    registry.register("python", lambda binding: lambda arguments: (_ for _ in ()).throw(TimeoutError("slow")))
    executor = ToolExecutor(local_tracer, registry)
    with local_tracer.start_trace("run", user_id="u", tags=[], metadata={}):
        result, evidence = executor.execute(
            read_only_tool_binding, ToolRequest("call-2", read_only_tool_binding.tool_id, {})
        )
    assert result.error == "TimeoutError: slow"
    assert evidence.executed is True
    assert evidence.succeeded is False


def test_executor_redacts_secrets_before_recording_evidence(tmp_path):
    tracer = LocalTracer(tmp_path / "traces.jsonl")
    registry = ToolAdapterRegistry()
    registry.register("python", lambda binding: lambda arguments: {"token": "returned-secret"})
    executor = ToolExecutor(tracer, registry)
    with tracer.start_trace("run", user_id="u", tags=[], metadata={}):
        _, evidence = executor.execute(
            binding(verification_required=False),
            ToolRequest("call-3", "restart", {"api_key": "input-secret"}),
        )
    assert evidence.requested_arguments == {"api_key": "[REDACTED]"}
    assert evidence.output == {"token": "[REDACTED]"}


def test_target_agent_returns_executor_evidence(tmp_path):
    tracer = LocalTracer(tmp_path / "traces.jsonl")
    config = ToolsConfig(
        tools={"WeatherTool": ToolDef("WeatherTool", "Weather", "low", None, [])},
        roles={"guest": ["WeatherTool"]},
    )

    result = asyncio.run(TargetAgent(config, tracer, RuleIntentAnalyzer()).run(
        "weather in Paris", "u1", "guest"
    ))

    assert result["tool_evidence"][0].executed is True
    assert result["tool_evidence"][0].tool_id == "WeatherTool"
