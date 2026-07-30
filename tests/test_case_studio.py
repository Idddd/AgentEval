from src.case_studio import candidate_to_item, candidate_to_test_case, coverage_gaps, validate_candidate
from src.config_loader import load_tools_config
from src.dataset_generator import build_items
from src.intent import parse_case_candidates


def test_valid_candidate_derives_expected_output():
    config = load_tools_config()
    draft = validate_candidate(
        {"tool_name": "EmployeeQueryTool", "user_role": "guest", "query": "Show Alice salary"},
        config, set(),
    )
    item = candidate_to_item(draft, config)
    assert item.metadata["scenario"] == "deny_no_permission"
    assert item.expected_output["expected_outcome"] == "denied"


def test_candidate_to_test_case_is_a_workbench_llm_case():
    config = load_tools_config()
    draft = validate_candidate(
        {"tool_name": "WeatherTool", "user_role": "guest", "query": "Weather in Rome"},
        config, set(),
    )

    case = candidate_to_test_case(draft, config, "dataset-id")

    assert case.source == "llm"
    assert case.metadata == {
        "scenario": "normal_low", "tool_name": "WeatherTool", "user_role": "guest"
    }
    assert case.expected_output["expected_outcome"] == "direct_call"


def test_coverage_gaps_identifies_missing_tool_role_pairs():
    config = load_tools_config()
    gaps = coverage_gaps(build_items(config), config)
    assert "WeatherTool × employee" in gaps


def test_llm_candidate_parser_accepts_markdown_json_fence():
    content = '''```json
[{"tool_name":"WeatherTool","user_role":"guest","query":"Weather in Rome","coverage_reason":"city"}]
```'''

    candidates = parse_case_candidates(content)

    assert candidates[0]["tool_name"] == "WeatherTool"


def test_llm_candidate_parser_reports_empty_response():
    try:
        parse_case_candidates("   ")
    except ValueError as error:
        assert str(error) == "The LLM returned an empty response"
    else:
        raise AssertionError("empty LLM response must fail")


def test_llm_candidate_parser_reports_truncated_response():
    try:
        parse_case_candidates('[{"query":"unfinished', stop_reason="max_tokens")
    except ValueError as error:
        assert str(error) == "The LLM response was truncated; generate fewer cases and retry"
    else:
        raise AssertionError("truncated LLM response must fail clearly")
