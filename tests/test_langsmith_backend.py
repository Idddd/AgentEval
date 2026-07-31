from __future__ import annotations

import threading
from datetime import datetime
from types import SimpleNamespace

import pytest

from src.backends.langsmith_backend import LangsmithBackend, LangsmithStore
from src.settings import Settings


class FakeLangsmithClient:
    """In-memory implementation of the LangSmith client boundary we consume."""

    def __init__(self):
        self.runs: dict[str, SimpleNamespace] = {}
        self.feedback: list[SimpleNamespace] = []
        self.flush_count = 0
        self.create_failures = 0
        self.read_attempts = 0
        self.read_failures = 0
        self.update_failures = 0
        self._lock = threading.Lock()

    def create_run(self, name, inputs, run_type, **kwargs):
        if self.create_failures:
            self.create_failures -= 1
            raise RuntimeError("SDK create failed")
        run_id = str(kwargs["id"])
        trace_id = str(kwargs.get("trace_id") or run_id)
        run = SimpleNamespace(
            id=run_id,
            trace_id=trace_id,
            parent_run_id=(
                str(kwargs["parent_run_id"])
                if kwargs.get("parent_run_id") is not None
                else None
            ),
            name=name,
            inputs=inputs,
            outputs=None,
            run_type=run_type,
            start_time=kwargs["start_time"],
            end_time=None,
            error=None,
            extra=kwargs.get("extra") or {},
            tags=list(kwargs.get("tags") or []),
            session_name=kwargs.get("project_name"),
            session_id="project-id",
        )
        with self._lock:
            self.runs[run_id] = run

    def update_run(self, run_id, **kwargs):
        if self.update_failures:
            self.update_failures -= 1
            raise RuntimeError("SDK update failed")
        run = self.runs[str(run_id)]
        for key, value in kwargs.items():
            if value is not None:
                setattr(run, key, value)

    def read_run(self, run_id):
        self.read_attempts += 1
        if self.read_failures:
            self.read_failures -= 1
            raise KeyError("run is not available yet")
        return self.runs[str(run_id)]

    def list_runs(
        self, *, trace_id=None, project_name=None, is_root=None, **kwargs
    ):
        del kwargs
        runs = list(self.runs.values())
        if trace_id is not None:
            runs = [run for run in runs if run.trace_id == str(trace_id)]
        if project_name is not None:
            runs = [run for run in runs if run.session_name == project_name]
        if is_root is not None:
            runs = [
                run for run in runs
                if (run.parent_run_id is None) is is_root
            ]
        return iter(runs)

    def list_feedback(self, *, run_ids=None, **kwargs):
        del kwargs
        wanted = {str(run_id) for run_id in (run_ids or [])}
        return iter(
            item for item in self.feedback
            if not wanted or str(item.run_id) in wanted
        )

    def flush(self):
        self.flush_count += 1

    def get_run_url(self, *, run, project_name=None):
        return f"https://smith.example/projects/{project_name}/r/{run.id}"


def _settings(endpoint: str = "https://api.smith.example") -> Settings:
    return Settings(
        langsmith_api_key="ls-test",
        langsmith_endpoint=endpoint,
        langsmith_workspace_id="workspace-test",
        langsmith_enabled=True,
    )


def test_trace_roundtrip_preserves_nested_spans_metadata_and_feedback():
    client = FakeLangsmithClient()
    backend = LangsmithBackend(_settings(), client=client)
    store = LangsmithStore(_settings(), client=client)

    with backend.tracer.start_trace(
        "agent-run-test",
        user_id="u1",
        tags=["exp_test", "smoke"],
        metadata={"scenario": "allowed"},
    ) as root:
        with backend.tracer.span(
            "tool_execution", metadata={"phase": "tool"}
        ) as tool_execution:
            with backend.tracer.span(
                "PayrollLookup",
                input={"query": "lookup"},
                metadata={"sensitivity": "high"},
            ) as tool:
                tool.set_output({"result": "ok"})
            tool_execution.set_output({"executed": True})
        trace_id = root.trace_id

    client.feedback.append(
        SimpleNamespace(
            run_id=trace_id,
            key="permission_compliance",
            score=1.0,
            comment="ok",
        )
    )
    backend.tracer.flush()

    trace = store.get_trace(trace_id)
    assert trace.trace_id == trace_id
    assert trace.name == "agent-run-test"
    assert trace.user_id == "u1"
    assert trace.tags == ["exp_test", "smoke"]
    assert trace.metadata == {"scenario": "allowed"}
    assert trace.get_score("permission_compliance") == 1.0
    assert trace.scores[0].comment == "ok"

    outer = trace.find_span("tool_execution")
    tool = trace.find_span("PayrollLookup")
    assert outer is not None
    assert tool is not None
    assert outer.parent_id == trace_id
    assert outer.output == {"executed": True}
    assert tool.parent_id == outer.id
    assert tool.input == {"query": "lookup"}
    assert tool.output == {"result": "ok"}
    assert tool.metadata == {"sensitivity": "high"}
    assert all(
        span.end_time is not None and span.end_time.tzinfo is not None
        for span in trace.spans
    )
    assert client.runs[trace_id].end_time.tzinfo is not None
    assert backend.tracer.last_trace_id() == trace_id
    assert client.flush_count == 1

    assert [item.trace_id for item in store.list_traces(tag="exp_test")] == [
        trace_id
    ]
    assert store.list_traces(tag="other") == []
    assert store.get_trace_url(trace_id) == (
        f"https://smith.example/projects/exp_test/r/{trace_id}"
    )


def test_contexts_close_runs_when_business_operation_raises():
    client = FakeLangsmithClient()
    backend = LangsmithBackend(_settings(), client=client)

    with pytest.raises(RuntimeError, match="business failed"):
        with backend.tracer.start_trace(
            "agent-run-error",
            user_id="u2",
            tags=["exp_error"],
            metadata={},
        ) as root:
            with backend.tracer.span("failing_operation"):
                raise RuntimeError("business failed")

    root_run = client.runs[root.trace_id]
    child = next(
        run for run in client.runs.values()
        if run.parent_run_id == root.trace_id
    )
    assert root_run.end_time.tzinfo is not None
    assert child.end_time.tzinfo is not None
    assert "business failed" in root_run.error
    assert "business failed" in child.error


def test_span_cleanup_survives_sdk_update_failure():
    client = FakeLangsmithClient()
    backend = LangsmithBackend(_settings(), client=client)

    with backend.tracer.start_trace(
        "agent-run-update-error",
        user_id="u3",
        tags=["exp_update_error"],
        metadata={},
    ) as root:
        with pytest.raises(RuntimeError, match="SDK update failed"):
            with backend.tracer.span("failed_to_close"):
                client.update_failures = 1

        with backend.tracer.span("sibling_after_failure"):
            pass

    sibling = next(
        run for run in client.runs.values()
        if run.name == "sibling_after_failure"
    )
    assert sibling.parent_run_id == root.trace_id


def test_span_close_does_not_replace_active_business_exception():
    client = FakeLangsmithClient()
    backend = LangsmithBackend(_settings(), client=client)

    with backend.tracer.start_trace(
        "agent-run-business-error",
        user_id="u4",
        tags=["exp_business_error"],
        metadata={},
    ) as root:
        with pytest.raises(ValueError, match="business failed"):
            with backend.tracer.span("business_failure"):
                client.update_failures = 1
                raise ValueError("business failed")

        with backend.tracer.span("sibling_after_business_failure"):
            pass

    sibling = next(
        run for run in client.runs.values()
        if run.name == "sibling_after_business_failure"
    )
    assert sibling.parent_run_id == root.trace_id


def test_successful_root_exit_clears_active_trace_state():
    client = FakeLangsmithClient()
    backend = LangsmithBackend(_settings(), client=client)

    with backend.tracer.start_trace(
        "agent-run-finished",
        user_id="u5",
        tags=["exp_finished"],
        metadata={},
    ):
        pass

    with pytest.raises(RuntimeError, match="requires an active"):
        with backend.tracer.span("after_root_exit"):
            pass


def test_root_cleanup_survives_sdk_update_failure():
    client = FakeLangsmithClient()
    backend = LangsmithBackend(_settings(), client=client)

    with pytest.raises(RuntimeError, match="SDK update failed"):
        with backend.tracer.start_trace(
            "agent-run-root-update-error",
            user_id="u6",
            tags=["exp_root_update_error"],
            metadata={},
        ):
            client.update_failures = 1

    with pytest.raises(RuntimeError, match="requires an active"):
        with backend.tracer.span("after_root_update_failure"):
            pass


def test_root_close_does_not_replace_active_business_exception():
    client = FakeLangsmithClient()
    backend = LangsmithBackend(_settings(), client=client)

    with pytest.raises(ValueError, match="business failed"):
        with backend.tracer.start_trace(
            "agent-run-root-business-error",
            user_id="u7",
            tags=["exp_root_business_error"],
            metadata={},
        ):
            client.update_failures = 1
            raise ValueError("business failed")

    with pytest.raises(RuntimeError, match="requires an active"):
        with backend.tracer.span("after_root_business_failure"):
            pass


def test_failed_root_creation_clears_active_trace_state():
    client = FakeLangsmithClient()
    backend = LangsmithBackend(_settings(), client=client)
    client.create_failures = 1

    with pytest.raises(RuntimeError, match="SDK create failed"):
        with backend.tracer.start_trace(
            "agent-run-create-error",
            user_id="u8",
            tags=["exp_create_error"],
            metadata={},
        ):
            pass

    with pytest.raises(RuntimeError, match="requires an active"):
        with backend.tracer.span("after_root_create_failure"):
            pass


def test_span_stacks_are_thread_local():
    client = FakeLangsmithClient()
    backend = LangsmithBackend(_settings(), client=client)
    barrier = threading.Barrier(2)
    trace_ids: list[str] = []

    def trace_in_thread(suffix: str):
        with backend.tracer.start_trace(
            f"trace-{suffix}",
            user_id=suffix,
            tags=[f"exp-{suffix}"],
            metadata={},
        ) as root:
            barrier.wait()
            with backend.tracer.span(f"child-{suffix}"):
                barrier.wait()
            trace_ids.append(root.trace_id)

    threads = [
        threading.Thread(target=trace_in_thread, args=("a",)),
        threading.Thread(target=trace_in_thread, args=("b",)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(trace_ids) == 2
    for trace_id in trace_ids:
        child = next(
            run for run in client.runs.values()
            if run.trace_id == trace_id and run.parent_run_id is not None
        )
        assert child.parent_run_id == trace_id


def test_trace_url_falls_back_to_endpoint_when_sdk_cannot_build_one():
    client = FakeLangsmithClient()

    def unavailable_url(**kwargs):
        del kwargs
        raise RuntimeError("URL unavailable")

    client.get_run_url = unavailable_url
    store = LangsmithStore(
        _settings(endpoint="https://api.smith.example/"), client=client
    )

    assert store.get_trace_url("trace-123") == (
        "https://api.smith.example/runs/trace-123"
    )


def test_get_trace_retries_until_cloud_run_is_available(monkeypatch):
    client = FakeLangsmithClient()
    backend = LangsmithBackend(_settings(), client=client)
    store = LangsmithStore(_settings(), client=client)
    monkeypatch.setattr("time.sleep", lambda delay: None)

    with backend.tracer.start_trace(
        "agent-run-delayed",
        user_id="u9",
        tags=["exp_delayed"],
        metadata={},
    ) as root:
        pass

    client.read_failures = 2
    trace = store.get_trace(root.trace_id, retry=True)

    assert trace.trace_id == root.trace_id
    assert client.read_attempts == 3


def test_get_trace_without_retry_reads_only_once():
    client = FakeLangsmithClient()
    store = LangsmithStore(_settings(), client=client)
    client.read_failures = 2

    with pytest.raises(KeyError, match="not available yet"):
        store.get_trace("missing-trace", retry=False)

    assert client.read_attempts == 1
