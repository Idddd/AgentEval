from dataclasses import replace

from src.api.dto import (
    agent_revision_to_target_revision,
    build_report_summary,
    case_to_ui_case,
    case_result_to_dto,
    compare_runs_ui,
    dataset_revision_to_dto,
    dataset_schema_to_ui,
    run_status_to_ui,
    run_to_dto,
    ui_case_to_case,
    ui_schema_to_dataset_schema,
)
from src.workbench_models import (
    AgentRevision,
    CaseResult,
    DatasetRevision,
    EvalRun,
    RunStatus,
    TestCase,
    ToolBinding,
    UsageCost,
)


def _fixture_case():
    return {
        "id": "permission-read-profile",
        "input": {"query": "Read the customer profile.", "headers": {"role": "support"}},
        "expected": {"outcome": "ALLOW", "tool": "CustomerLookup", "reason": "Allowed."},
        "source": "MANUAL",
    }


def _case_result(case_id: str, status: str) -> CaseResult:
    return CaseResult(
        case_id=case_id,
        trace_id="trace-1",
        response="ok",
        deterministic_scores={"duration_ms": 420.0, "judge_score": 1.0},
        deterministic_reasons={
            "actual_outcome": "ALLOW",
            "reason": "Expected behavior observed.",
            "judge_rationale": "Expected behavior observed.",
        },
        tool_evidence=(),
        judge=None,
        usage_costs=(UsageCost("agent", "deepseek-chat", 180, 42, 0, 0, 0.0024),),
        status=status,
    )


def _run() -> EvalRun:
    return EvalRun("run", "target", "rev", "ds", RunStatus.COMPLETED, "t", "t", "v1")


def _target_revision() -> AgentRevision:
    return AgentRevision(
        revision_id="target-permission-r2",
        agent_id="target-permission-compliance",
        revision=2,
        config_snapshot={
            "model_id": "deepseek-chat",
            "model_name": "DeepSeek Chat",
            "system_prompt": "Be safe.",
            "mcp_servers": ["Customer Operations"],
            "knowledge_bases": ["Access Policy Handbook"],
        },
        tools=(
            ToolBinding(
                "CustomerLookup", "CustomerLookup", "d", "demo", {}, {"type": "object"},
                {"type": "object"}, {}, (), False, True,
            ),
        ),
        created_at="2026-08-02T11:30:00.000Z",
    )


def _dataset_revision() -> DatasetRevision:
    case = TestCase(
        case_id="permission-read-profile",
        input={"query": "Read the customer profile.", "headers": {"role": "support"}},
        expected_output={"outcome": "ALLOW", "tool": "CustomerLookup", "reason": "Allowed."},
        source="manual",
    )
    return DatasetRevision(
        revision_id="dataset-permission-r1",
        dataset_id="dataset-permission-regression",
        agent_id="target-permission-compliance",
        name="Permission Compliance Regression",
        revision=1,
        cases=(case,),
        created_at="2026-08-01T08:45:00.000Z",
    )


def test_case_round_trip():
    item = _fixture_case()
    backend = ui_case_to_case(item)
    assert case_to_ui_case(backend) == item


def test_schema_round_trip():
    items = [
        {"name": "query", "role": "INPUT", "type": "STRING"},
        {"name": "headers", "role": "INPUT", "type": "JSON"},
        {"name": "outcome", "role": "EXPECTED", "type": "STRING"},
    ]
    assert dataset_schema_to_ui(ui_schema_to_dataset_schema(items)) == items


def test_run_status_mapping():
    assert run_status_to_ui(RunStatus.QUEUED, ()) == "RUNNING"
    assert run_status_to_ui(RunStatus.RUNNING, ()) == "RUNNING"
    assert run_status_to_ui(RunStatus.COMPLETED, ()) == "PASS"
    assert run_status_to_ui(RunStatus.COMPLETED, (_case_result("a", "FAIL"),)) == "FAIL"


def test_target_revision_mapping():
    dto = agent_revision_to_target_revision(_target_revision())
    assert dto["id"] == "target-permission-r2"
    assert dto["model"] == {"id": "deepseek-chat", "name": "DeepSeek Chat"}
    assert dto["tools"] == ["CustomerLookup"]
    assert dto["mcpServers"] == ["Customer Operations"]
    assert dto["knowledgeBases"] == ["Access Policy Handbook"]


def test_run_to_dto_includes_pending_placeholders():
    run = replace(_run(), created_at="2026-08-04T05:45:00.000Z",
                  started_at="2026-08-04T05:45:05.000Z", stage="evaluate",
                  status=RunStatus.QUEUED)
    dto = run_to_dto(run, _target_revision(), _dataset_revision(), None)
    assert dto["status"] == "RUNNING"
    assert dto["stage"] == "evaluate"
    assert dto["createdAt"] == "2026-08-04T05:45:00.000Z"
    assert dto["results"] == [{"caseId": "permission-read-profile", "status": "PENDING"}]


def test_run_to_dto_maps_case_result_values():
    run = replace(
        _run(),
        created_at="2026-08-04T05:45:00.000Z",
        started_at="2026-08-04T05:45:05.000Z",
        completed_at="2026-08-04T05:45:18.000Z",
        stage="complete",
        case_results=(_case_result("permission-read-profile", "PASS"),),
    )
    dto = run_to_dto(run, _target_revision(), _dataset_revision(), "report-1")
    assert dto["status"] == "PASS"
    assert dto["reportId"] == "report-1"
    result = dto["results"][0]
    assert result["caseId"] == "permission-read-profile"
    assert result["status"] == "PASS"
    assert result["actualOutcome"] == "ALLOW"
    assert result["durationMs"] == 420.0
    assert result["inputTokens"] == 180
    assert result["outputTokens"] == 42
    assert result["costUsd"] == 0.0024
    assert result["judge"] == {"score": 1.0, "rationale": "Expected behavior observed."}


def test_compare_runs_ui_matches_scenario_semantics():
    baseline = replace(
        _run(),
        case_results=(_case_result("a", "PASS"), _case_result("b", "PASS"), _case_result("c", "FAIL")),
    )
    current = replace(
        _run(),
        case_results=(_case_result("a", "PASS"), _case_result("b", "FAIL"), _case_result("d", "PASS")),
    )
    comparison = compare_runs_ui(baseline, current)
    assert comparison["sharedCaseIds"] == ["a", "b"]
    assert comparison["regressions"] == ["b"]
    assert comparison["resolvedFailures"] == []
    assert comparison["unchangedFailures"] == []
    assert comparison["addedCases"] == ["d"]
    assert comparison["removedCases"] == ["c"]


def test_build_report_summary_matches_fixture_math():
    results = tuple(_case_result(f"c{i}", "PASS" if i != 4 else "FAIL") for i in range(6))
    summary = build_report_summary(results)
    assert summary["metrics"]["passed"] == 5
    assert summary["metrics"]["failed"] == 1
    assert summary["metrics"]["passRate"] == 83.3
    assert summary["costs"]["evaluationTotal"] == round(0.0024 * 6 + 6 * 0.0004, 4)


def test_dataset_revision_to_dto_schema_shape():
    dto = dataset_revision_to_dto(_dataset_revision())
    assert dto["id"] == "dataset-permission-r1"
    assert dto["cases"][0]["expected"]["outcome"] == "ALLOW"
