"""Mapping between workbench models and the TaskLattice Evaluations UI shapes."""
from __future__ import annotations

from typing import Any

from src.workbench_models import (
    AgentProfile,
    AgentRevision,
    CaseResult,
    DatasetColumn,
    DatasetProfile,
    DatasetRevision,
    DatasetSchema,
    EvalRun,
    ReportSnapshot,
    RunStatus,
    TestCase,
)


def dataset_schema_to_ui(schema: DatasetSchema) -> list[dict]:
    role_map = {"input": "INPUT", "output": "EXPECTED"}
    type_map = {"string": "STRING", "json": "JSON", "number": "NUMBER", "boolean": "BOOLEAN"}
    return [
        {
            "name": col.name,
            "role": role_map.get(col.kind, col.kind.upper()),
            "type": type_map.get(col.data_type, col.data_type.upper()),
        }
        for col in schema.columns
    ]


def ui_schema_to_dataset_schema(items: list[dict]) -> DatasetSchema:
    kind_map = {"INPUT": "input", "EXPECTED": "output"}
    data_map = {"STRING": "string", "JSON": "json", "NUMBER": "number", "BOOLEAN": "boolean"}
    return DatasetSchema(
        tuple(
            DatasetColumn(
                str(item["name"]),
                kind_map.get(str(item.get("role", "")), "input"),
                data_map.get(str(item.get("type", "")), "string"),
                required=True,
            )
            for item in items
        )
    )


def case_to_ui_case(case: TestCase) -> dict:
    expected = dict(case.expected_output)
    return {
        "id": case.case_id,
        "input": dict(case.input),
        "expected": {
            "outcome": expected.get("outcome", "ALLOW"),
            "tool": expected.get("tool"),
            "reason": expected.get("reason", ""),
        },
        "source": str(case.source).upper(),
    }


def ui_case_to_case(item: dict) -> TestCase:
    expected = item["expected"]
    return TestCase(
        case_id=str(item["id"]),
        input=dict(item["input"]),
        expected_output={
            "outcome": expected.get("outcome", "ALLOW"),
            "tool": expected.get("tool"),
            "reason": expected.get("reason", ""),
        },
        source=str(item.get("source", "MANUAL")).lower(),
    )


def agent_profile_to_target(agent: AgentProfile, current_revision_id: str | None) -> dict:
    return {
        "id": agent.agent_id,
        "name": agent.name,
        "description": agent.description,
        "currentRevisionId": current_revision_id or "",
        "createdAt": agent.created_at,
        "updatedAt": agent.updated_at or agent.created_at,
    }


def agent_revision_to_target_revision(revision: AgentRevision) -> dict:
    config = revision.config_snapshot
    return {
        "id": revision.revision_id,
        "targetId": revision.agent_id,
        "revision": revision.revision,
        "model": {
            "id": config.get("model_id", ""),
            "name": config.get("model_name", ""),
        },
        "systemPrompt": config.get("system_prompt", ""),
        "tools": [tool.name for tool in revision.tools],
        "mcpServers": list(config.get("mcp_servers", [])),
        "knowledgeBases": list(config.get("knowledge_bases", [])),
        "createdAt": revision.created_at,
    }


def dataset_profile_to_record(
    profile: DatasetProfile,
    cases: list[TestCase],
    current_revision_id: str | None,
) -> dict:
    return {
        "id": profile.dataset_id,
        "targetId": profile.agent_id,
        "name": profile.name,
        "description": profile.description,
        "currentRevisionId": current_revision_id,
        "draftCases": [case_to_ui_case(case) for case in cases],
        "updatedAt": profile.updated_at or profile.created_at,
    }


def revision_schema(revision: DatasetRevision) -> DatasetSchema:
    """Derive the schema from the first case's keys when no stored schema exists."""
    columns = []
    if revision.cases:
        first = revision.cases[0]
        for key in first.input:
            columns.append(DatasetColumn(key, "input", "string", required=True))
        for key in first.expected_output:
            columns.append(DatasetColumn(key, "output", "string", required=True))
    return DatasetSchema(tuple(columns))


def dataset_revision_to_dto(revision: DatasetRevision) -> dict:
    return {
        "id": revision.revision_id,
        "datasetId": revision.dataset_id,
        "revision": revision.revision,
        "schema": dataset_schema_to_ui(revision_schema(revision)),
        "cases": [case_to_ui_case(case) for case in revision.cases],
        "createdAt": revision.created_at,
    }


def case_result_to_dto(result: CaseResult, expected_case: dict | None) -> dict:
    agent_costs = [cost for cost in result.usage_costs if cost.category == "agent"]
    input_tokens = sum(cost.input_tokens for cost in agent_costs)
    output_tokens = sum(cost.output_tokens for cost in agent_costs)
    cost_usd = round(sum(cost.cost_usd for cost in result.usage_costs), 4)
    evidence = []
    for entry in result.tool_evidence:
        allowed = bool(expected_case and expected_case.get("outcome") == "ALLOW")
        evidence.append(
            {
                "tool": entry.tool_id,
                "requested": entry.requested,
                "allowed": allowed,
                "called": entry.executed,
            }
        )
    dto: dict[str, Any] = {
        "caseId": result.case_id,
        "status": result.status if result.status in ("PASS", "FAIL", "BLOCKED") else "PASS",
        "actualOutcome": result.deterministic_reasons.get("actual_outcome"),
        "reason": result.deterministic_reasons.get("reason"),
        "durationMs": result.deterministic_scores.get("duration_ms"),
        "inputTokens": input_tokens or None,
        "outputTokens": output_tokens or None,
        "costUsd": cost_usd or None,
        "toolEvidence": evidence,
    }
    judge_score = result.deterministic_scores.get("judge_score")
    if judge_score is not None:
        dto["judge"] = {
            "score": judge_score,
            "rationale": result.deterministic_reasons.get("judge_rationale", ""),
        }
    return dto


def run_status_to_ui(status: RunStatus, results: tuple[CaseResult, ...]) -> str:
    if status in (RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.PARTIAL):
        return "RUNNING"
    if status == RunStatus.FAILED:
        return "FAIL"
    failed = any(item.status in ("FAIL", "BLOCKED") for item in results)
    return "FAIL" if failed else "PASS"


def run_to_dto(
    run: EvalRun,
    target_revision: AgentRevision,
    dataset_revision: DatasetRevision,
    report_id: str | None,
) -> dict:
    by_case = {item.case_id: item for item in run.case_results}
    results = []
    for case in dataset_revision.cases:
        if case.case_id in by_case:
            results.append(
                case_result_to_dto(
                    by_case[case.case_id],
                    _expected_case(dataset_revision, case.case_id),
                )
            )
        else:
            results.append({"caseId": case.case_id, "status": "PENDING"})
    status = run_status_to_ui(run.status, run.case_results)
    stage = run.stage or ("report" if report_id else "evaluate")
    return {
        "id": run.run_id,
        "targetId": run.agent_id,
        "targetRevisionId": run.agent_revision_id,
        "datasetRevisionId": run.dataset_revision_id,
        "status": status,
        "stage": stage,
        "results": results,
        "reportId": report_id,
        "createdAt": run.created_at or run.started_at,
        "startedAt": run.started_at,
        "completedAt": run.completed_at,
    }


def _expected_case(dataset_revision: DatasetRevision, case_id: str) -> dict | None:
    for case in dataset_revision.cases:
        if case.case_id == case_id:
            return {
                "outcome": case.expected_output.get("outcome", "ALLOW"),
                "tool": case.expected_output.get("tool"),
            }
    return None


def report_to_dto(report: ReportSnapshot, run: EvalRun) -> dict:
    summary = report.summary
    metrics = summary.get("metrics")
    costs = summary.get("costs")
    if metrics is None:
        metrics = build_report_summary(run.case_results)["metrics"]
    if costs is None:
        costs = build_report_summary(run.case_results)["costs"]
    return {
        "id": report.report_id,
        "runId": report.run_id,
        "targetId": run.agent_id,
        "status": report.status,
        "metrics": metrics,
        "costs": costs,
        "createdAt": report.created_at,
    }


def build_report_summary(results: tuple[CaseResult, ...]) -> dict:
    passed = sum(1 for item in results if item.status == "PASS")
    failed = sum(1 for item in results if item.status in ("FAIL", "BLOCKED"))
    total = len(results)
    pass_rate = round((passed / total) * 100, 1) if total else 0.0
    agent = round(
        sum(
            cost.cost_usd
            for item in results
            for cost in item.usage_costs
            if cost.category == "agent"
        ),
        4,
    )
    judge = round(total * 0.0004, 4)
    return {
        "metrics": {"passRate": pass_rate, "passed": passed, "failed": failed, "blocked": 0},
        "costs": {"agent": agent, "judge": judge, "evaluationTotal": round(agent + judge, 4)},
    }


def compare_runs_ui(baseline: EvalRun, current: EvalRun) -> dict:
    """UI-shaped comparison matching scenario-engine compareReports semantics."""
    baseline_status = {item.case_id: item.status for item in baseline.case_results}
    current_status = {item.case_id: item.status for item in current.case_results}
    shared = sorted(set(baseline_status) & set(current_status))

    def failed(status: str) -> bool:
        return status in ("FAIL", "BLOCKED")

    return {
        "sharedCaseIds": shared,
        "regressions": [
            case_id
            for case_id in shared
            if not failed(baseline_status[case_id]) and failed(current_status[case_id])
        ],
        "resolvedFailures": [
            case_id
            for case_id in shared
            if failed(baseline_status[case_id]) and not failed(current_status[case_id])
        ],
        "unchangedFailures": [
            case_id
            for case_id in shared
            if failed(baseline_status[case_id]) and failed(current_status[case_id])
        ],
        "addedCases": sorted(set(current_status) - set(baseline_status)),
        "removedCases": sorted(set(baseline_status) - set(current_status)),
    }
