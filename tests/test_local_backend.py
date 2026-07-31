"""Local JSON backend: full loop of trace persistence → readback → score update."""
from __future__ import annotations

from src.backends.langsmith_backend import LangsmithBackend
from src.backends.local_backend import LocalJsonBackend, LocalJsonStore
from src.models import DatasetItemRecord
from src.settings import Settings


def test_trace_roundtrip(tmp_path):
    backend = LocalJsonBackend(tmp_path)
    store = LocalJsonStore(tmp_path)

    with backend.tracer.start_trace("agent-run-test", user_id="u1",
                                    tags=["exp_test"], metadata={"scenario": "s"}):
        with backend.tracer.span("permission_guard",
                                 input={"user_role": "hr"}) as s:
            s.set_output({"granted": True, "reason": "ok"})
        tid = backend.tracer.last_trace_id()

    trace = store.get_trace(tid)
    assert trace.name == "agent-run-test"
    assert trace.user_id == "u1"
    assert "exp_test" in trace.tags
    guard = trace.find_span("permission_guard")
    assert guard is not None
    assert guard.output == {"granted": True, "reason": "ok"}
    assert guard.end_time is not None

    backend.save_score(tid, "permission_compliance", 1.0, comment="ok")
    trace = store.get_trace(tid)
    assert trace.get_score("permission_compliance") == 1.0

    assert [t.trace_id for t in store.list_traces(tag="exp_test")] == [tid]
    assert store.list_traces(tag="other") == []


def test_dataset_roundtrip(tmp_path):
    backend = LocalJsonBackend(tmp_path)
    items = [DatasetItemRecord(id="a", input={"query": "q"},
                               expected_output={"x": 1},
                               metadata={"scenario": "s"})]
    backend.create_dataset("ds1", items)
    got = backend.get_dataset_items("ds1")
    assert len(got) == 1
    assert got[0].input == {"query": "q"}

    backend.create_dataset("ds1", [])  # replace
    assert backend.get_dataset_items("ds1") == []


def test_experiment_registry(tmp_path):
    backend = LocalJsonBackend(tmp_path)
    store = LocalJsonStore(tmp_path)
    backend.register_experiment("exp1", "ds1", ["t1", "t2"])
    exps = store.list_experiments()
    assert exps[0]["name"] == "exp1"
    assert exps[0]["trace_ids"] == ["t1", "t2"]
    assert exps[0]["backend"] == "local-json"


def test_local_reset_removes_only_local_registry_entries(tmp_path):
    backend = LocalJsonBackend(tmp_path)
    store = LocalJsonStore(tmp_path)
    cloud_backend = LangsmithBackend(Settings(data_dir=tmp_path), client=object())
    cloud_backend.register_experiment(
        "exp-shared", "ds1", ["cloud-trace"]
    )
    backend.register_experiment("exp-shared", "ds1", ["local-trace"])

    summary = backend.reset("ds1")

    assert summary["experiments"] == 1
    remaining = store.list_experiments()
    assert len(remaining) == 1
    assert remaining[0]["name"] == "exp-shared"
    assert remaining[0]["dataset"] == "ds1"
    assert remaining[0]["trace_ids"] == ["cloud-trace"]
    assert remaining[0]["backend"] == "langsmith"
    assert (
        remaining[0]["remote_project_name"]
        == "agenteval__exp-shared"
    )
