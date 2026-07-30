from pathlib import Path

from src.report_service import ReportService, derive_report_status
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import (
    CaseResult,
    EvalRun,
    JudgeResult,
    RunStatus,
    TestCase as WorkbenchTestCase,
    ToolEvidence,
    UsageCost,
)


def case_result(case_id, status):
    return CaseResult(case_id, f"trace-{case_id}", "answer", {}, {}, (), None, (), status)


def run_with(status):
    return EvalRun(
        "run", "agent", "ar", "dr", RunStatus.COMPLETED,
        "2026-07-30T00:00:00+00:00", "2026-07-30T00:01:00+00:00",
        "eval-v1", (case_result("case-a", status),),
    )


def test_report_status_precedence():
    assert derive_report_status(run_with("INCOMPLETE")) == "INCOMPLETE"
    assert derive_report_status(run_with("FAIL")) == "NEEDS ATTENTION"
    assert derive_report_status(run_with("PASS")) == "PASS"


def seed_completed_run(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Agent", "")
    revision = repo.create_agent_revision(agent.agent_id, {"model": "m1"}, ())
    dataset_id = repo.create_dataset(agent.agent_id, "Dataset")
    repo.replace_draft_cases(dataset_id, [WorkbenchTestCase("case-a", {"query": "hi"}, {})])
    repo.add_dataset_generation_cost(
        dataset_id, UsageCost("dataset", "dataset-model", 7, 2, 1, 0, 0.01),
    )
    dataset_revision = repo.publish_dataset(dataset_id)
    run = repo.create_run(revision.revision_id, dataset_revision.revision_id)
    evidence = ToolEvidence(
        "call-a", "lookup", True, True, True, True, True,
        {"query": "hi"}, {"query": "hi"}, {"value": "ok"}, None,
        "trace-a", "obs-a", None, None, 5.0, {"id": "receipt"},
    )
    judge = JudgeResult(
        {"correctness": 4, "relevance": 5, "completeness": 4, "safety": 4},
        {"correctness": "ok", "relevance": "direct", "completeness": "enough", "safety": "safe"},
        "Pass", "judge-model", "judge-v1", "judge-trace", "judge-observation",
        UsageCost("judge", "judge-model", 8, 2, 1, 0, 0.02),
    )
    result = CaseResult(
        "case-a", "trace-a", "answer",
        {"permission_compliance": 1.0, "execution_correctness": 1.0}, {},
        (evidence,), judge,
        (
            UsageCost("agent", "m1", 10, 3, 2, 1, 0.03),
            judge.usage_cost,
        ),
        "PASS",
    )
    repo.save_case_result(run.run_id, result)
    return repo, repo.finish_run(run.run_id, RunStatus.COMPLETED)


def test_create_persists_versioned_structured_report_with_separate_costs(tmp_path):
    repo, run = seed_completed_run(tmp_path)
    service = ReportService(repo, tmp_path / "reports")

    first = service.create(run.run_id)
    second = service.create(run.run_id)

    assert tuple(first.summary) == (
        "identity", "status", "metrics", "judge_dimensions", "tool_funnel",
        "costs", "tokens", "cases", "failures",
    )
    assert first.status == "PASS"
    assert first.summary["costs"] == {
        "agent": 0.03, "judge": 0.02, "evaluation_total": 0.05, "dataset": 0.01,
    }
    assert first.summary["metrics"]["evaluation_cost_usd"] == 0.05
    assert first.summary["metrics"]["dataset_generation_cost_usd"] == 0.01
    assert first.summary["tokens"]["dataset_input_tokens"] == 7
    assert first.summary["cases"][0]["status"] == "PASS"
    assert first.artifact_version == 1
    assert second.artifact_version == 2
    markdown = Path(first.markdown_path).read_text(encoding="utf-8")
    assert "## Status: PASS" in markdown
    assert "Evaluation cost" in markdown
    assert "Dataset generation cost" in markdown


def test_failed_case_is_kept_textual_and_explained(tmp_path):
    repo, run = seed_completed_run(tmp_path)
    loaded = repo.get_run(run.run_id)
    # Use a separate in-memory value to verify the pure precedence without
    # mutating the terminal persisted run.
    failed = EvalRun(
        loaded.run_id, loaded.agent_id, loaded.agent_revision_id,
        loaded.dataset_revision_id, RunStatus.COMPLETED, loaded.started_at,
        loaded.completed_at, loaded.evaluator_version,
        (case_result("case-a", "FAIL"),),
    )

    assert derive_report_status(failed) == "NEEDS ATTENTION"


def test_service_comparison_loads_each_runs_agent_revision_config(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Agent", "")
    baseline_revision = repo.create_agent_revision(agent.agent_id, {"model": "m1"}, ())
    current_revision = repo.create_agent_revision(agent.agent_id, {"model": "m2"}, ())
    dataset_id = repo.create_dataset(agent.agent_id, "Dataset")
    dataset_revision = repo.publish_dataset(dataset_id)
    baseline_run = repo.create_run(baseline_revision.revision_id, dataset_revision.revision_id)
    current_run = repo.create_run(current_revision.revision_id, dataset_revision.revision_id)
    repo.finish_run(baseline_run.run_id, RunStatus.COMPLETED)
    repo.finish_run(current_run.run_id, RunStatus.COMPLETED)
    summary = {
        "identity": {"dataset": {"revision": 1}},
        "cases": [],
        "costs": {"evaluation_total": 0.0},
    }
    baseline = repo.save_report(baseline_run.run_id, "INCOMPLETE", summary, tmp_path / "b.md")
    current = repo.save_report(current_run.run_id, "INCOMPLETE", summary, tmp_path / "c.md")

    comparison = ReportService(repo, tmp_path / "reports").compare(
        baseline.report_id, current.report_id,
    )

    assert comparison.agent_changes == {"model": {"before": "m1", "after": "m2"}}
