import asyncio

import pytest


def test_demo_fixture_has_three_connection_types_and_nine_cases():
    from src.demo_workspace import (
        DEMO_AGENT_NAME,
        DEMO_CASES,
        DEMO_DATASET_NAME,
        DEMO_TOOLS,
    )

    assert DEMO_AGENT_NAME == "Demo Agent"
    assert DEMO_DATASET_NAME == "Permission Compliance Regression"
    assert [(tool.name, tool.connection_type) for tool in DEMO_TOOLS] == [
        ("WeatherTool", "agent"),
        ("EmployeeQueryTool", "http"),
        ("SystemRestartTool", "python"),
    ]
    assert len(DEMO_CASES) == 9
    assert [case.metadata["scenario"] for case in DEMO_CASES].count("normal_low") == 2
    assert [case.metadata["scenario"] for case in DEMO_CASES].count("normal_high") == 2
    assert [case.metadata["scenario"] for case in DEMO_CASES].count("deny_no_permission") == 2
    assert [case.metadata["scenario"] for case in DEMO_CASES].count("deny_insufficient") == 2
    assert [case.metadata["scenario"] for case in DEMO_CASES].count("demo_bypass") == 1
    assert {case.metadata["scenario"] for case in DEMO_CASES} == {
        "normal_low",
        "normal_high",
        "deny_no_permission",
        "deny_insufficient",
        "demo_bypass",
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


def test_demo_report_defers_judge_tokens_and_cost(tmp_path):
    from src.demo_workspace import run_demo_evaluation

    summary = run_demo_evaluation(tmp_path / "demo-traces.jsonl")
    assert summary["identity"]["agent"]["name"] == "Demo Agent"
    assert summary["identity"]["dataset"]["name"] == "Permission Compliance Regression"
    assert summary["judge_dimensions"] == {}
    assert summary["metrics"]["total_cases"] == 9
    assert summary["metrics"]["evaluation_cost_usd"] > 0
    assert summary["tokens"]["agent_input_tokens"] > 0
    assert summary["tokens"]["judge_input_tokens"] == 0
    assert summary["costs"]["judge"] == 0
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
    assert repository.get_agent(first.agent_id).name == "Demo Agent"
    assert len([agent for agent in repository.list_agents() if agent.current_revision > 0]) == 1
    assert len(repository.list_reports(first.agent_id)) == 1
    baseline = repository.get_report(first.baseline_report_id)
    assert baseline.summary["metrics"]["pass_rate"] == 100.0
    assert len(repository.get_dataset_revision(first.dataset_revision_id).cases) == 9

    run = asyncio.run(
        DemoEvalRunner(repository, tmp_path / "traces.jsonl", inject_regression=True).run_revision(
            first.agent_revision_id, first.dataset_revision_id
        )
    )
    report = reports.create(run.run_id)
    assert report.summary["metrics"]["passed_cases"] == 8
    assert report.summary["metrics"]["pass_rate"] == pytest.approx(88.889, rel=1e-3)
    assert len(repository.list_reports(first.agent_id)) == 2
    assert any(case["tool_evidence"] for case in report.summary["cases"])


def test_seed_migrates_the_existing_demo_name_and_six_case_dataset(tmp_path):
    from src.demo_workspace import DEMO_CASES, seed_demo_workspace
    from src.report_service import ReportService
    from src.sqlite_workbench import SQLiteWorkbenchRepository

    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    reports = ReportService(repository, tmp_path / "reports")
    seed = seed_demo_workspace(repository, reports, tmp_path / "traces.jsonl")
    repository.rename_agent(seed.agent_id, "Permission Compliance Agent")
    additions = {"weather-admin", "employee-guest-denied", "restart-hr-denied"}
    repository.replace_draft_cases(
        seed.dataset_id,
        [case for case in DEMO_CASES if case.case_id not in additions],
    )

    same_seed = seed_demo_workspace(repository, reports, tmp_path / "traces.jsonl")

    assert same_seed == seed
    assert repository.get_agent(seed.agent_id).name == "Demo Agent"
    assert len(repository.list_draft_cases(seed.dataset_id)) == 9
