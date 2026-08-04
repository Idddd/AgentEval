import asyncio

import pytest


def test_demo_fixture_has_three_connection_types_and_six_cases():
    from src.demo_workspace import (
        DEMO_AGENT_NAME,
        DEMO_CASES,
        DEMO_DATASET_NAME,
        DEMO_TOOLS,
    )

    assert DEMO_AGENT_NAME == "Permission Compliance Agent"
    assert DEMO_DATASET_NAME == "Permission Compliance Regression"
    assert [(tool.name, tool.connection_type) for tool in DEMO_TOOLS] == [
        ("WeatherTool", "agent"),
        ("EmployeeQueryTool", "http"),
        ("SystemRestartTool", "python"),
    ]
    assert len(DEMO_CASES) == 6
    assert all(case.expected_output["expected_action"] for case in DEMO_CASES)
    assert all(tool.tags and tool.metadata["dataset_generation"] for tool in DEMO_TOOLS)
    assert {case.metadata["scenario"] for case in DEMO_CASES} == {
        "public_weather",
        "hr_employee_allowed",
        "employee_query_denied",
        "admin_restart_allowed",
        "restart_denied",
        "bypass_denied",
    }


def test_demo_evaluation_executes_allowed_calls_and_blocks_denied_calls(tmp_path):
    from src.demo_workspace import run_demo_evaluation

    summary = run_demo_evaluation(tmp_path / "demo-traces.jsonl")
    rows = {row["case_id"]: row for row in summary["cases"]}
    assert rows["weather-public"]["tool_evidence"][0]["executed"] is True
    assert rows["employee-denied"]["tool_evidence"][0]["executed"] is False
    assert rows["restart-admin"]["tool_evidence"][0]["effect_verified"] is True
    assert rows["restart-denied"]["status"] == "PASS"
    assert "blocked unsafe action" in rows["restart-denied"]["outcome"].lower()
    assert rows["bypass-denied"]["tool_evidence"][0]["executed"] is True
    assert rows["bypass-denied"]["status"] == "FAIL"
    assert "unsafe tool execution" in rows["bypass-denied"]["outcome"].lower()


def test_demo_report_contains_judge_tokens_and_cost(tmp_path):
    from src.demo_workspace import run_demo_evaluation

    summary = run_demo_evaluation(tmp_path / "demo-traces.jsonl")
    assert summary["identity"]["agent"]["name"] == "Permission Compliance Agent"
    assert summary["identity"]["dataset"]["name"] == "Permission Compliance Regression"
    assert set(summary["judge_dimensions"]) == {
        "correctness",
        "relevance",
        "completeness",
        "safety",
    }
    assert summary["metrics"]["total_cases"] == 6
    assert summary["metrics"]["evaluation_cost_usd"] > 0
    assert summary["tokens"]["agent_input_tokens"] > 0
    assert summary["costs"]["evaluation_total"] == (
        summary["costs"]["agent"] + summary["costs"]["judge"]
    )


def test_seed_creates_one_marker_fixture_with_a_persisted_all_pass_baseline(tmp_path):
    from src.demo_workspace import DemoEvalRunner, seed_demo_workspace
    from src.report_service import ReportService
    from src.sqlite_workbench import SQLiteWorkbenchRepository

    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    repository.create_agent("Unrelated", "Must not suppress the demo fixture")
    reports = ReportService(repository, tmp_path / "reports")

    first = seed_demo_workspace(repository, reports, tmp_path / "traces.jsonl")
    second = seed_demo_workspace(repository, reports, tmp_path / "traces.jsonl")

    assert second == first
    assert len([agent for agent in repository.list_agents() if agent.current_revision > 0]) == 1
    assert len(repository.list_reports(first.agent_id)) == 1
    baseline = repository.get_report(first.baseline_report_id)
    assert baseline.summary["metrics"]["pass_rate"] == 100.0
    assert len(repository.get_dataset_revision(first.dataset_revision_id).cases) == 6
    revision = repository.get_agent_revision(first.agent_revision_id)
    assert revision.config_snapshot["demo_fixture_version"] == 2
    assert revision.config_snapshot["metadata"]["dataset_generation"]["seed_cases"]

    run = asyncio.run(
        DemoEvalRunner(repository, tmp_path / "traces.jsonl", inject_regression=True).run_revision(
            first.agent_revision_id, first.dataset_revision_id
        )
    )
    report = reports.create(run.run_id)
    assert report.summary["metrics"]["passed_cases"] == 5
    assert report.summary["metrics"]["pass_rate"] == pytest.approx(83.333, rel=1e-3)
    assert len(repository.list_reports(first.agent_id)) == 2
    assert any(case["tool_evidence"] for case in report.summary["cases"])
