import pytest

from src.ui.datasets import (
    _case_from_mapping,
    _case_from_review_record,
    _filter_new_review_cases,
    parse_imported_cases,
)
from src.workbench_models import DatasetColumn, DatasetSchema, TestCase as WorkbenchTestCase


def _schema() -> DatasetSchema:
    return DatasetSchema(
        columns=(
            DatasetColumn("query", "input", "string", required=True),
            DatasetColumn("headers", "input", "json", required=False),
            DatasetColumn("expected_tool_called", "output", "string", required=False),
            DatasetColumn("expected_score", "output", "number", required=False),
        )
    )


def test_case_from_mapping_routes_input_and_output_fields_via_schema():
    schema = _schema()
    item = {
        "input": {"query": "hi", "headers": {"Accept": "json"}},
        "expected_output": {"expected_tool_called": "search", "expected_score": 4},
    }

    case = _case_from_mapping(item, schema=schema, source="llm")

    assert case.input == {"query": "hi", "headers": {"Accept": "json"}}
    assert case.expected_output == {"expected_tool_called": "search", "expected_score": 4}
    assert case.source == "llm"


def test_case_from_mapping_ignores_extra_fields_not_in_schema():
    schema = _schema()
    item = {
        "input": {"query": "hi", "rogue": "ignored"},
        "expected_output": {"expected_tool_called": "x", "extra": "dropped"},
    }

    case = _case_from_mapping(item, schema=schema, source="json")

    assert case.input == {"query": "hi"}
    assert case.expected_output == {"expected_tool_called": "x"}


def test_case_from_mapping_generates_case_id_when_missing():
    schema = _schema()
    case = _case_from_mapping(
        {"input": {"query": "hi"}},
        schema=schema,
        source="manual",
    )

    assert case.case_id


def test_case_from_mapping_preserves_reference_answer_tags_and_metadata():
    schema = _schema()
    item = {
        "input": {"query": "hi"},
        "reference_answer": "expected response",
        "tags": ["red", "blue"],
        "metadata": {"coverage": "tool"},
    }

    case = _case_from_mapping(item, schema=schema, source="manual")

    assert case.reference_answer == "expected response"
    assert case.tags == ("red", "blue")
    assert case.metadata == {"coverage": "tool"}


def test_case_from_mapping_raises_when_required_input_missing():
    schema = _schema()

    with pytest.raises(ValueError, match="query"):
        _case_from_mapping({"input": {}}, schema=schema, source="llm")


def test_case_from_mapping_raises_when_required_input_empty_string():
    schema = _schema()

    with pytest.raises(ValueError, match="query"):
        _case_from_mapping(
            {"input": {"query": ""}},
            schema=schema,
            source="llm",
        )


def test_case_from_mapping_raises_when_field_has_wrong_type():
    schema = _schema()

    with pytest.raises(ValueError, match="expected_score"):
        _case_from_mapping(
            {
                "input": {"query": "hi"},
                "expected_output": {"expected_score": "high"},
            },
            schema=schema,
            source="llm",
        )


def test_case_from_mapping_rejects_non_object_input():
    schema = _schema()

    with pytest.raises(ValueError, match="input"):
        _case_from_mapping({"input": "not-an-object"}, schema=schema, source="llm")


def test_case_from_review_record_routes_values_and_preserves_provenance():
    schema = _schema()
    draft = WorkbenchTestCase(
        "generated-1",
        {"query": "original"},
        {"expected_tool_called": "search"},
        tags=("generated",),
        source="demo-fallback",
        metadata={"provenance": {"tool_id": "search"}},
    )

    case = _case_from_review_record(
        {
            "query": "edited",
            "headers": '{"Accept": "application/json"}',
            "expected_tool_called": "",
            "expected_score": 4.5,
        },
        schema,
        draft,
    )

    assert case.case_id == "generated-1"
    assert case.input == {
        "query": "edited",
        "headers": {"Accept": "application/json"},
    }
    assert case.expected_output == {"expected_score": 4.5}
    assert case.tags == ("generated",)
    assert case.source == "demo-fallback"
    assert case.metadata == {"provenance": {"tool_id": "search"}}


def test_filter_new_review_cases_skips_existing_and_repeated_inputs():
    existing = [WorkbenchTestCase("existing", {"query": "same"}, {})]
    candidates = [
        WorkbenchTestCase("generated-1", {"query": "same"}, {}),
        WorkbenchTestCase("generated-2", {"query": "new"}, {}),
        WorkbenchTestCase("generated-3", {"query": "new"}, {}),
    ]

    selected, skipped = _filter_new_review_cases(existing, candidates)

    assert [case.case_id for case in selected] == ["generated-2"]
    assert skipped == 2


def test_parse_imported_cases_returns_test_cases_for_valid_payload():
    schema = _schema()
    payload = '[{"input": {"query": "a"}}, {"input": {"query": "b"}}]'

    cases = parse_imported_cases(payload, schema=schema)

    assert [case.input["query"] for case in cases] == ["a", "b"]


def test_parse_imported_cases_raises_on_invalid_json():
    schema = _schema()

    with pytest.raises(ValueError, match="Invalid JSON"):
        parse_imported_cases("{not json", schema=schema)


def test_parse_imported_cases_raises_when_payload_is_not_array():
    schema = _schema()

    with pytest.raises(ValueError, match="JSON array"):
        parse_imported_cases('{"input": {"query": "x"}}', schema=schema)


def test_parse_imported_cases_raises_when_any_case_violates_schema():
    schema = _schema()
    payload = '[{"input": {"query": "ok"}}, {"input": {}}]'

    with pytest.raises(ValueError, match="query"):
        parse_imported_cases(payload, schema=schema)
