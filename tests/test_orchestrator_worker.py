"""Orchestrator end-to-end with the fake runner (plan Task 7, Step 2)."""
import pytest

from reference_agent.app import handler_factory
from src.marketplace.registry import MarketplaceRegistry
from src.orchestrator.queue import RunQueue
from src.orchestrator.worker import InProcessGatewayAccess, Orchestrator, default_cases
from src.sandbox.base import SandboxProvisionError, SandboxSpec
from src.sandbox.fake import FakeSandboxRunner
from tests.test_marketplace_manifest import VALID

REF_DIGEST = "localhost:5001/acme/travel-planner@sha256:" + "a" * 64


@pytest.fixture()
def stack(tmp_path):
    queue = RunQueue(tmp_path / "db.sqlite")
    registry = MarketplaceRegistry(tmp_path / "db.sqlite")
    registry.register(VALID)
    gateway = InProcessGatewayAccess()
    yield queue, registry, gateway, tmp_path
    gateway.close()


def _orchestrator(stack, runner):
    queue, registry, gateway, tmp_path = stack
    return Orchestrator(queue=queue, registry=registry, runner=runner,
                        gateway=gateway, reports_dir=tmp_path / "reports",
                        runner_type="fake")


def _claimed_run(stack):
    queue = stack[0]
    queue.enqueue("acme/travel-planner", "1.4.0", REF_DIGEST)
    return queue.claim_next()


def test_default_cases_shape():
    cases = default_cases()
    assert len(cases) == 9
    assert sum("[demo_bypass]" in case.query for case in cases) == 1
    assert all(case.expected for case in cases)


def test_happy_path_run_completes_with_one_demo_failure(stack):
    queue = stack[0]
    orchestrator = _orchestrator(stack, FakeSandboxRunner({"*": handler_factory}))
    finished = orchestrator.execute(_claimed_run(stack))

    assert finished.status == "COMPLETED"
    cases = finished.results["cases"]
    assert len(cases) == 9
    statuses = [case["status"] for case in cases]
    assert statuses.count("PASS") == 8
    assert statuses.count("FAIL") == 1
    failing = next(case for case in cases if case["status"] == "FAIL")
    assert failing["scenario"] == "demo_bypass"
    assert "MISSING_GUARD" in failing["reasons"]["permission_compliance"]

    report = open(finished.report_path).read()
    assert "acme/travel-planner" in report
    assert "sha256:" in report
    assert "agent-eval/v1" in report
    assert "8 PASS / 1 FAIL" in report


def test_provision_failure_marks_run_failed_with_reason(stack):
    orchestrator = _orchestrator(stack, FakeSandboxRunner({}))  # no images at all
    finished = orchestrator.execute(_claimed_run(stack))
    assert finished.status == "FAILED"
    assert "not available" in finished.error


def test_unregistered_agent_fails_cleanly(stack):
    queue = stack[0]
    queue.enqueue("acme/ghost", "9.9.9", REF_DIGEST)
    orchestrator = _orchestrator(stack, FakeSandboxRunner({"*": handler_factory}))
    finished = orchestrator.execute(queue.claim_next())
    assert finished.status == "FAILED"
    assert "not registered" in finished.error


class _TeardownSpy(FakeSandboxRunner):
    def __init__(self, images):
        super().__init__(images)
        self.teardown_calls = 0

    def teardown(self, handle):
        self.teardown_calls += 1
        super().teardown(handle)


def test_teardown_happens_even_when_evaluation_raises(stack, monkeypatch):
    spy = _TeardownSpy({"*": handler_factory})
    orchestrator = _orchestrator(stack, spy)
    monkeypatch.setattr(orchestrator, "_evaluator", None)  # force AttributeError later
    with pytest.raises(AttributeError):
        orchestrator.execute(_claimed_run(stack))
    assert spy.teardown_calls == 1
