import asyncio
from datetime import datetime, timezone

from src.agent_adapter import AgentAdapterResult, PermissionAgentAdapter
from src.code_evaluator import CodeEvaluator
from src.eval_runner import EvalRunner
from src.llm_judge import JudgeIncompleteError
from src.models import SpanRecord, TraceRecord
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import JudgeResult, RunStatus, TestCase as WorkbenchTestCase


class FakeAgent:
    async def run(self, case, run_id):
        now = datetime.now(timezone.utc)
        trace = TraceRecord(
            trace_id=f"trace-{case.case_id}",
            name="fake-agent",
            spans=[SpanRecord("root", None, "agent_root", now)],
        )
        return AgentAdapterResult("answer", trace.trace_id, trace, (), ())


class FakeJudge:
    def evaluate(self, case, response, evidence, deterministic_scores):
        return JudgeResult(
            {"correctness": 4, "relevance": 4, "completeness": 4, "safety": 4},
            {name: "Pass" for name in ("correctness", "relevance", "completeness", "safety")},
            "Pass", "judge-model", "judge-v1", "judge-trace", "judge-observation",
        )


class FailingJudge:
    def evaluate(self, case, response, evidence, deterministic_scores):
        raise JudgeIncompleteError("invalid judge response after one repair")


class MissingJudge:
    def evaluate(self, *args, **kwargs):
        raise JudgeIncompleteError("provider unavailable")


class PassingEvaluator:
    def evaluate(self, trace, expected):
        return ({"permission_compliance": 1.0, "execution_correctness": 1.0}, {})


class FailingEvaluator:
    def evaluate(self, trace, expected):
        return (
            {"permission_compliance": 0.0, "execution_correctness": 1.0},
            {"permission_compliance": "MISSING_GUARD"},
        )


def seed_workbench(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Agent", "")
    agent_revision = repo.create_agent_revision(agent.agent_id, {"model": "m1"}, ())
    dataset_id = repo.create_dataset(agent.agent_id, "Dataset")
    repo.replace_draft_cases(
        dataset_id,
        [WorkbenchTestCase("case-1", {"query": "hello"}, {})],
    )
    return repo, agent_revision, repo.publish_dataset(dataset_id)


def test_run_freezes_revisions_and_persists_case_results(tmp_path):
    repo, agent_revision, dataset_revision = seed_workbench(tmp_path)
    runner = EvalRunner(repo, FakeAgent(), CodeEvaluator(), FakeJudge())

    completed = asyncio.run(
        runner.run_revision(agent_revision.revision_id, dataset_revision.revision_id)
    )

    reopened = SQLiteWorkbenchRepository(repo.db_path).get_run(completed.run_id)
    assert reopened.status is RunStatus.COMPLETED
    assert reopened.agent_revision_id == agent_revision.revision_id
    assert reopened.dataset_revision_id == dataset_revision.revision_id
    assert len(reopened.case_results) == len(dataset_revision.cases)
    assert reopened.case_results[0].judge is None

    judged = runner.judge_run(completed.run_id)
    assert judged.case_results[0].judge is not None


def test_missing_judge_uses_default_fallback_for_passing_case(tmp_path):
    repo, agent_revision, dataset_revision = seed_workbench(tmp_path)

    runner = EvalRunner(repo, FakeAgent(), PassingEvaluator(), MissingJudge())
    run = asyncio.run(
        runner.run_revision(
            agent_revision.revision_id, dataset_revision.revision_id
        )
    )

    assert run.status is RunStatus.COMPLETED
    assert run.case_results[0].status == "PASS"
    assert run.case_results[0].judge is None
    run = runner.judge_run(run.run_id)
    assert run.case_results[0].judge is not None
    assert run.case_results[0].judge.model == "Default fallback judge"
    assert run.case_results[0].judge.passed is True
    assert "JUDGE_INCOMPLETE" in run.case_results[0].deterministic_reasons["judge"]


def test_deterministic_failure_takes_precedence_with_default_fallback_judge(tmp_path):
    repo, agent_revision, dataset_revision = seed_workbench(tmp_path)

    runner = EvalRunner(repo, FakeAgent(), FailingEvaluator(), FailingJudge())
    run = asyncio.run(
        runner.run_revision(
            agent_revision.revision_id, dataset_revision.revision_id
        )
    )

    assert run.status is RunStatus.COMPLETED
    assert run.case_results[0].status == "FAIL"
    assert run.case_results[0].judge is None
    run = runner.judge_run(run.run_id)
    assert run.case_results[0].judge is not None
    assert run.case_results[0].judge.model == "Default fallback judge"
    assert run.case_results[0].judge.passed is False
    assert "JUDGE_INCOMPLETE" in run.case_results[0].deterministic_reasons["judge"]


def test_permission_adapter_normalizes_case_trace_evidence_and_agent_cost():
    now = datetime.now(timezone.utc)
    trace = TraceRecord(
        "trace-1",
        "agent",
        spans=[
            SpanRecord(
                "generation", None, "agent-generation", now,
                observation_type="generation", model="m1",
                usage_details={"input": 10, "input_cached": 2, "output": 3,
                               "output_reasoning": 1},
                cost_details={"total": 0.04},
            )
        ],
    )

    class Target:
        def __init__(self):
            self.tracer = self
            self.kwargs = None

        async def run(self, **kwargs):
            self.kwargs = kwargs
            return {"response": "answer", "trace_id": "trace-1", "tool_evidence": []}

        def flush(self):
            pass

    class Store:
        def get_trace(self, trace_id, *, retry=True):
            assert trace_id == "trace-1"
            return trace

    target = Target()
    case = WorkbenchTestCase(
        "case-1", {"query": "hello", "user_id": "u1", "user_role": "admin"}, {},
        tags=("smoke",), metadata={"scenario": "normal"},
    )

    result = asyncio.run(PermissionAgentAdapter(target, Store()).run(case, "run-1"))

    assert target.kwargs == {
        "query": "hello", "user_id": "u1", "user_role": "admin",
        "scenario": "normal", "tags": ["run-1", "smoke"], "inject_bug": None,
    }
    assert result.trace is trace
    assert result.usage_costs[0].category == "agent"
    assert result.usage_costs[0].input_tokens == 12
    assert result.usage_costs[0].cached_tokens == 2
    assert result.usage_costs[0].cost_usd == 0.04
