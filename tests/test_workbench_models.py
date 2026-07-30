from dataclasses import FrozenInstanceError

import pytest

from src.workbench_models import (
    AgentRevision,
    DatasetRevision,
    JudgeResult,
    RunStatus,
    TestCase as WorkbenchTestCase,
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


def test_immutable_json_arrays_have_coherent_equality():
    case = WorkbenchTestCase(
        case_id="case_1",
        input={"values": [1, 2]},
        expected_output={},
    )

    values = case.input["values"]

    assert values == [1, 2]
    assert not values != [1, 2]
    assert values != [1, 3]


def test_revision_snapshots_deeply_freeze_nested_mappings_and_collections():
    tool = ToolBinding(
        tool_id="weather",
        name="Weather",
        description="Forecast lookup",
        connection_type="http",
        adapter_config={"request": {"url": "http://service/weather"}},
        input_schema={"properties": {"city": {"type": "string"}}},
        output_schema={"fields": ["temperature"]},
        permission={"scopes": ["read"]},
        test_requirements=("Handle timeout",),
        verification_required=False,
        enabled=True,
    )
    agent_revision = AgentRevision(
        revision_id="ar_1",
        agent_id="agent_1",
        revision=1,
        config_snapshot={"model": {"name": "deepseek-v4-flash"}},
        tools=(tool,),
        created_at="2026-07-30T00:00:00+00:00",
    )
    dataset_revision = DatasetRevision(
        revision_id="dr_1",
        dataset_id="dataset_1",
        agent_id="agent_1",
        name="Weather cases",
        revision=1,
        cases=(
            WorkbenchTestCase(
                case_id="case_1",
                input={"cities": ["Paris"]},
                expected_output={"forecast": {"unit": "C"}},
                metadata={"source": {"name": "manual"}},
            ),
        ),
        created_at="2026-07-30T00:00:00+00:00",
    )

    with pytest.raises(TypeError):
        agent_revision.config_snapshot["model"]["name"] = "changed"
    with pytest.raises(TypeError):
        agent_revision.tools[0].input_schema["properties"]["city"]["type"] = "number"
    with pytest.raises(AttributeError):
        agent_revision.tools[0].output_schema["fields"].append("humidity")
    with pytest.raises(AttributeError):
        dataset_revision.cases[0].input["cities"].append("London")
    with pytest.raises(TypeError):
        dataset_revision.cases[0].metadata["source"]["name"] = "generated"


@pytest.mark.parametrize(
    "scores",
    [
        {"safety": 4},
        {"correctness": 4, "relevance": 4, "completeness": 4, "safety": 0},
        {"correctness": 4, "relevance": 4, "completeness": 4, "safety": 6},
        {
            "correctness": 4,
            "relevance": 4,
            "completeness": 4,
            "safety": 4,
            "style": 4,
        },
    ],
)
def test_judge_result_rejects_missing_extra_or_out_of_range_rubric_scores(scores):
    with pytest.raises(ValueError):
        JudgeResult(
            scores=scores,
            reasons={},
            summary="Good response",
            model="judge-model",
            prompt_version="judge-v1",
            trace_id="trace_judge",
            observation_id="obs_judge",
        )
