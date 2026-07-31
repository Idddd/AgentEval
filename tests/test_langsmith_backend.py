from __future__ import annotations

import json
import threading
from datetime import datetime
from types import SimpleNamespace

import pytest
from langsmith.utils import LangSmithNotFoundError

from src.backends.langsmith_backend import LangsmithBackend, LangsmithStore
from src.backends.local_backend import LocalJsonBackend, LocalJsonStore
from src.models import DatasetItemRecord
from src.settings import Settings


class FakeLangsmithClient:
    """In-memory implementation of the LangSmith client boundary we consume."""

    def __init__(self):
        self.runs: dict[str, SimpleNamespace] = {}
        self.feedback: list[SimpleNamespace] = []
        self.datasets: dict[str, SimpleNamespace] = {}
        self.examples: list[SimpleNamespace] = []
        self.deleted_dataset_ids: list[str] = []
        self.dataset_list_requests: list[str | None] = []
        self.dataset_lookup_failures = 0
        self.example_list_failures = 0
        self.dataset_delete_failures = 0
        self.project_delete_attempts: list[str] = []
        self.project_delete_failures: set[str] = set()
        self.project_list_requests: list[str] = []
        self.project_list_failures: dict[str, Exception] = {}
        self.flush_count = 0
        self.create_failures = 0
        self.read_attempts = 0
        self.read_failures = 0
        self.update_failures = 0
        self._next_dataset_id = 1
        self._next_example_id = 1
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
        if project_name is not None:
            self.project_list_requests.append(project_name)
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

        def lazy_runs():
            failure = self.project_list_failures.get(project_name)
            if failure is not None:
                raise failure
            yield from runs

        return lazy_runs()

    def list_feedback(self, *, run_ids=None, **kwargs):
        del kwargs
        wanted = {str(run_id) for run_id in (run_ids or [])}
        return iter(
            item for item in self.feedback
            if not wanted or str(item.run_id) in wanted
        )

    def create_dataset(self, *, dataset_name, description=None):
        del description
        if any(dataset.name == dataset_name for dataset in self.datasets.values()):
            raise ValueError(f"dataset '{dataset_name}' already exists")
        dataset_id = f"dataset-{self._next_dataset_id}"
        self._next_dataset_id += 1
        dataset = SimpleNamespace(id=dataset_id, name=dataset_name)
        self.datasets[dataset_id] = dataset
        return dataset

    def list_datasets(self, *, dataset_name=None, **kwargs):
        del kwargs
        self.dataset_list_requests.append(dataset_name)
        if self.dataset_lookup_failures:
            self.dataset_lookup_failures -= 1
            raise RuntimeError("SDK dataset lookup failed")
        datasets = list(self.datasets.values())
        if dataset_name is not None:
            datasets = [
                dataset for dataset in datasets
                if dataset_name in dataset.name
            ]
        return iter(datasets)

    def delete_dataset(self, *, dataset_id):
        if self.dataset_delete_failures:
            self.dataset_delete_failures -= 1
            raise RuntimeError("SDK dataset delete failed")
        dataset_id = str(dataset_id)
        del self.datasets[dataset_id]
        self.examples = [
            example for example in self.examples
            if example.dataset_id != dataset_id
        ]
        self.deleted_dataset_ids.append(dataset_id)

    def create_examples(self, *, dataset_id, examples):
        for example in examples:
            self.create_example(dataset_id=dataset_id, **example)

    def create_example(
        self, *, inputs, outputs, dataset_id, metadata=None, **kwargs
    ):
        del kwargs
        example = SimpleNamespace(
            id=f"example-{self._next_example_id}",
            dataset_id=str(dataset_id),
            inputs=inputs,
            outputs=outputs,
            metadata=metadata or {},
        )
        self._next_example_id += 1
        self.examples.append(example)
        return example

    def list_examples(self, *, dataset_id, **kwargs):
        del kwargs
        examples = [
            example for example in self.examples
            if example.dataset_id == str(dataset_id)
        ]

        def lazy_examples():
            if self.example_list_failures:
                self.example_list_failures -= 1
                raise RuntimeError("SDK example list failed")
            yield from examples

        return lazy_examples()

    def create_feedback(
        self, *, run_id, key, score, comment=None, session_id
    ):
        item = SimpleNamespace(
            run_id=str(run_id),
            key=key,
            score=score,
            comment=comment,
            session_id=str(session_id),
        )
        self.feedback.append(item)
        return item

    def delete_project(self, *, project_name):
        self.project_delete_attempts.append(project_name)
        if project_name in self.project_delete_failures:
            raise RuntimeError("SDK project delete failed")
        self.runs = {
            run_id: run
            for run_id, run in self.runs.items()
            if run.session_name != project_name
        }

    def flush(self):
        self.flush_count += 1

    def get_run_url(self, *, run, project_name=None):
        return f"https://smith.example/projects/{project_name}/r/{run.id}"


def _settings(
    endpoint: str = "https://api.smith.example", *, data_dir=None
) -> Settings:
    return Settings(
        langsmith_api_key="ls-test",
        langsmith_endpoint=endpoint,
        langsmith_workspace_id="workspace-test",
        langsmith_enabled=True,
        **({"data_dir": data_dir} if data_dir is not None else {}),
    )


def _dataset_item(
    item_id: str, query: str, expected: str, scenario: str
) -> DatasetItemRecord:
    return DatasetItemRecord(
        id=item_id,
        input={"query": query},
        expected_output={"expected": expected},
        metadata={"scenario": scenario},
    )


def _add_root(
    client: FakeLangsmithClient,
    run_id: str,
    project_name: str,
    *,
    owner: str | None = "AgentEval",
) -> None:
    metadata = {"scenario": "test"}
    if owner is not None:
        metadata["agent_eval_owner"] = owner
    client.create_run(
        "agent-run-test",
        {},
        "chain",
        id=run_id,
        trace_id=run_id,
        project_name=project_name,
        start_time=datetime.now(),
        tags=[project_name.removeprefix("agenteval__")],
        extra={"metadata": metadata},
    )


def test_dataset_replacement_roundtrips_sdk_examples_and_matches_exact_name(
    tmp_path,
):
    client = FakeLangsmithClient()
    backend = LangsmithBackend(_settings(data_dir=tmp_path), client=client)
    external_dataset = client.create_dataset(dataset_name="demo")
    old_dataset = client.create_dataset(dataset_name="agenteval__demo")
    client.create_example(
        dataset_id=old_dataset.id,
        inputs={"query": "old"},
        outputs={"expected": "old"},
        metadata={"scenario": "old"},
    )
    similar_dataset = client.create_dataset(
        dataset_name="agenteval__demo-copy"
    )

    items = [
        _dataset_item("local-1", "first", "one", "allowed"),
        _dataset_item("local-2", "second", "two", "denied"),
    ]
    backend.create_dataset("demo", items, replace=True)

    assert client.deleted_dataset_ids == [old_dataset.id]
    assert external_dataset.id in client.datasets
    assert similar_dataset.id in client.datasets
    assert client.dataset_list_requests[-1] == "agenteval__demo"
    assert [
        (item.input, item.expected_output, item.metadata)
        for item in backend.get_dataset_items("demo")
    ] == [
        ({"query": "first"}, {"expected": "one"}, {"scenario": "allowed"}),
        ({"query": "second"}, {"expected": "two"}, {"scenario": "denied"}),
    ]
    assert all(
        item.id.startswith("example-")
        for item in backend.get_dataset_items("demo")
    )
    with pytest.raises(KeyError, match="missing"):
        backend.get_dataset_items("missing")


def test_add_dataset_item_maps_one_sdk_example(tmp_path):
    client = FakeLangsmithClient()
    backend = LangsmithBackend(_settings(data_dir=tmp_path), client=client)
    backend.create_dataset(
        "demo", [_dataset_item("local-1", "first", "one", "allowed")]
    )

    backend.add_dataset_item(
        "demo", _dataset_item("local-2", "second", "two", "denied")
    )

    got = backend.get_dataset_items("demo")
    assert len(got) == 2
    assert got[1].input == {"query": "second"}
    assert got[1].expected_output == {"expected": "two"}
    assert got[1].metadata == {"scenario": "denied"}


def test_save_score_maps_numeric_feedback_to_root_run(tmp_path):
    client = FakeLangsmithClient()
    backend = LangsmithBackend(_settings(data_dir=tmp_path), client=client)
    _add_root(client, "root-run-1", "agenteval__exp-1")

    backend.save_score(
        "root-run-1", "permission_compliance", 1.0, comment="allowed"
    )
    backend.save_score(
        "root-run-1", "execution_correctness", 0.5, comment="partial"
    )

    assert [
        (
            item.run_id,
            item.key,
            item.score,
            item.comment,
            item.session_id,
        )
        for item in client.feedback
    ] == [
        (
            "root-run-1",
            "permission_compliance",
            1.0,
            "allowed",
            "project-id",
        ),
        (
            "root-run-1",
            "execution_correctness",
            0.5,
            "partial",
            "project-id",
        ),
    ]
    assert client.read_attempts == 1


def test_experiment_registry_identifies_langsmith_project(tmp_path):
    client = FakeLangsmithClient()
    settings = _settings(data_dir=tmp_path)
    backend = LangsmithBackend(settings, client=client)
    store = LangsmithStore(settings, client=client)

    backend.register_experiment("exp-1", "demo", ["root-1", "root-2"])

    experiments = store.list_experiments()
    assert len(experiments) == 1
    assert experiments[0]["name"] == "exp-1"
    assert experiments[0]["dataset"] == "demo"
    assert experiments[0]["trace_ids"] == ["root-1", "root-2"]
    assert experiments[0]["backend"] == "langsmith"
    assert (
        experiments[0]["remote_project_name"]
        == "agenteval__exp-1"
    )


def test_reregistered_experiment_retains_all_owned_root_ids(tmp_path):
    client = FakeLangsmithClient()
    settings = _settings(data_dir=tmp_path)
    backend = LangsmithBackend(settings, client=client)
    store = LangsmithStore(settings, client=client)

    backend.register_experiment("exp-reused", "demo", ["root-1"])
    backend.register_experiment(
        "exp-reused", "demo", ["root-2", "root-1"]
    )

    experiments = store.list_experiments()
    assert len(experiments) == 1
    assert experiments[0]["name"] == "exp-reused"
    assert experiments[0]["trace_ids"] == ["root-1", "root-2"]


def test_reset_deletes_exact_dataset_and_registered_experiment_project(
    tmp_path,
):
    client = FakeLangsmithClient()
    settings = _settings(data_dir=tmp_path)
    backend = LangsmithBackend(settings, client=client)
    store = LangsmithStore(settings, client=client)
    external_dataset = client.create_dataset(dataset_name="demo")
    backend.create_dataset(
        "demo",
        [
            _dataset_item("local-1", "first", "one", "allowed"),
            _dataset_item("local-2", "second", "two", "denied"),
        ],
    )
    similar_dataset = client.create_dataset(
        dataset_name="agenteval__demo-copy"
    )
    backend.register_experiment("exp-1", "demo", ["root-1", "root-2"])
    _add_root(client, "root-1", "agenteval__exp-1")
    _add_root(client, "root-2", "agenteval__exp-1")

    summary = backend.reset("demo")

    assert summary == {
        "dataset_items": 2,
        "traces": 2,
        "traces_deleted": 2,
        "experiments": 1,
    }
    assert client.project_delete_attempts == ["agenteval__exp-1"]
    assert external_dataset.id in client.datasets
    assert similar_dataset.id in client.datasets
    assert list(client.list_datasets(dataset_name="demo")) == [
        client.datasets[external_dataset.id],
        client.datasets[similar_dataset.id],
    ]
    assert store.list_experiments() == []


def test_reset_continues_project_cleanup_after_one_project_delete_fails(
    tmp_path,
):
    client = FakeLangsmithClient()
    settings = _settings(data_dir=tmp_path)
    backend = LangsmithBackend(settings, client=client)
    store = LangsmithStore(settings, client=client)
    backend.register_experiment("exp-fails", "demo", ["root-1"])
    backend.register_experiment(
        "exp-succeeds", "demo", ["root-2", "root-3"]
    )
    _add_root(client, "root-1", "agenteval__exp-fails")
    _add_root(client, "root-2", "agenteval__exp-succeeds")
    _add_root(client, "root-3", "agenteval__exp-succeeds")
    client.project_delete_failures.add("agenteval__exp-fails")

    summary = backend.reset("demo")

    assert summary == {
        "dataset_items": 0,
        "traces": 3,
        "traces_deleted": 2,
        "experiments": 1,
    }
    assert client.project_delete_attempts == [
        "agenteval__exp-fails",
        "agenteval__exp-succeeds",
    ]
    assert [item["name"] for item in store.list_experiments()] == [
        "exp-fails"
    ]


def test_langsmith_reset_preserves_local_registry_entries(tmp_path):
    client = FakeLangsmithClient()
    settings = _settings(data_dir=tmp_path)
    local_backend = LocalJsonBackend(tmp_path)
    local_store = LocalJsonStore(tmp_path)
    backend = LangsmithBackend(settings, client=client)
    store = LangsmithStore(settings, client=client)
    local_backend.register_experiment(
        "exp-shared", "demo", ["local-root"]
    )
    backend.register_experiment("exp-shared", "demo", ["cloud-root"])
    _add_root(client, "cloud-root", "agenteval__exp-shared")

    summary = backend.reset("demo")

    assert summary["experiments"] == 1
    assert summary["traces"] == 1
    assert summary["traces_deleted"] == 1
    assert client.project_delete_attempts == ["agenteval__exp-shared"]
    remaining = local_store.list_experiments()
    assert len(remaining) == 1
    assert remaining[0]["name"] == "exp-shared"
    assert remaining[0]["trace_ids"] == ["local-root"]
    assert remaining[0]["backend"] == "local-json"
    assert store.list_experiments()[0]["backend"] == "local-json"


def test_reset_keeps_project_and_registry_when_any_root_is_not_owned(
    tmp_path,
):
    client = FakeLangsmithClient()
    settings = _settings(data_dir=tmp_path)
    backend = LangsmithBackend(settings, client=client)
    store = LangsmithStore(settings, client=client)
    backend.register_experiment("exp-unsafe", "demo", ["owned-root"])
    _add_root(client, "owned-root", "agenteval__exp-unsafe")
    _add_root(
        client,
        "foreign-root",
        "agenteval__exp-unsafe",
        owner=None,
    )

    summary = backend.reset("demo")

    assert summary["experiments"] == 0
    assert summary["traces"] == 1
    assert summary["traces_deleted"] == 0
    assert client.project_delete_attempts == []
    assert {run.id for run in client.runs.values()} == {
        "owned-root",
        "foreign-root",
    }
    assert [item["name"] for item in store.list_experiments()] == [
        "exp-unsafe"
    ]


def test_reset_keeps_project_when_owned_root_is_not_in_registry(tmp_path):
    client = FakeLangsmithClient()
    settings = _settings(data_dir=tmp_path)
    backend = LangsmithBackend(settings, client=client)
    store = LangsmithStore(settings, client=client)
    backend.register_experiment("exp-shared", "demo", ["owned-root"])
    _add_root(client, "owned-root", "agenteval__exp-shared")
    _add_root(client, "unrecorded-root", "agenteval__exp-shared")

    summary = backend.reset("demo")

    assert summary["experiments"] == 0
    assert summary["traces_deleted"] == 0
    assert client.project_delete_attempts == []
    assert [item["name"] for item in store.list_experiments()] == [
        "exp-shared"
    ]


def test_reset_refuses_registry_project_outside_owned_namespace(tmp_path):
    client = FakeLangsmithClient()
    settings = _settings(data_dir=tmp_path)
    backend = LangsmithBackend(settings, client=client)
    store = LangsmithStore(settings, client=client)
    backend.register_experiment("exp-collision", "demo", ["root-foreign"])
    registry_path = tmp_path / "experiments.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    record = next(iter(registry.values()))
    record["remote_project_name"] = "exp-collision"
    registry_path.write_text(
        json.dumps(registry, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    _add_root(client, "root-foreign", "exp-collision")

    summary = backend.reset("demo")

    assert summary["experiments"] == 0
    assert summary["traces_deleted"] == 0
    assert client.project_list_requests == []
    assert client.project_delete_attempts == []
    assert [item["name"] for item in store.list_experiments()] == [
        "exp-collision"
    ]


@pytest.mark.parametrize(
    "failure_name",
    ["dataset_lookup_failures", "example_list_failures", "dataset_delete_failures"],
)
def test_dataset_cleanup_failure_does_not_block_owned_project_cleanup(
    tmp_path, failure_name
):
    client = FakeLangsmithClient()
    settings = _settings(data_dir=tmp_path)
    backend = LangsmithBackend(settings, client=client)
    store = LangsmithStore(settings, client=client)
    backend.create_dataset(
        "demo", [_dataset_item("local-1", "first", "one", "allowed")]
    )
    backend.register_experiment("exp-clean", "demo", ["root-clean"])
    _add_root(client, "root-clean", "agenteval__exp-clean")
    setattr(client, failure_name, 1)

    summary = backend.reset("demo")

    assert summary["dataset_items"] == 0
    assert summary["experiments"] == 1
    assert summary["traces"] == 1
    assert summary["traces_deleted"] == 1
    assert client.project_delete_attempts == ["agenteval__exp-clean"]
    assert store.list_experiments() == []
    remote_dataset_exists = any(
        dataset.name == "agenteval__demo"
        for dataset in client.datasets.values()
    )
    assert remote_dataset_exists is (
        failure_name != "example_list_failures"
    )


def test_project_listing_failure_is_isolated_and_keeps_only_failed_entry(
    tmp_path,
):
    client = FakeLangsmithClient()
    settings = _settings(data_dir=tmp_path)
    backend = LangsmithBackend(settings, client=client)
    store = LangsmithStore(settings, client=client)
    backend.register_experiment("exp-list-fails", "demo", ["root-1"])
    backend.register_experiment("exp-cleans", "demo", ["root-2"])
    _add_root(client, "root-1", "agenteval__exp-list-fails")
    _add_root(client, "root-2", "agenteval__exp-cleans")
    client.project_list_failures["agenteval__exp-list-fails"] = RuntimeError(
        "SDK project list failed"
    )

    summary = backend.reset("demo")

    assert summary["experiments"] == 1
    assert summary["traces"] == 2
    assert summary["traces_deleted"] == 1
    assert client.project_delete_attempts == ["agenteval__exp-cleans"]
    assert [item["name"] for item in store.list_experiments()] == [
        "exp-list-fails"
    ]


def test_list_traces_returns_empty_for_lazy_missing_cloud_project():
    client = FakeLangsmithClient()
    store = LangsmithStore(_settings(), client=client)
    client.project_list_failures["agenteval__fresh-project"] = (
        LangSmithNotFoundError("project does not exist")
    )

    assert store.list_traces(tag="fresh-project") == []
    assert client.project_list_requests == ["agenteval__fresh-project"]


def test_list_traces_surfaces_other_lazy_cloud_read_errors():
    client = FakeLangsmithClient()
    store = LangsmithStore(_settings(), client=client)
    client.project_list_failures["agenteval__broken-project"] = RuntimeError(
        "read failed"
    )

    with pytest.raises(RuntimeError, match="read failed"):
        store.list_traces(tag="broken-project")


def test_list_traces_does_not_hide_not_found_from_trace_read():
    client = FakeLangsmithClient()
    store = LangsmithStore(_settings(), client=client)
    _add_root(client, "root-vanished", "agenteval__exp-vanished")
    client.read_failures = 1

    original_read_run = client.read_run

    def missing_run(run_id):
        try:
            return original_read_run(run_id)
        except KeyError as error:
            raise LangSmithNotFoundError("run vanished") from error

    client.read_run = missing_run

    with pytest.raises(LangSmithNotFoundError, match="run vanished"):
        store.list_traces(tag="exp-vanished")


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
    assert client.runs[trace_id].session_name == "agenteval__exp_test"
    assert (
        client.runs[trace_id].extra["metadata"]["agent_eval_owner"]
        == "AgentEval"
    )
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
        f"https://smith.example/projects/agenteval__exp_test/r/{trace_id}"
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
