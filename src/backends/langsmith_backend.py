"""LangSmith trace writer and normalized trace reader.

The adapter uses only the LangSmith SDK's native ``Client`` API, keeping
LangChain out of the runtime dependency graph.  Client injection makes the
same boundary usable with an in-memory fake in tests.
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from langsmith.utils import LangSmithNotFoundError

from ..models import DatasetItemRecord, ScoreRecord, SpanRecord, TraceRecord
from ..settings import Settings


REMOTE_RESOURCE_PREFIX = "agenteval__"
OWNER_METADATA_KEY = "agent_eval_owner"
OWNER_METADATA_VALUE = "AgentEval"


def _remote_resource_name(public_name: str) -> str:
    """Map a public demo name into AgentEval's private Cloud namespace."""
    return f"{REMOTE_RESOURCE_PREFIX}{public_name}"


def _registry_key(backend: str, public_name: str) -> str:
    return f"{backend}::{public_name}"


def _public_experiment_name(registry_key: str, record: dict) -> str:
    return str(record.get("name") or registry_key)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _client_from(settings: Settings):
    from langsmith import Client

    options: dict[str, str] = {}
    if settings.langsmith_api_key:
        options["api_key"] = settings.langsmith_api_key
    if settings.langsmith_endpoint:
        options["api_url"] = settings.langsmith_endpoint
    if settings.langsmith_workspace_id:
        options["workspace_id"] = settings.langsmith_workspace_id
    return Client(**options)


class _SpanHandle:
    def __init__(self):
        self.output: dict | None = None

    def set_output(self, output: dict) -> None:
        self.output = output


class LangsmithTracer:
    """Create native LangSmith runs while maintaining a thread-local tree."""

    def __init__(self, client):
        self._client = client
        self._local = threading.local()

    def _stack(self) -> list[uuid.UUID]:
        stack = getattr(self._local, "stack", None)
        if stack is None:
            stack = []
            self._local.stack = stack
        return stack

    @contextmanager
    def start_trace(
        self,
        name: str,
        *,
        user_id: str,
        tags: list[str],
        metadata: dict,
    ):
        run_id = uuid.uuid4()
        project_name = _remote_resource_name(tags[0] if tags else name)
        start_time = _now()
        root_metadata = dict(metadata)
        root_metadata["user_id"] = user_id
        root_metadata[OWNER_METADATA_KEY] = OWNER_METADATA_VALUE
        self._local.stack = []
        self._local.trace_id = run_id
        self._local.project_name = project_name
        error: str | None = None
        business_exception: BaseException | None = None
        try:
            self._client.create_run(
                name,
                {},
                "chain",
                id=run_id,
                project_name=project_name,
                start_time=start_time,
                tags=list(tags),
                extra={"metadata": root_metadata},
            )
            self._local.last_trace_id = str(run_id)
            try:
                yield SimpleNamespace(trace_id=str(run_id))
            except BaseException as exc:
                business_exception = exc
                error = f"{type(exc).__name__}: {exc}"
                raise
            finally:
                try:
                    self._client.update_run(
                        run_id,
                        end_time=_now(),
                        error=error,
                    )
                except BaseException:
                    if business_exception is None:
                        raise
        finally:
            self._local.stack = []
            self._local.trace_id = None
            self._local.project_name = None

    @contextmanager
    def span(
        self,
        name: str,
        *,
        input: dict | None = None,
        metadata: dict | None = None,
    ):
        trace_id = getattr(self._local, "trace_id", None)
        if trace_id is None:
            raise RuntimeError("span() requires an active LangSmith trace")

        stack = self._stack()
        parent_id = stack[-1] if stack else trace_id
        run_id = uuid.uuid4()
        self._client.create_run(
            name,
            input or {},
            "chain",
            id=run_id,
            parent_run_id=parent_id,
            project_name=self._local.project_name,
            start_time=_now(),
            extra={"metadata": dict(metadata or {})},
        )
        stack.append(run_id)
        handle = _SpanHandle()
        error: str | None = None
        business_exception: BaseException | None = None
        try:
            yield handle
        except BaseException as exc:
            business_exception = exc
            error = f"{type(exc).__name__}: {exc}"
            raise
        finally:
            update: dict[str, Any] = {"end_time": _now(), "error": error}
            if handle.output is not None:
                update["outputs"] = handle.output
            try:
                try:
                    self._client.update_run(run_id, **update)
                except BaseException:
                    if business_exception is None:
                        raise
            finally:
                if stack and stack[-1] == run_id:
                    stack.pop()
                elif run_id in stack:
                    stack.remove(run_id)

    def flush(self) -> None:
        flush = getattr(self._client, "flush", None)
        if callable(flush):
            flush()
            return
        queue = getattr(self._client, "tracing_queue", None)
        drain = getattr(queue, "join", None)
        if callable(drain):
            drain()

    def last_trace_id(self) -> str | None:
        return getattr(self._local, "last_trace_id", None)


def _value(item, name: str, default=None):
    if isinstance(item, dict):
        return item.get(name, default)
    return getattr(item, name, default)


def _metadata(run) -> dict:
    extra = _value(run, "extra", {}) or {}
    if isinstance(extra, dict) and isinstance(extra.get("metadata"), dict):
        return dict(extra["metadata"])
    return dict(_value(run, "metadata", {}) or {})


def _datetime(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value


class LangsmithBackend:
    def __init__(self, settings: Settings, client=None):
        self._settings = settings
        self._client = client if client is not None else _client_from(settings)
        self._experiments_path = (
            Path(settings.data_dir) / "experiments.json"
        )
        self._feedback_session_ids: dict[str, Any] = {}
        self.tracer = LangsmithTracer(self._client)

    def _find_dataset(self, name: str):
        remote_name = _remote_resource_name(name)
        return next(
            (
                dataset
                for dataset in self._client.list_datasets(
                    dataset_name=remote_name
                )
                if _value(dataset, "name") == remote_name
            ),
            None,
        )

    def create_dataset(
        self,
        name: str,
        items: list[DatasetItemRecord],
        replace: bool = True,
    ) -> None:
        existing = self._find_dataset(name)
        if existing is not None and replace:
            self._client.delete_dataset(dataset_id=_value(existing, "id"))

        dataset = self._client.create_dataset(
            dataset_name=_remote_resource_name(name),
            description="Agent permission compliance evaluation cases",
        )
        if items:
            self._client.create_examples(
                dataset_id=_value(dataset, "id"),
                examples=[
                    {
                        "inputs": item.input,
                        "outputs": item.expected_output,
                        "metadata": item.metadata,
                    }
                    for item in items
                ],
            )

    def get_dataset_items(self, name: str) -> list[DatasetItemRecord]:
        dataset = self._find_dataset(name)
        if dataset is None:
            raise KeyError(
                f"dataset '{name}' not found; run --step generate first"
            )
        return [
            DatasetItemRecord(
                id=str(_value(example, "id")),
                input=_value(example, "inputs") or {},
                expected_output=_value(example, "outputs") or {},
                metadata=_value(example, "metadata") or {},
            )
            for example in self._client.list_examples(
                dataset_id=_value(dataset, "id")
            )
        ]

    def add_dataset_item(
        self, dataset_name: str, item: DatasetItemRecord
    ) -> None:
        dataset = self._find_dataset(dataset_name)
        if dataset is None:
            raise KeyError(f"dataset '{dataset_name}' not found")
        self._client.create_example(
            dataset_id=_value(dataset, "id"),
            inputs=item.input,
            outputs=item.expected_output,
            metadata=item.metadata,
        )

    def save_score(
        self,
        trace_id: str,
        name: str,
        value: float,
        comment: str | None = None,
    ) -> None:
        if trace_id not in self._feedback_session_ids:
            root = self._client.read_run(trace_id)
            self._feedback_session_ids[trace_id] = _value(
                root, "session_id"
            )
        self._client.create_feedback(
            run_id=trace_id,
            key=name,
            score=value,
            comment=comment,
            session_id=self._feedback_session_ids[trace_id],
        )

    def register_experiment(
        self, name: str, dataset: str, trace_ids: list[str]
    ) -> None:
        self._experiments_path.parent.mkdir(parents=True, exist_ok=True)
        experiments = _read_experiments(self._experiments_path)
        owned_trace_ids: list[str] = []
        for registry_key, experiment in list(experiments.items()):
            if (
                experiment.get("backend") == "langsmith"
                and _public_experiment_name(registry_key, experiment) == name
            ):
                owned_trace_ids.extend(
                    str(trace_id)
                    for trace_id in experiment.get("trace_ids", [])
                )
                experiments.pop(registry_key)
        owned_trace_ids.extend(str(trace_id) for trace_id in trace_ids)
        experiments[_registry_key("langsmith", name)] = {
            "name": name,
            "dataset": dataset,
            "trace_ids": list(dict.fromkeys(owned_trace_ids)),
            "created_at": _now().isoformat(),
            "backend": "langsmith",
            "remote_project_name": _remote_resource_name(name),
        }
        self._experiments_path.write_text(
            json.dumps(experiments, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def reset(self, dataset_name: str) -> dict:
        summary = {
            "dataset_items": 0,
            "traces": 0,
            "traces_deleted": 0,
            "experiments": 0,
        }

        try:
            dataset = self._find_dataset(dataset_name)
        except Exception:
            dataset = None
        if dataset is not None:
            dataset_id = _value(dataset, "id")
            dataset_item_count = 0
            try:
                dataset_item_count = len(
                    list(self._client.list_examples(dataset_id=dataset_id))
                )
            except Exception:
                pass
            try:
                self._client.delete_dataset(dataset_id=dataset_id)
            except Exception:
                pass
            else:
                summary["dataset_items"] = dataset_item_count

        experiments = _read_experiments(self._experiments_path)
        langsmith_experiments = {
            registry_key: experiment
            for registry_key, experiment in experiments.items()
            if experiment.get("backend") == "langsmith"
        }
        owned_trace_ids = {
            str(trace_id)
            for experiment in langsmith_experiments.values()
            for trace_id in experiment.get("trace_ids", [])
        }
        summary["traces"] = len(owned_trace_ids)
        remaining = dict(experiments)
        deleted_trace_ids: set[str] = set()

        for registry_key, experiment in langsmith_experiments.items():
            public_name = _public_experiment_name(
                registry_key, experiment
            )
            expected_project_name = _remote_resource_name(public_name)
            project_name = (
                experiment.get("remote_project_name")
                or expected_project_name
            )
            if project_name != expected_project_name:
                continue
            project_owned_ids = {
                str(trace_id)
                for trace_id in experiment.get("trace_ids", [])
            }
            try:
                roots = list(
                    self._client.list_runs(
                        project_name=project_name,
                        is_root=True,
                    )
                )
            except Exception:
                continue

            root_ids = {str(_value(root, "id")) for root in roots}
            if any(
                _metadata(root).get(OWNER_METADATA_KEY)
                != OWNER_METADATA_VALUE
                or str(_value(root, "id")) not in project_owned_ids
                for root in roots
            ):
                continue

            try:
                self._client.delete_project(project_name=project_name)
            except Exception:
                continue

            remaining.pop(registry_key, None)
            deleted_trace_ids.update(root_ids)
            summary["experiments"] += 1

        if remaining:
            self._experiments_path.write_text(
                json.dumps(remaining, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        else:
            self._experiments_path.unlink(missing_ok=True)

        summary["traces_deleted"] = len(deleted_trace_ids)
        return summary


class LangsmithStore:
    def __init__(self, settings: Settings, client=None):
        self._settings = settings
        self._client = client if client is not None else _client_from(settings)
        self._experiments_path = (
            Path(settings.data_dir) / "experiments.json"
        )

    def get_trace(self, trace_id: str, *, retry: bool = True) -> TraceRecord:
        attempts = 20 if retry else 1
        last_error: Exception | None = None
        for attempt in range(attempts):
            try:
                trace = self._get_trace_once(trace_id)
                if retry and not trace.spans:
                    raise RuntimeError(
                        "LangSmith child runs are not available yet"
                    )
                return trace
            except Exception as exc:
                last_error = exc
                if attempt + 1 < attempts:
                    time.sleep(0.5)
        assert last_error is not None
        raise last_error

    def _get_trace_once(self, trace_id: str) -> TraceRecord:
        root = self._client.read_run(trace_id)
        root_id = str(_value(root, "id"))
        runs = list(self._client.list_runs(trace_id=trace_id))
        metadata = _metadata(root)
        metadata.pop(OWNER_METADATA_KEY, None)
        user_id = _value(root, "user_id")
        if user_id is None:
            user_id = metadata.pop("user_id", None)

        spans = [
            SpanRecord(
                id=str(_value(run, "id")),
                parent_id=(
                    str(_value(run, "parent_run_id"))
                    if _value(run, "parent_run_id") is not None
                    else None
                ),
                name=_value(run, "name", "") or "",
                start_time=_datetime(_value(run, "start_time")),
                end_time=_datetime(_value(run, "end_time")),
                input=_value(run, "inputs"),
                output=_value(run, "outputs"),
                metadata=_metadata(run),
            )
            for run in runs
            if str(_value(run, "id")) != root_id
        ]
        feedback = self._client.list_feedback(run_ids=[root_id])
        scores = [
            ScoreRecord(
                name=_value(item, "key", "") or "",
                value=float(_value(item, "score")),
                comment=_value(item, "comment"),
            )
            for item in feedback
            if _value(item, "score") is not None
        ]
        return TraceRecord(
            trace_id=root_id,
            name=_value(root, "name", "") or "",
            user_id=user_id,
            tags=list(_value(root, "tags", []) or []),
            metadata=metadata,
            spans=spans,
            scores=scores,
        )

    def list_traces(self, *, tag: str) -> list[TraceRecord]:
        try:
            roots = list(
                self._client.list_runs(
                    project_name=_remote_resource_name(tag),
                    is_root=True,
                )
            )
        except LangSmithNotFoundError:
            return []
        return [
            self.get_trace(str(_value(root, "id")), retry=False)
            for root in roots
        ]

    def list_experiments(self) -> list[dict]:
        experiments = _read_experiments(self._experiments_path)
        return [
            {
                "name": _public_experiment_name(registry_key, record),
                **record,
            }
            for registry_key, record in experiments.items()
        ]

    def get_trace_url(self, trace_id: str) -> str:
        get_run_url = getattr(self._client, "get_run_url", None)
        if callable(get_run_url):
            try:
                run = self._client.read_run(trace_id)
                project_name = _value(run, "session_name")
                url = get_run_url(run=run, project_name=project_name)
                if url:
                    return str(url)
            except Exception:
                pass
        endpoint = (
            self._settings.langsmith_endpoint
            or "https://api.smith.langchain.com"
        )
        return f"{endpoint.rstrip('/')}/runs/{trace_id}"


def _read_experiments(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))
