"""Boundary between immutable workbench cases and a concrete target Agent."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from .backends.base import TraceStore
from .models import TraceRecord
from .workbench_models import TestCase, ToolEvidence, UsageCost


@dataclass(frozen=True)
class AgentAdapterResult:
    response: str
    trace_id: str
    trace: TraceRecord
    tool_evidence: tuple[ToolEvidence, ...]
    usage_costs: tuple[UsageCost, ...]


class AgentAdapter(Protocol):
    async def run(self, case: TestCase, run_id: str) -> AgentAdapterResult: ...


def _generation_costs(trace: TraceRecord) -> tuple[UsageCost, ...]:
    costs: list[UsageCost] = []
    for span in trace.spans:
        if span.observation_type != "generation":
            continue
        usage = span.usage_details
        cost = span.cost_details
        cached = int(usage.get("input_cached", usage.get("cached", 0)) or 0)
        uncached = int(usage.get("input", 0) or 0)
        total_cost = cost.get("total")
        if total_cost is None:
            total_cost = sum(float(value or 0.0) for value in cost.values())
        costs.append(
            UsageCost(
                category="agent",
                model=span.model or "",
                input_tokens=uncached + cached,
                output_tokens=int(usage.get("output", 0) or 0),
                cached_tokens=cached,
                reasoning_tokens=int(usage.get("output_reasoning", usage.get("reasoning", 0)) or 0),
                cost_usd=float(total_cost or 0.0),
            )
        )
    return tuple(costs)


class PermissionAgentAdapter:
    """Normalize ``TargetAgent`` inputs and durable trace/evidence outputs."""

    def __init__(self, agent: Any, store: TraceStore):
        self._agent = agent
        self._store = store

    async def run(self, case: TestCase, run_id: str) -> AgentAdapterResult:
        result = await self._agent.run(
            query=str(case.input.get("query", "")),
            user_id=str(case.input.get("user_id", "eval-user")),
            user_role=str(case.input.get("user_role", "user")),
            scenario=str(case.metadata.get("scenario", "unknown")),
            tags=[run_id, *case.tags],
            inject_bug=case.metadata.get("inject_bug"),
        )
        trace_id = str(result.get("trace_id") or "")
        if not trace_id:
            raise RuntimeError("agent did not produce a trace id")
        self._agent.tracer.flush()
        trace = self._store.get_trace(trace_id, retry=True)
        return AgentAdapterResult(
            response=str(result.get("response", "")),
            trace_id=trace_id,
            trace=trace,
            tool_evidence=tuple(result.get("tool_evidence") or ()),
            usage_costs=_generation_costs(trace),
        )
