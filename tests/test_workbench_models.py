from dataclasses import FrozenInstanceError

import pytest

from src.workbench_models import (
    AgentRevision,
    CREATE_FORM_TEMPLATE,
    DEFAULT_DATASET_SCHEMA,
    DatasetColumn,
    DatasetRevision,
    DatasetSchema,
    JudgeResult,
    RunStatus,
    TestCase as WorkbenchTestCase,
    ToolBinding,
    ToolEvidence,
    UsageCost,
)


def test_new_dataset_template_exposes_the_three_required_schema_fields():
    """Renaming or removing a built-in field must break new Dataset creation."""
    assert [
        (column.name, column.kind, column.data_type, column.required)
        for column in CREATE_FORM_TEMPLATE.columns
    ] == [
        ("query", "input", "string", True),
        ("expected_action", "output", "string", True),
        ("header", "input", "json", False),
    ]


def test_default_dataset_schema_uses_the_creation_template():
    assert DEFAULT_DATASET_SCHEMA is CREATE_FORM_TEMPLATE


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


def _schema_with_columns(*columns: DatasetColumn) -> DatasetSchema:
    return DatasetSchema(columns=tuple(columns))


def test_dataset_schema_is_frozen_and_partitions_columns_by_kind():
    schema = _schema_with_columns(
        DatasetColumn("query", "input", "string", required=True),
        DatasetColumn("headers", "input", "json", required=False),
        DatasetColumn("expected_tool_called", "output", "string", required=False),
    )

    with pytest.raises(FrozenInstanceError):
        schema.columns[0].name = "changed"

    assert [c.name for c in schema.input_columns] == ["query", "headers"]
    assert [c.name for c in schema.output_columns] == ["expected_tool_called"]


def test_validate_case_returns_no_errors_for_conforming_case():
    schema = _schema_with_columns(
        DatasetColumn("query", "input", "string", required=True),
        DatasetColumn("headers", "input", "json", required=False),
        DatasetColumn("expected_tool_called", "output", "string", required=False),
        DatasetColumn("expected_score", "output", "number", required=False),
        DatasetColumn("flagged", "output", "boolean", required=False),
    )
    case = WorkbenchTestCase(
        case_id="c1",
        input={"query": "hello", "headers": {"Accept": "json"}},
        expected_output={
            "expected_tool_called": "search",
            "expected_score": 3,
            "flagged": True,
        },
    )

    assert schema.validate_case(case) == []


@pytest.mark.parametrize(
    "case, expected_error_fragment",
    [
        (
            WorkbenchTestCase("c", {"query": ""}, {"expected_tool_called": "x"}),
            "query",
        ),
        (
            WorkbenchTestCase("c", {"query": "hi"}, {"expected_tool_called": ""}),
            "expected_tool_called",
        ),
        (
            WorkbenchTestCase("c", {"query": 42}, {"expected_tool_called": "x"}),
            "query",
        ),
        (
            WorkbenchTestCase("c", {"query": "hi"}, {"expected_tool_called": "x", "expected_score": "high"}),
            "expected_score",
        ),
        (
            WorkbenchTestCase("c", {"query": "hi"}, {"expected_tool_called": "x", "flagged": "yes"}),
            "flagged",
        ),
        (
            WorkbenchTestCase("c", {"query": "hi", "headers": "not-json"}, {"expected_tool_called": "x"}),
            "headers",
        ),
    ],
)
def test_validate_case_reports_missing_or_wrongly_typed_fields(case, expected_error_fragment):
    schema = _schema_with_columns(
        DatasetColumn("query", "input", "string", required=True),
        DatasetColumn("headers", "input", "json", required=False),
        DatasetColumn("expected_tool_called", "output", "string", required=True),
        DatasetColumn("expected_score", "output", "number", required=False),
        DatasetColumn("flagged", "output", "boolean", required=False),
    )

    errors = schema.validate_case(case)

    assert errors
    assert any(expected_error_fragment in err for err in errors)


def test_validate_case_ignores_extra_fields_in_input_and_output():
    schema = _schema_with_columns(
        DatasetColumn("query", "input", "string", required=True),
    )
    case = WorkbenchTestCase(
        case_id="c",
        input={"query": "hi", "rogue_field": "ignored"},
        expected_output={"rogue_output": ["anything"]},
    )

    assert schema.validate_case(case) == []


def test_validate_case_treats_optional_empty_string_as_no_error():
    schema = _schema_with_columns(
        DatasetColumn("query", "input", "string", required=True),
        DatasetColumn("context", "input", "string", required=False),
    )
    case = WorkbenchTestCase("c", {"query": "hi", "context": ""}, {})

    assert schema.validate_case(case) == []


def test_optional_json_empty_string_is_not_valid_json():
    schema = _schema_with_columns(
        DatasetColumn("header", "input", "json", required=False),
    )
    case = WorkbenchTestCase("c", {"header": ""}, {})

    assert schema.validate_case(case) == [
        "input field 'header': expected json object or array, got str"
    ]


def test_boolean_column_rejects_int_zero_because_bool_is_int_subclass():
    schema = _schema_with_columns(
        DatasetColumn("flag", "output", "boolean", required=False),
    )
    case = WorkbenchTestCase("c", {"query": "hi"}, {"flag": 0})

    errors = schema.validate_case(case)

    assert errors
    assert any("flag" in err for err in errors)
