"""Langfuse observation fields map into the backend-neutral trace model."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from src.backends.langfuse_backend import _to_trace_record


def test_maps_typed_observation_fields():
    started = datetime(2026, 1, 1, tzinfo=timezone.utc)
    observation = SimpleNamespace(
        id="obs-1", parent_observation_id="root", name="weather", start_time=started,
        end_time=started, input={"city": "Paris"}, output={"temperature": 21},
        metadata={"call_id": "c1"}, type="tool", level="ERROR",
        status_message="adapter timeout", model="weather-v1",
        usage_details={"input": 3, "output": 2}, cost_details={"input": 0.001},
    )
    remote_trace = SimpleNamespace(
        id="trace-1", name="run", user_id="u1", tags=[], metadata={},
        observations=[observation], scores=[],
    )

    span = _to_trace_record(remote_trace).find_span("weather")

    assert span.observation_type == "tool"
    assert span.level == "ERROR"
    assert span.status_message == "adapter timeout"
    assert span.model == "weather-v1"
    assert span.usage_details == {"input": 3, "output": 2}
    assert span.cost_details == {"input": 0.001}
