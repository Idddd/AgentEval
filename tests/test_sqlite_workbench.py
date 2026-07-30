from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import (
    CaseResult,
    JudgeResult,
    RunStatus,
    TestCase as WorkbenchTestCase,
    ToolBinding,
    ToolEvidence,
    UsageCost,
)


def tool(name="Lookup"):
    return ToolBinding(
        "lookup",
        name,
        "Lookup data",
        "python",
        {"callable": "lookup"},
        {"type": "object"},
        {"type": "object"},
        {},
        ("Return a result",),
        False,
        True,
    )


def test_agent_revision_and_dataset_revision_survive_restart(tmp_path):
    db = tmp_path / "workbench.db"
    repo = SQLiteWorkbenchRepository(db)
    agent = repo.create_agent("Agent A", "General agent")
    revision = repo.create_agent_revision(agent.agent_id, {"model": "m1"}, (tool(),))
    dataset_id = repo.create_dataset(agent.agent_id, "Regression")
    repo.replace_draft_cases(
        dataset_id,
        [WorkbenchTestCase("case-1", {"query": "look up A"}, {"expected_tool_called": "lookup"})],
    )
    dataset_revision = repo.publish_dataset(dataset_id)

    reopened = SQLiteWorkbenchRepository(db)
    assert reopened.get_agent(agent.agent_id).current_revision == 1
    assert reopened.get_agent_revision(revision.revision_id).tools[0].tool_id == "lookup"
    assert reopened.get_dataset_revision(dataset_revision.revision_id).cases[0].case_id == "case-1"


def test_agent_ownership_is_enforced(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    first = repo.create_agent("First", "")
    second = repo.create_agent("Second", "")
    revision = repo.create_agent_revision(first.agent_id, {}, (tool(),))
    dataset_id = repo.create_dataset(second.agent_id, "Other dataset")
    dataset_revision = repo.publish_dataset(dataset_id)
    try:
        repo.create_run(revision.revision_id, dataset_revision.revision_id)
    except ValueError as error:
        assert str(error) == "agent revision and dataset revision belong to different agents"
    else:
        raise AssertionError("cross-agent run must be rejected")


def test_reopened_revision_snapshots_remain_deeply_immutable(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Frozen", "")
    revision = repo.create_agent_revision(
        agent.agent_id,
        {"model": {"names": {"m1"}}},
        (tool(),),
    )
    loaded = SQLiteWorkbenchRepository(repo.db_path).get_agent_revision(revision.revision_id)

    try:
        loaded.config_snapshot["model"]["names"].add("m2")
    except AttributeError:
        pass
    else:
        raise AssertionError("nested persisted sets must remain immutable")


def test_run_results_and_reports_round_trip(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Artifacts", "")
    agent_revision = repo.create_agent_revision(agent.agent_id, {}, ())
    dataset_id = repo.create_dataset(agent.agent_id, "Dataset")
    case = WorkbenchTestCase("case-1", {"query": "hello"}, {})
    repo.replace_draft_cases(dataset_id, [case])
    repo.add_dataset_generation_cost(dataset_id, UsageCost("dataset", "m1", 1, 2, 0, 0, 0.01))
    dataset_revision = repo.publish_dataset(dataset_id)
    run = repo.create_run(agent_revision.revision_id, dataset_revision.revision_id)
    result = CaseResult(
        "case-1",
        "trace-1",
        "answer",
        {"execution_correctness": 1.0},
        {"execution_correctness": "called"},
        (
            ToolEvidence(
                "call-1", "lookup", True, True, True, None, False, {"q": "hello"},
                {"q": "hello"}, {"found": True}, None, "trace-1", None, None, None, 1.0, None,
            ),
        ),
        JudgeResult(
            {"correctness": 4, "relevance": 4, "completeness": 4, "safety": 4},
            {"correctness": "ok", "relevance": "ok", "completeness": "ok", "safety": "ok"},
            "pass", "judge", "v1", "judge-trace", None,
        ),
        (UsageCost("agent", "m1", 1, 2, 0, 0, 0.02),),
        "PASS",
    )
    repo.save_case_result(run.run_id, result)
    completed = repo.finish_run(run.run_id, RunStatus.COMPLETED)
    first_report = repo.save_report(run.run_id, "PASS", {"score": 4}, tmp_path / "first.md")
    second_report = repo.save_report(run.run_id, "PASS", {"score": 5}, tmp_path / "second.md")

    reopened = SQLiteWorkbenchRepository(repo.db_path)
    loaded = reopened.get_run(run.run_id)
    assert completed.status is RunStatus.COMPLETED
    assert loaded.case_results == (result,)
    assert reopened.list_runs(agent.agent_id) == [loaded]
    assert dataset_revision.generation_costs[0].cost_usd == 0.01
    assert (first_report.artifact_version, second_report.artifact_version) == (1, 2)
    assert reopened.get_report(second_report.report_id).summary == {"score": 5}
    assert reopened.list_reports(agent.agent_id) == [second_report, first_report]
