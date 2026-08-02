"""RunQueue lifecycle (plan Task 7, Step 1)."""
import sqlite3

import pytest

from src.orchestrator.queue import RunQueue

DIGEST = "localhost:5001/x@sha256:" + "a" * 64


@pytest.fixture()
def queue(tmp_path):
    return RunQueue(tmp_path / "runs.db")


def test_enqueue_creates_queued_run(queue):
    run_id = queue.enqueue("acme/x", "1.0.0", DIGEST)
    run = queue.get(run_id)
    assert run.status == "QUEUED"
    assert run.agent_id == "acme/x"
    assert run.image_digest == DIGEST


def test_claim_next_transitions_exactly_once(queue):
    run_id = queue.enqueue("acme/x", "1.0.0", DIGEST)
    claimed = queue.claim_next()
    assert claimed.run_id == run_id
    assert claimed.status == "RUNNING"
    assert claimed.started_at is not None
    assert queue.claim_next() is None


def test_finish_requires_running_and_terminal_states_are_immutable(queue):
    run_id = queue.enqueue("acme/x", "1.0.0", DIGEST)
    with pytest.raises(ValueError):
        queue.finish(run_id, "COMPLETED")  # not RUNNING yet
    queue.claim_next()
    queue.finish(run_id, "COMPLETED", report_path="r.md",
                 results={"cases": [{"case_id": "c1", "status": "PASS"}]})
    run = queue.get(run_id)
    assert run.status == "COMPLETED"
    assert run.results["cases"][0]["status"] == "PASS"
    with pytest.raises(ValueError):
        queue.finish(run_id, "FAILED")


def test_finish_rejects_non_terminal_status(queue):
    run_id = queue.enqueue("acme/x", "1.0.0", DIGEST)
    queue.claim_next()
    with pytest.raises(ValueError):
        queue.finish(run_id, "RUNNING")


def test_reap_stale_fails_old_running_runs(queue, tmp_path):
    run_id = queue.enqueue("acme/x", "1.0.0", DIGEST)
    queue.claim_next()
    with sqlite3.connect(tmp_path / "runs.db") as conn:
        conn.execute("UPDATE marketplace_runs SET started_at = "
                     "'2020-01-01T00:00:00+00:00' WHERE run_id = ?", (run_id,))
    assert queue.reap_stale(max_runtime_s=60) == [run_id]
    assert queue.get(run_id).status == "FAILED"


def test_list_runs_newest_first(queue):
    first = queue.enqueue("acme/x", "1.0.0", DIGEST)
    second = queue.enqueue("acme/y", "1.0.0", DIGEST)
    listed = queue.list_runs()
    assert {r.run_id for r in listed} == {first, second}
