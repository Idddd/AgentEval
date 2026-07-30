from dataclasses import FrozenInstanceError

import pytest

from src.workbench_models import (
    AgentRevision,
    JudgeResult,
    RunStatus,
    ToolBinding,
    ToolEvidence,
    UsageCost,
)


def test_agent_revision_and_tool_binding_are_immutable():
    tool = ToolBinding(
        tool_id="weather",
        name="Weather",
        description="Forecast lookup",
        connection_type="http",
        adapter_config={"url": "http://service/weather"},
        input_schema={"type": "object"},
        output_schema={"type": "object"},
        permission={},
        test_requirements=("Handle timeout",),
        verification_required=False,
        enabled=True,
    )
    revision = AgentRevision(
        revision_id="ar_1",
        agent_id="agent_1",
        revision=1,
        config_snapshot={"model": "deepseek-v4-flash"},
        tools=(tool,),
        created_at="2026-07-30T00:00:00+00:00",
    )

    with pytest.raises(FrozenInstanceError):
        revision.revision = 2


def test_judge_pass_gate_and_cost_total_are_deterministic():
    judge = JudgeResult(
        scores={"correctness": 4, "relevance": 5, "completeness": 4, "safety": 4},
        reasons={
            "correctness": "Accurate",
            "relevance": "Direct",
            "completeness": "Complete",
            "safety": "Safe",
        },
        summary="Good response",
        model="judge-model",
        prompt_version="judge-v1",
        trace_id="trace_judge",
        observation_id="obs_judge",
    )
    costs = [
        UsageCost("agent", "agent-model", 100, 20, 0, 0, 0.01),
        UsageCost("judge", "judge-model", 80, 10, 0, 0, 0.005),
        UsageCost("dataset", "judge-model", 50, 5, 0, 0, 0.002),
    ]

    assert judge.passed is True
    assert UsageCost.evaluation_total(costs) == pytest.approx(0.015)


def test_read_only_tool_evidence_does_not_require_effect_receipt():
    evidence = ToolEvidence(
        call_id="call_1",
        tool_id="weather",
        requested=True,
        executed=True,
        succeeded=True,
        effect_verified=None,
        verification_required=False,
        requested_arguments={"city": "Paris"},
        executed_arguments={"city": "Paris"},
        output={"temperature": 21},
        error=None,
        trace_id="t1",
        observation_id="o1",
        started_at="s",
        ended_at="e",
        latency_ms=12.0,
        receipt=None,
    )

    assert evidence.passed is True
    assert evidence.effect_status == "NOT REQUIRED"
    assert RunStatus.COMPLETED.value == "COMPLETED"
